// The /onboarding form (new clients, after they said yes on the call).
//
// Public (no login). For one submission it:
//   1. checks the answers and saves them (onboarding_submissions), with the
//      photo and logo in Storage;
//   2. creates their account: phone + a random first password, the profile
//      (name, agency, area, photo, logo), the pipelines, and the answers in
//      the account's Brief (client_dossiers). A number that already has an
//      account is left as it is;
//   3. sends their login on WhatsApp (TextMeBot) and email (Resend). On first
//      login /welcome makes them choose their own password;
//   4. tells the admin (WhatsApp + Discord), like the /start sign-ups.
// Returns the private code for their "what happens next" page.
//
// Double taps: the same number again within 10 minutes gets the first
// submission's code back; nothing is created twice.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const APP = "https://leads.estatekit.co";
const FROM_ADDRESS = "hello@mail.estatekit.co";
// Keep in step with src/lib/contact.ts.
const ADMIN_WHATSAPP = "264858149056";
const CAMPAIGNS = ["Sellers", "Buyers", "Sellers and buyers", "Agents to recruit"];
const MAX_IMAGE = 2 * 1024 * 1024;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-client-info, apikey",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const str = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** The same rules as the login page (src/pages/LoginPage.tsx normalizePhone). */
function normalizePhone(raw: string): string {
  const d = raw.replace(/[\s\-()]/g, "");
  if (d.startsWith("0") && d.length === 10) return "+27" + d.slice(1);
  if (d.startsWith("27") && d.length === 11) return "+" + d;
  if (d.startsWith("+")) return d;
  if (/^\d{9,15}$/.test(d)) return "+" + d;
  return d;
}

/** 8 letters and numbers, without ones that look alike (0/O, 1/l). */
function firstPassword(): string {
  const abc = "abcdefghjkmnpqrstuvwxyz23456789";
  const r = crypto.getRandomValues(new Uint8Array(8));
  return [...r].map((b) => abc[b % abc.length]).join("");
}

const hex = (n: number) => [...crypto.getRandomValues(new Uint8Array(n))].map((b) => b.toString(16).padStart(2, "0")).join("");

async function secret(name: string): Promise<string> {
  const { data } = await admin.rpc("get_secret", { secret_name: name });
  return data || "";
}

async function sendWhatsApp(to: string, text: string): Promise<string> {
  const apiKey = Deno.env.get("TEXTMEBOT_API_KEY");
  if (!apiKey) return "not_configured";
  const url = `https://api.textmebot.com/send.php?recipient=${to}&apikey=${apiKey}&text=${encodeURIComponent(text)}`;
  // One message per 5s per account, shared with the automations: one retry after the window.
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(url);
    if (res.ok) return "sent";
    const body = await res.text();
    console.error("TextMeBot send failed", res.status, body);
    if (!/messages? per \d+ seconds?/i.test(body)) return "failed";
    await new Promise((r) => setTimeout(r, 6000));
  }
  return "rate_limited";
}

async function sendEmail(to: string, subject: string, text: string, html: string): Promise<string> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) return "not_configured";
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: `EstateKit <${FROM_ADDRESS}>`, to: [to], subject, text, html }),
  });
  if (!res.ok) console.error("Resend failed", res.status, await res.text());
  return res.ok ? "sent" : "failed";
}

