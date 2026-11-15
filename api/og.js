// Pictures for links and Discord, drawn on request:
//   /api/og?t=new_lead|contacted|booked|viewing|offer|mandate|bought|lost|not_owner|invalid|checkin
//     Discord activity banners (1200×480): who → what happened.
//   /api/og?t=contract|invoice|lead
//     Link previews (1200×630) for WhatsApp, Discord, iMessage and the rest.
// Text comes in the address (n name, s line under it, a agent, c company,
// r reference, ok=1 signed), trimmed short. Same address, same picture, so
// it's cached for good.

import { ImageResponse } from "@vercel/og";

export const config = { runtime: "edge" };

// ── Fonts ──────────────────────────────────────────────────────────────────
let fontsP;
const loadFonts = () =>
  (fontsP ??= Promise.all(
    [500, 700, 800].map(async (weight) => ({
      name: "Inter",
      weight,
      style: "normal",
      data: await (await fetch(new URL(`./_og/inter-${weight}.woff`, import.meta.url))).arrayBuffer(),
    })),
  ).catch(() => null));

// ── Drawing helpers ────────────────────────────────────────────────────────
const h = (style, ...children) => ({
  type: "div",
  props: { style: { display: "flex", ...style }, children: children.flat().filter((c) => c !== null && c !== undefined && c !== false && c !== "") },
});
const svg = (d, size, color, extra = {}) => ({
  type: "svg",
  props: { width: size, height: size, viewBox: "0 0 24 24", style: { flexShrink: 0, ...extra }, children: [{ type: "path", props: { d, fill: color } }] },
});
const clean = (v, max) => {
  // Control characters out on purpose: names come from forms.
  // eslint-disable-next-line no-control-regex
  const s = String(v ?? "").replace(/[\u0000-\u001f\u007f<>]/g, " ").replace(/\s+/g, " ").trim();
  return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s;
};
const initials = (n) => (n.split(" ").filter((w) => /\p{L}/u.test(w)).slice(0, 2).map((w) => w.match(/\p{L}/u)[0]).join("") || "?").toUpperCase();
const nameSize = (n, big) => (n.length <= 12 ? big : n.length <= 16 ? big * 0.86 : n.length <= 20 ? big * 0.76 : big * 0.66);

