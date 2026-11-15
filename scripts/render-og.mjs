// Draws every /api/og picture to files, to look at the designs without
// deploying: node scripts/render-og.mjs <out dir> [agent photo url] [ad picture url]
import { writeFile, mkdir } from "node:fs/promises";

const { default: og } = await import("../api/og.js");
const [out = "og-out", photo = "", ad = ""] = process.argv.slice(2);
await mkdir(out, { recursive: true });

const p = (o) => new URLSearchParams(Object.entries(o).filter(([, v]) => v)).toString();
const agent = { a: "Storm Hargreaves", ph: photo };
const pics = {
  new_lead: p({ t: "new_lead", n: "Guy Jackson", s: "68 Modderfontein Road, President Park", src: "Facebook ad", ad, ...agent }),
  call_time: p({ t: "call_time", n: "Guy Jackson", w: "Wed|18|Nov|16:00", h: "Came in 2h ago|Picked a time", ...agent }),
  contacted: p({ t: "contacted", n: "Johan van der Merwe", h: "Came in 3d ago|No answer ×2|Spoke", ...agent }),
  booked: p({ t: "booked", n: "Richard Geertsema", s: "Moreleta Park", w: "Tue|17|Nov|10:00", h: "Came in 4d ago|Called 3×|Booked", ...agent }),
  mandate: p({ t: "mandate", n: "Gwen van Staden", s: "Elarduspark", h: "Came in 3w ago|Met Tue 17 Nov|Mandate", ...agent }),
  not_owner: p({ t: "not_owner", n: "Annemarie Auret-Verreyne", h: "Came in 2d ago|Called 1×|Not the owner", ...agent }),
  checkin: p({ t: "checkin", n: "Storm Hargreaves", s: "Average 4.6 of 5", sc: "4.6", ...agent }),
  new_lead_no_pics: p({ t: "new_lead", n: "Thandi Mokoena", s: "14 Oak Avenue, Moreleta Park", a: "Ansunette Ferreira" }),
  contract: p({ t: "contract", n: "Ansunette Ferreira", r: "EK-2026-014" }),
  invoice: p({ t: "invoice" }),
  lead: p({ t: "lead", n: "Thandi Mokoena", s: "Moreleta Park", w: "New lead" }),
};
for (const [name, qs] of Object.entries(pics)) {
  const t0 = Date.now();
  const res = {
    code: 200, headers: {}, body: null,
    status(c) { this.code = c; return this; },
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    send(b) { this.body = b; },
  };
  await og({ url: `/api/og?${qs}`, headers: {} }, res);
  await writeFile(`${out}/${name}.png`, res.body);
  console.log(`${name}: ${res.code} ${res.headers["content-type"]} ${res.body.length} bytes ${Date.now() - t0}ms`);
}
