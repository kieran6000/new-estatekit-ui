// /l/<token> for link-preview bots only (vercel.json sends nobody else here):
// the app's page with the lead's name, area and a picture, so the link shows
// as a card in WhatsApp or Discord. Agents opening the link never come
// through here. get_shared_lead only reads, so a preview isn't an open.

import { ogImage, originOf, withPreview } from "./_og/preview.js";

const SUPABASE = "https://yfcnsvrhojpysrzqrkdi.supabase.co";

const WORD = {
  "New Lead": "New lead", "No Answer": "Call again", Contacted: "Follow up", Booked: "Booked",
  "Viewing Booked": "Viewing booked", "Offer Made": "Offer made", "Mandate Signed": "Mandate signed",
  Bought: "Bought", Lost: "Lost", "Invalid Number": "Wrong number",
};

async function lookUp(token) {
  const key = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
  if (!key || !/^[a-z0-9]{8,32}$/i.test(token)) return null;
  try {
    const res = await fetch(`${SUPABASE}/rest/v1/rpc/get_shared_lead`, {
      method: "POST",
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ p_token: token }),
      signal: AbortSignal.timeout(2500),
    });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

/** Their answer to the address question, if the form asked. */
const addressOf = (lead) => {
  const a = (Array.isArray(lead?.form_answers) ? lead.form_answers : []).find((x) => /address|where/i.test(String(x?.q ?? "")));
  return a?.a ? String(a.a).trim() : "";
};

export default async function handler(req, res) {
  const token = String(req.query.token ?? "");
  const origin = originOf(req);
  try {
    const [page, data] = await Promise.all([fetch(`${origin}/index.html`), lookUp(token)]);
    if (!page.ok) throw new Error(`index.html ${page.status}`);
    const lead = data?.lead;
    const name = String(lead?.name ?? "").trim();
    const word = WORD[lead?.stage] ?? "Lead";
    const where = addressOf(lead);
    const text = name
      ? { title: `${name} · ${word}`, description: `${where ? `${where}. ` : ""}Tap to call, then log what happened.` }
      : { title: "A lead from EstateKit", description: "Tap to call, then log what happened." };
    const image = ogImage(origin, { t: "lead", n: name, s: where, w: name ? word : "" });
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "private, no-store");
    res.status(200).send(withPreview(await page.text(), text, `${origin}/l/${token}`, image));
  } catch (err) {
    console.error("lead page failed", err);
    res.redirect(302, "/");
  }
}