// Material icons, 24×24.
const I = {
  person: "M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z",
  form: "M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z",
  event: "M17 12h-5v5h5v-5zM16 1v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2h-1V1h-2zm3 18H5V8h14v11z",
  home: "M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z",
  trophy: "M19 5h-2V3H7v2H5c-1.1 0-2 .9-2 2v1c0 2.55 1.92 4.63 4.39 4.94.63 1.5 1.98 2.63 3.61 2.96V19H7v2h10v-2h-4v-3.1c1.63-.33 2.98-1.46 3.61-2.96C19.08 12.63 21 10.55 21 8V7c0-1.1-.9-2-2-2zM5 8V7h2v3.82C5.84 10.4 5 9.3 5 8zm14 0c0 1.3-.84 2.4-2 2.82V7h2v1z",
  chat: "M20 2H4c-1.1 0-1.99.9-1.99 2L2 22l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM6 9h12v2H6V9zm8 5H6v-2h8v2zm4-6H6V6h12v2z",
  block: "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zM4 12c0-4.42 3.58-8 8-8 1.85 0 3.55.63 4.9 1.69L5.69 16.9C4.63 15.55 4 13.85 4 12zm8 8c-1.85 0-3.55-.63-4.9-1.69L18.31 7.1C19.37 8.45 20 10.15 20 12c0 4.42-3.58 8-8 8z",
  personOff: "M8.65 5.82C9.36 4.72 10.6 4 12 4c2.21 0 4 1.79 4 4 0 1.4-.72 2.64-1.82 3.35L8.65 5.82zM20 17.17c-.02-1.1-.63-2.11-1.61-2.62-.54-.28-1.13-.54-1.77-.76L20 17.17zm1.19 4.02L2.81 2.81 1.39 4.22l8.89 8.89c-1.81.23-3.39.79-4.67 1.45C4.61 15.07 4 16.1 4 17.22V20h13.17l2.61 2.61 1.41-1.42z",
  phoneOff: "M17.34 14.54l-1.43-1.43c.56-.73 1.05-1.5 1.47-2.32l-2.2-2.2c-.28-.28-.36-.67-.25-1.02.37-1.12.57-2.32.57-3.57 0-.55.45-1 1-1H20c.55 0 1 .45 1 1 0 3.98-1.37 7.64-3.66 10.54zm-2.82 2.81C11.63 19.64 7.97 21 4 21c-.55 0-1-.45-1-1v-3.49c0-.55.45-1 1-1 1.24 0 2.45-.2 3.57-.57.35-.12.75-.03 1.02.24l2.2 2.2c.81-.42 1.58-.9 2.3-1.46L1.39 4.22l1.42-1.41L21.19 21.2l-1.41 1.41-5.26-5.26z",
  offer: "M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm1 10h-4v1h3c.55 0 1 .45 1 1v3c0 .55-.45 1-1 1h-1v1h-2v-1H9v-2h4v-1h-3c-.55 0-1-.45-1-1v-3c0-.55.45-1 1-1h1V8h2v1h2v2zm-2-4V3.5L17.5 8H13z",
  key: "M12.65 10C11.83 7.67 9.61 6 7 6c-3.31 0-6 2.69-6 6s2.69 6 6 6c2.61 0 4.83-1.67 5.65-4H17v4h4v-4h2v-4H12.65zM7 14c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z",
  eye: "M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z",
  star: "M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z",
  arrow: "M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z",
  check: "M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z",
  phone: "M20.01 15.38c-1.23 0-2.42-.2-3.53-.56-.35-.12-.74-.03-1.01.24l-1.57 1.97c-2.83-1.35-5.48-3.9-6.89-6.83l1.95-1.66c.27-.28.35-.67.24-1.02-.37-1.11-.56-2.3-.56-3.53 0-.54-.45-.99-.99-.99H4.19C3.65 3 3 3.24 3 3.99 3 13.28 10.73 21 20.01 21c.71 0 .99-.63.99-1.18v-3.45c0-.54-.45-.99-.99-.99z",
  pin: "M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z",
};

const brand = (color = "#fff", size = 28) =>
  h({ alignItems: "center", gap: Math.round(size * 0.4) }, svg(I.home, Math.round(size * 1.15), color), h({ fontSize: size, fontWeight: 800, color, letterSpacing: -0.5 }, "EstateKit"));

const pill = (text, iconD, bg = "rgba(255,255,255,0.16)", color = "#fff") =>
  h(
    { alignItems: "center", gap: 12, alignSelf: "flex-start", background: bg, border: "2px solid rgba(255,255,255,0.26)", borderRadius: 999, padding: "9px 22px 9px 14px", fontSize: 24, fontWeight: 700, letterSpacing: 2.5, color },
    iconD ? svg(iconD, 28, color) : null,
    text.toUpperCase(),
  );

const glow = (style) => h({ position: "absolute", borderRadius: 9999, ...style });

// Confetti for wins: fixed spots, so the picture is the same every time.
const CONFETTI = [
  [70, 40, 18, 8, 25, "#fde68a"], [210, 380, 14, 14, 0, "#ffffff"], [330, 30, 22, 9, -30, "#fecaca"], [520, 420, 16, 7, 50, "#bbf7d0"],
  [600, 60, 12, 12, 0, "#fde68a"], [760, 420, 20, 8, -15, "#ffffff"], [880, 40, 16, 7, 40, "#bfdbfe"], [1010, 400, 14, 14, 0, "#fecaca"],
  [1130, 90, 20, 8, -40, "#ffffff"], [1150, 300, 12, 12, 0, "#fde68a"], [460, 200, 10, 10, 0, "rgba(255,255,255,0.7)"], [40, 250, 16, 7, 60, "#fde68a"],
  [950, 230, 10, 10, 0, "rgba(255,255,255,0.8)"], [690, 250, 18, 7, 20, "#fef3c7"], [1080, 190, 9, 9, 0, "#bbf7d0"], [150, 160, 9, 9, 0, "#ffffff"],
];
const confetti = () => CONFETTI.map(([x, y, w, hh, r, c]) => h({ position: "absolute", left: x, top: y, width: w, height: hh, borderRadius: w === hh ? 9999 : 3, background: c, transform: `rotate(${r}deg)`, opacity: 0.9 }));