/** "data:image/webp;base64,…" → the file in the public logos bucket. */
async function saveImage(dataUrl: string, path: string): Promise<string | null> {
  const m = /^data:(image\/(?:webp|jpeg|png));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl || "");
  if (!m) return null;
  const bytes = Uint8Array.from(atob(m[2]), (c) => c.charCodeAt(0));
  if (bytes.length > MAX_IMAGE) return null;
  const ext = m[1].split("/")[1].replace("jpeg", "jpg");
  const { error } = await admin.storage.from("logos").upload(`${path}.${ext}`, bytes, { contentType: m[1], upsert: true, cacheControl: "31536000" });
  if (error) { console.error("image upload", error.message); return null; }
  return admin.storage.from("logos").getPublicUrl(`${path}.${ext}`).data.publicUrl;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  try {
    const b = await req.json();
    const f = {
      name: str(b.name, 80),
      email: str(b.email, 120).toLowerCase(),
      phone: normalizePhone(str(b.phone, 20)),
      agency: str(b.agency, 120),
      website: str(b.website, 200),
      address: str(b.address, 300),
      campaign: str(b.campaign, 40),
      city: str(b.city, 80),
      suburbs: (Array.isArray(b.suburbs) ? b.suburbs : []).map((x: unknown) => str(x, 60)).filter(Boolean).slice(0, 5) as string[],
      price: str(b.price, 60),
      deals: str(b.deals, 40),
      offer: str(b.offer, 500),
    };
    const digits = f.phone.replace(/\D/g, "");
    if (f.name.length < 2) return json({ error: "name" }, 400);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email)) return json({ error: "email" }, 400);
    if (!/^\+\d{9,15}$/.test(f.phone)) return json({ error: "phone" }, 400);
    if (f.agency.length < 2) return json({ error: "agency" }, 400);
    if (!CAMPAIGNS.includes(f.campaign)) return json({ error: "campaign" }, 400);
    if (!f.suburbs.length) return json({ error: "suburbs" }, 400);

    // A double tap (or a second go) within 10 minutes: the first one stands.
    const { data: recent } = await admin
      .from("onboarding_submissions")
      .select("token, account_status")
      .eq("phone", f.phone)
      .gt("created_at", new Date(Date.now() - 10 * 60_000).toISOString())
      .order("created_at", { ascending: false })
      .limit(1);
    if (recent?.[0]) return json({ token: recent[0].token, account: recent[0].account_status });

    const id = crypto.randomUUID();
    const token = hex(16);
    const [headshot, logo] = await Promise.all([
      saveImage(String(b.headshot || ""), `onboarding/${id}/headshot`),
      saveImage(String(b.logo || ""), `onboarding/${id}/logo`),
    ]);

    const { error: insErr } = await admin.from("onboarding_submissions").insert({
      id, token, name: f.name, email: f.email, phone: f.phone, agency: f.agency, website: f.website || null,
      business_address: f.address || null, campaign: f.campaign, city: f.city || null, suburbs: f.suburbs,
      price_range: f.price || null, deals_closed: f.deals || null, special_offer: f.offer || null,
      headshot_url: headshot, logo_url: logo,
    });
    if (insErr) { console.error("insert", insErr.message); return json({ error: "save" }, 500); }

    // The account. Same login as every agent: the phone as <digits>@estatekit.app.
    const password = firstPassword();
    let agentId: string | null = null;
    let account = "failed";
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email: `${digits}@estatekit.app`,
      password,
      email_confirm: true,
      phone: f.phone,
      user_metadata: { display_name: f.name },
    });
    if (created?.user) {
      agentId = created.user.id;
      const { error: profErr } = await admin.from("agent_profiles").upsert({
        agent_id: agentId, display_name: f.name, email: f.email, whatsapp_number: f.phone, area: f.city || f.suburbs[0] || "",
        company: f.agency, is_operator: false, fb_page_id: "", fb_ad_account_id: "",
        ...(headshot ? { avatar_url: headshot } : {}), ...(logo ? { sidebar_logo_url: logo } : {}),
      });
      if (profErr) console.error("profile", profErr.message);
      const pipes = [{ agent_id: agentId, name: "Seller", kind: "seller" }, { agent_id: agentId, name: "Buyer", kind: "buyer" }];
      if (f.campaign === "Agents to recruit") pipes.push({ agent_id: agentId, name: "Recruitment", kind: "general" });
      const { error: pipeErr } = await admin.from("pipelines").insert(pipes);
      if (pipeErr) console.error("pipelines", pipeErr.message);
      // Their answers in the account's Brief, under its standard labels (src/lib/brief.ts).
      const answers = [
        ["Wants more", f.campaign], ["City or town", f.city], ["Top suburbs", f.suburbs.join(", ")], ["Agency", f.agency],
        ["Deals closed in the last 6 months", f.deals], ["Average home price", f.price], ["Special offer", f.offer],
        ["Website", f.website], ["Business address", f.address],
        ["Submitted", new Date().toLocaleDateString("en-ZA", { timeZone: "Africa/Johannesburg", day: "numeric", month: "short", year: "numeric" })],
      ].filter(([, a]) => a).map(([q, a]) => ({ q, a }));
      // The whole record's shape (src/api/clients.ts ClientDossier), not just the answers.
      const { error: dosErr } = await admin.from("client_dossiers").upsert({
        agent_id: agentId,
        data: {
          contact: { phones: [f.phone], emails: [f.email], contactPerson: null, team: null, socials: null },
          billing: null, package: null, audit: null, onboarding: answers, onboardingExtra: null, oldDashboard: null,
        },
        updated_at: new Date().toISOString(),
      });
      if (dosErr) console.error("dossier", dosErr.message);
      account = profErr ? "failed" : "created";
    } else if (/already|registered|exists/i.test(createErr?.message || "")) {
      account = "existing";
      const { data: prof } = await admin.from("agent_profiles").select("agent_id").eq("whatsapp_number", f.phone).maybeSingle();
      agentId = prof?.agent_id ?? null;
    } else {
      console.error("create user", createErr?.message);
    }

    // Their login.
    const first = f.name.split(/\s+/)[0];
    const login = `${APP}/login`;
    let waText: string, subject: string, text: string;
    if (account === "created") {
      waText = `Hi ${first}, welcome to EstateKit! 🎉\n\nYour account is ready. Log in here:\n${login}\n\nPhone: ${f.phone}\nPassword: ${password}\n\nYou'll choose your own password when you first log in.`;
      subject = "Your EstateKit login";
      text = `Hi ${first},\n\nWelcome to EstateKit! Your account is ready.\n\nLog in: ${login}\nPhone: ${f.phone}\nPassword: ${password}\n\nYou'll choose your own password when you first log in.\n\nThe EstateKit team`;
    } else if (account === "existing") {
      waText = `Hi ${first}, we've got your onboarding details, thank you! You already have an EstateKit account with this number: log in at ${login}`;
      subject = "We've got your details";
      text = `Hi ${first},\n\nWe've got your onboarding details, thank you! You already have an EstateKit account with this number. Log in at ${login}\n\nThe EstateKit team`;
    } else {
      waText = `Hi ${first}, we've got your onboarding details, thank you! We'll WhatsApp you your login shortly.`;
      subject = "We've got your details";
      text = `Hi ${first},\n\nWe've got your onboarding details, thank you! We'll send you your login shortly.\n\nThe EstateKit team`;
    }
    const html = `<!doctype html><html><body style="margin:0;padding:16px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.55;color:#222">${text
      .split("\n\n").map((p) => `<p style="margin:0 0 14px">${esc(p).replace(/\n/g, "<br>").replace(/https?:\/\/\S+/g, (u) => `<a href="${u}" style="color:#1a73e8">${u}</a>`)}</p>`).join("")}</body></html>`;
    const [wa, mail] = await Promise.all([sendWhatsApp(digits, waText), sendEmail(f.email, subject, text, html)]);
    await admin.from("onboarding_submissions").update({ agent_id: agentId, account_status: account, login_sent: `whatsapp ${wa}, email ${mail}` }).eq("id", id);

    // The admin.
    const lines = [
      `✅ *New onboarding form*`, ``,
      `*${f.name}* · ${f.agency}`, `📱 ${f.phone}`, `✉️ ${f.email}`,
      `🎯 ${f.campaign}`, `📍 ${[f.city, f.suburbs.join(", ")].filter(Boolean).join(": ")}`,
      f.price ? `💰 ${f.price}` : "", f.deals ? `🤝 Deals (6 months): ${f.deals}` : "",
      `👤 Account: ${account === "created" ? "created, login sent" : account === "existing" ? "already had one" : "NOT created, set it up by hand"}`,
      agentId ? `${APP}/admin/clients/${agentId}` : `${APP}/admin/clients`,
    ].filter((l) => l !== "");
    const adminText = lines.join("\n");
    // After the reply: the new client doesn't wait on our notice (WhatsApp
    // allows one message per 5 seconds, so it may wait its turn).
    const notify = (async () => {
      const hook = (await secret("DISCORD_SIGNUP_WEBHOOK")) || (await secret("DISCORD_ACTIVITY_WEBHOOK"));
      await Promise.all([
        sendWhatsApp(ADMIN_WHATSAPP, adminText),
        hook ? fetch(hook, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content: adminText.replace(/\*/g, "**") }) }).catch(() => null) : null,
      ]);
    })().catch((e) => console.error("admin notice", e));
    (globalThis as unknown as { EdgeRuntime?: { waitUntil: (p: Promise<unknown>) => void } }).EdgeRuntime?.waitUntil(notify);

    return json({ token, account });
  } catch (err) {
    console.error(err);
    return json({ error: "server" }, 500);
  }
});
