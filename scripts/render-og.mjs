// Draws every /api/og picture to files, to look at the designs without
// deploying: node scripts/render-og.mjs <out dir>
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

// The function reads its fonts with fetch(new URL(..., import.meta.url)),
// which on a computer is a file: address that fetch can't open.
const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = input instanceof URL ? input : new URL(String(input), "http://x");
  if (url.protocol === "file:") return new Response(await readFile(fileURLToPath(url)));
  return realFetch(input, init);
};

const { default: og } = await import("../api/og.js");
const out = process.argv[2] || "og-out";
await mkdir(out, { recursive: true });

const pics = {
  new_lead: "t=new_lead&n=Thandi Mokoena&s=14 Oak Avenue, Moreleta Park&a=Ansunette Ferreira&c=Plus Group Properties",
  contacted: "t=contacted&n=Johan van der Merwe&s=Was: No answer&a=Bennie Bell&c=Real Estate Services",
  booked: "t=booked&n=Richard Geertsema&s=Tue 17 Nov, 10:00&a=Ansunette Ferreira&c=Plus Group Properties",
  mandate: "t=mandate&n=Gwen van Staden&s=Elarduspark, Pretoria East&a=Ansunette Ferreira&c=Plus Group Properties",
  not_owner: "t=not_owner&n=Annemarie Auret-Verreyne&s=Was: New lead&a=Ansunette Ferreira&c=Plus Group Properties",
  checkin: "t=checkin&n=Juani Blom&s=Average 4.6 of 5&c=Your Property Chick",
  signed_up: "t=mandate&n=Sipho Ndlovu&s=Was contacted&a=Bennie Bell&c=Real Estate Services&l=Signed up",
  long_name: "t=new_lead&n=Mphokuhle Nomvula Siziba-Dlamini&s=Plot 12, Hartbeespoortdam Road, Schoemansville, North West&a=Hendrik Jansen",
  contract: "t=contract&n=Ansunette Ferreira&r=EK-2026-014",
  contract_signed: "t=contract&n=Ansunette Ferreira&r=EK-2026-014&ok=1",
  invoice: "t=invoice",
  lead: "t=lead&n=Thandi Mokoena&s=Moreleta Park, Pretoria&w=New lead",
};
for (const [name, qs] of Object.entries(pics)) {
  const t0 = Date.now();
  const res = await og(new Request(`http://localhost/api/og?${qs.replace(/ /g, "%20")}`));
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(`${out}/${name}.png`, buf);
  console.log(`${name}: ${res.status} ${res.headers.get("content-type")} ${buf.length} bytes ${Date.now() - t0}ms`);
}