// ── Discord banners ────────────────────────────────────────────────────────
const SLATE = ["#64748b", "#334155", "#1e293b"];
const BANNERS = {
  new_lead: { label: "New lead", icon: I.person, grad: ["#34d399", "#059669", "#064e3b"], from: I.form },
  contacted: { label: "Spoke · following up", icon: I.chat, grad: ["#38bdf8", "#2563eb", "#1e3a8a"] },
  booked: { label: "Appointment booked", icon: I.event, grad: ["#a78bfa", "#6d28d9", "#3b0764"] },
  viewing: { label: "Viewing booked", icon: I.eye, grad: ["#a78bfa", "#6d28d9", "#3b0764"] },
  offer: { label: "Offer made", icon: I.offer, grad: ["#2dd4bf", "#0d9488", "#134e4a"] },
  mandate: { label: "Mandate signed", icon: I.home, grad: ["#fcd34d", "#f59e0b", "#c2410c"], win: true },
  bought: { label: "Bought", icon: I.key, grad: ["#fcd34d", "#f59e0b", "#c2410c"], win: true },
  lost: { label: "Not selling", icon: I.block, grad: SLATE },
  not_owner: { label: "Not the owner", icon: I.personOff, grad: SLATE },
  invalid: { label: "Wrong number", icon: I.phoneOff, grad: SLATE },
  checkin: { label: "Check-in answered", icon: I.star, grad: ["#f472b6", "#db2777", "#701a75"] },
};

function banner(kind, q) {
  const b = BANNERS[kind];
  const name = clean(q.get("n"), 28) || "A lead";
  const sub = clean(q.get("s"), 36);
  const agent = clean(q.get("a"), 30);
  const company = clean(q.get("c"), 30);
  // A recruitment pipeline's own words for the same stage ("Signed up").
  const label = clean(q.get("l"), 26) || b.label;
  const [c1, c2, c3] = b.grad;
  const tile = (child, size, extra = {}) =>
    h({ width: size, height: size, borderRadius: size * 0.27, background: "#fff", alignItems: "center", justifyContent: "center", boxShadow: "0 24px 48px rgba(0,0,0,0.28)", position: "relative", ...extra }, child);
  const avatar = h(
    { width: 150, height: 150, borderRadius: 9999, background: "#fff", alignItems: "center", justifyContent: "center", border: "6px solid rgba(255,255,255,0.45)", boxShadow: "0 24px 48px rgba(0,0,0,0.28)", fontSize: 58, fontWeight: 800, color: c2, letterSpacing: -1 },
    initials(name),
  );
  const flow = h({ alignItems: "center", gap: 10 },
    h({ width: 10, height: 10, borderRadius: 9999, background: "rgba(255,255,255,0.55)" }),
    h({ width: 10, height: 10, borderRadius: 9999, background: "rgba(255,255,255,0.75)" }),
    svg(I.arrow, 54, "#fff"),
  );
  const outcome = tile(
    [
      svg(b.icon, 96, c2),
      b.win ? h({ position: "absolute", top: -22, right: -22, width: 64, height: 64, borderRadius: 9999, background: "#16a34a", border: "5px solid #fff", alignItems: "center", justifyContent: "center", boxShadow: "0 10px 20px rgba(0,0,0,0.25)" }, svg(I.trophy, 32, "#fff")) : null,
    ],
    172,
  );
  const motif = kind === "new_lead"
    ? [tile(svg(I.form, 78, c2), 136), flow, avatar]
    : [avatar, flow, outcome];

  return h(
    { width: 1200, height: 480, position: "relative", overflow: "hidden", padding: "52px 64px", fontFamily: "Inter", color: "#fff", alignItems: "center", justifyContent: "space-between", backgroundImage: `linear-gradient(135deg, ${c1} 0%, ${c2} 52%, ${c3} 100%)` },
    glow({ width: 560, height: 560, top: -240, right: -150, background: "rgba(255,255,255,0.10)" }),
    glow({ width: 340, height: 340, bottom: -200, left: 300, background: "rgba(255,255,255,0.07)" }),
    b.win ? confetti() : null,
    h({ position: "absolute", top: 40, right: 60 }, brand("rgba(255,255,255,0.92)", 24)),
    h(
      { flexDirection: "column", width: 560, height: "100%", justifyContent: "center" },
      pill(label, b.icon),
      h({ marginTop: 22, fontSize: nameSize(name, 80), fontWeight: 800, lineHeight: 1.04, letterSpacing: -2 }, name),
      sub ? h({ marginTop: 12, fontSize: 30, fontWeight: 500, color: "rgba(255,255,255,0.88)" }, sub) : null,
      agent
        ? h(
            { marginTop: 30, alignItems: "center", gap: 14 },
            h({ width: 46, height: 46, borderRadius: 9999, background: "rgba(255,255,255,0.22)", border: "2px solid rgba(255,255,255,0.4)", alignItems: "center", justifyContent: "center", fontSize: 19, fontWeight: 800 }, initials(agent)),
            h({ flexDirection: "column" },
              h({ fontSize: 25, fontWeight: 700 }, agent),
              company ? h({ fontSize: 20, fontWeight: 500, color: "rgba(255,255,255,0.75)" }, company) : null,
            ),
          )
        : null,
    ),
    h({ alignItems: "center", gap: 18, marginTop: 40 }, motif),
  );
}

// ── Link previews ──────────────────────────────────────────────────────────
const bar = (w, color = "#e2e8f0", hh = 10) => h({ width: w, height: hh, borderRadius: 6, background: color });
const cta = (text, iconD, done) =>
  h(
    { alignSelf: "flex-start", alignItems: "center", gap: 12, marginTop: 34, padding: "16px 28px", borderRadius: 999, background: done ? "#22c55e" : "#fff", color: done ? "#fff" : "#0f172a", fontSize: 28, fontWeight: 800, boxShadow: "0 16px 32px rgba(0,0,0,0.25)" },
    text,
    svg(iconD, 30, done ? "#fff" : "#0f172a"),
  );
const card = (grad, left, right) =>
  h(
    { width: 1200, height: 630, position: "relative", overflow: "hidden", fontFamily: "Inter", color: "#fff", padding: "56px 0 0 72px", backgroundImage: grad },
    glow({ width: 700, height: 700, top: -260, right: -200, background: "rgba(255,255,255,0.08)" }),
    glow({ width: 380, height: 380, bottom: -240, left: -100, background: "rgba(255,255,255,0.06)" }),
    h({ flexDirection: "column", width: 600 }, brand("#fff", 28), left),
    right,
  );

function contract(q) {
  const who = clean(q.get("n"), 30);
  const ref = clean(q.get("r"), 24);
  const signed = q.get("ok") === "1";
  const paper = h(
    { position: "absolute", right: 70, top: 64, width: 400, height: 540, flexDirection: "column", background: "#fff", borderRadius: 18, padding: "34px 34px", color: "#0f172a", boxShadow: "0 40px 80px rgba(0,0,0,0.45)", transform: "rotate(4deg)" },
    h({ justifyContent: "space-between", alignItems: "center" }, h({ fontSize: 17, fontWeight: 800, letterSpacing: 3, color: "#0b5bd3" }, "ESTATEKIT"), h({ fontSize: 14, fontWeight: 700, color: "#94a3b8" }, ref || "AGREEMENT")),
    h({ height: 4, background: "#0f172a", marginTop: 14, borderRadius: 2 }),
    h({ marginTop: 22, fontSize: 30, fontWeight: 800, letterSpacing: -0.5 }, "Service Agreement"),
    h({ marginTop: 18, flexDirection: "column", gap: 12 }, bar(330), bar(300), bar(320), bar(250), bar(310), bar(180)),
    h({ marginTop: "auto", flexDirection: "column" },
      h({ fontSize: 14, fontWeight: 700, color: "#94a3b8", letterSpacing: 1.5 }, "SIGNATURE"),
      {
        type: "svg",
        props: { width: 230, height: 64, viewBox: "0 0 230 64", style: { marginTop: 4 }, children: [{ type: "path", props: { d: "M8 46 C 14 20, 26 6, 32 18 C 38 30, 20 50, 28 54 C 38 58, 48 26, 56 30 C 62 34, 54 50, 63 50 C 73 50, 80 28, 88 33 C 94 37, 89 48, 97 48 C 108 48, 116 18, 125 24 C 131 29, 123 46, 133 46 C 150 46, 158 32, 174 35 C 190 38, 198 30, 222 20", fill: "none", stroke: signed ? "#1d4ed8" : "#cbd5e1", strokeWidth: 4, strokeLinecap: "round" } }] },
      },
      h({ height: 2, background: "#94a3b8", marginTop: 2 }),
      h({ marginTop: 8, fontSize: 15, fontWeight: 700, color: "#475569" }, who || "Client"),
    ),
    signed
      ? h({ position: "absolute", right: 26, top: 170, width: 150, height: 150, borderRadius: 9999, border: "7px solid #16a34a", color: "#16a34a", alignItems: "center", justifyContent: "center", flexDirection: "column", transform: "rotate(-16deg)", background: "rgba(255,255,255,0.9)" }, svg(I.check, 46, "#16a34a"), h({ fontSize: 24, fontWeight: 800, letterSpacing: 2 }, "SIGNED"))
      : h({ position: "absolute", right: -30, bottom: 104, alignItems: "center", gap: 8, background: "#facc15", color: "#422006", fontSize: 20, fontWeight: 800, padding: "12px 18px 12px 16px", borderRadius: "12px 0 0 12px", boxShadow: "0 10px 20px rgba(0,0,0,0.25)" }, svg(I.arrow, 24, "#422006"), "SIGN HERE"),
  );
  return card(
    "linear-gradient(135deg, #0b1324 0%, #0e2a63 55%, #0b5bd3 100%)",
    h({ flexDirection: "column", marginTop: 54 },
      pill("Agreement", I.form),
      h({ marginTop: 24, fontSize: 70, fontWeight: 800, lineHeight: 1.04, letterSpacing: -2 }, "Service Agreement"),
      who ? h({ marginTop: 16, fontSize: 32, fontWeight: 500, color: "rgba(255,255,255,0.9)" }, `${signed ? "Signed by" : "Prepared for"} ${who}`) : null,
      cta(signed ? "Signed" : "Read & sign", signed ? I.check : I.arrow, signed),
    ),
    paper,
  );
}

function invoice() {
  const row = (w) => h({ justifyContent: "space-between", alignItems: "center", marginTop: 16 }, bar(w), bar(70, "#cbd5e1"));
  const paper = h(
    { position: "absolute", right: 76, top: 70, width: 390, height: 520, flexDirection: "column", background: "#fff", borderRadius: 18, padding: 34, color: "#0f172a", boxShadow: "0 40px 80px rgba(0,0,0,0.45)", transform: "rotate(-4deg)" },
    h({ justifyContent: "space-between", alignItems: "flex-start" },
      h({ flexDirection: "column" }, h({ fontSize: 34, fontWeight: 800, letterSpacing: 1 }, "INVOICE"), h({ marginTop: 8 }, bar(120, "#e2e8f0", 9))),
      h({ padding: "6px 10px", borderRadius: 8, background: "#eef2ff", alignItems: "center" }, svg(I.home, 26, "#4338ca")),
    ),
    h({ marginTop: 26, gap: 14 }, h({ flexDirection: "column", gap: 8 }, bar(90, "#cbd5e1", 8), bar(130)), h({ flexDirection: "column", gap: 8, marginLeft: 40 }, bar(70, "#cbd5e1", 8), bar(100))),
    h({ height: 2, background: "#e2e8f0", marginTop: 28 }),
    row(170), row(140), row(190),
    h({ height: 2, background: "#e2e8f0", marginTop: 22 }),
    h({ justifyContent: "space-between", alignItems: "center", marginTop: 18 }, h({ fontSize: 22, fontWeight: 800 }, "Total"), bar(120, "#4338ca", 16)),
    h({ marginTop: "auto", alignItems: "center", justifyContent: "center", height: 54, borderRadius: 12, background: "#4338ca", color: "#fff", fontSize: 20, fontWeight: 800, letterSpacing: 1 }, "VIEW INVOICE"),
  );
  return card(
    "linear-gradient(135deg, #1e1b4b 0%, #3730a3 55%, #6366f1 100%)",
    h({ flexDirection: "column", marginTop: 54 },
      pill("Invoice", I.form),
      h({ marginTop: 24, fontSize: 74, fontWeight: 800, lineHeight: 1.04, letterSpacing: -2 }, "Your invoice"),
      h({ marginTop: 16, fontSize: 32, fontWeight: 500, color: "rgba(255,255,255,0.9)" }, "From EstateKit. Open it to see the amount and how to pay."),
      cta("View invoice", I.arrow, false),
    ),
    paper,
  );
}

function lead(q) {
  const name = clean(q.get("n"), 26) || "Your lead";
  const sub = clean(q.get("s"), 40);
  const what = clean(q.get("w"), 22) || "Lead";
  const first = name.split(" ")[0].toUpperCase();
  const phone = h(
    { position: "absolute", right: 96, top: 54, width: 340, height: 660, borderRadius: 54, background: "#0b1220", padding: 14, boxShadow: "0 40px 90px rgba(0,0,0,0.5)", transform: "rotate(-5deg)" },
    h(
      { flexDirection: "column", width: "100%", height: "100%", borderRadius: 42, background: "#f1f5f9", padding: "22px 18px", color: "#0f172a" },
      h({ alignSelf: "center", width: 96, height: 24, borderRadius: 999, background: "#0b1220" }),
      h({ marginTop: 18, flexDirection: "column", background: "#fff", borderRadius: 20, padding: 18, boxShadow: "0 2px 6px rgba(15,23,42,0.08)" },
        h({ fontSize: 26, fontWeight: 800, letterSpacing: -0.5 }, name.length > 16 ? `${name.slice(0, 15)}…` : name),
        h({ marginTop: 10, alignSelf: "flex-start", padding: "5px 12px", borderRadius: 999, background: "#fef3c7", color: "#92400e", fontSize: 15, fontWeight: 700 }, what),
        h({ marginTop: 14, alignItems: "center", gap: 8, fontSize: 16, fontWeight: 600, color: "#475569" }, svg(I.pin, 20, "#94a3b8"), sub ? (sub.length > 22 ? `${sub.slice(0, 21)}…` : sub) : "From your ad"),
      ),
      h({ marginTop: 16, height: 68, borderRadius: 16, background: "#16a34a", color: "#fff", alignItems: "center", justifyContent: "center", gap: 12, fontSize: 22, fontWeight: 800, letterSpacing: 1, boxShadow: "0 10px 20px rgba(22,163,74,0.35)" }, svg(I.phone, 28, "#fff"), first.length > 9 ? "CALL" : `CALL ${first}`),
      h({ marginTop: 12, height: 56, borderRadius: 16, border: "2px solid #cbd5e1", background: "#fff", alignItems: "center", padding: "0 16px", fontSize: 17, fontWeight: 600, color: "#64748b" }, "What happened?"),
      h({ marginTop: 12, height: 56, borderRadius: 16, border: "2px solid #e2e8f0", background: "#fff", alignItems: "center", padding: "0 16px", fontSize: 17, fontWeight: 500, color: "#94a3b8" }, "Add a note"),
    ),
  );
  return card(
    "linear-gradient(135deg, #022c22 0%, #047857 55%, #10b981 100%)",
    h({ flexDirection: "column", marginTop: 54 },
      pill(what, I.person),
      h({ marginTop: 24, fontSize: nameSize(name, 76), fontWeight: 800, lineHeight: 1.04, letterSpacing: -2 }, name),
      sub ? h({ marginTop: 14, alignItems: "center", gap: 10, fontSize: 30, fontWeight: 500, color: "rgba(255,255,255,0.9)" }, svg(I.pin, 32, "rgba(255,255,255,0.8)"), sub) : null,
      cta("Tap to call", I.phone, false),
    ),
    phone,
  );
}

export default async function handler(req) {
  const q = new URL(req.url).searchParams;
  const t = q.get("t") || "";
  let el;
  let size = { width: 1200, height: 630 };
  if (BANNERS[t]) { el = banner(t, q); size = { width: 1200, height: 480 }; }
  else if (t === "contract") el = contract(q);
  else if (t === "invoice") el = invoice();
  else if (t === "lead") el = lead(q);
  else return new Response("Unknown picture", { status: 404 });
  const fonts = await loadFonts();
  return new ImageResponse(el, {
    ...size,
    ...(fonts ? { fonts } : {}),
    headers: { "Cache-Control": "public, max-age=31536000, immutable" },
  });
}
