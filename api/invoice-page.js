// /i/<token> for link-preview bots only (vercel.json sends nobody else here):
// a designed invoice card in WhatsApp. Nothing is looked up: view_invoice
// counts every look as the client opening it, and a preview isn't that.

import { ogImage, originOf, withPreview } from "./_og/preview.js";

export default async function handler(req, res) {
  const token = String(req.query.token ?? "");
  const origin = originOf(req);
  try {
    const page = await fetch(`${origin}/index.html`);
    if (!page.ok) throw new Error(`index.html ${page.status}`);
    const text = { title: "Invoice from EstateKit", description: "Open it to see the amount and how to pay." };
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=0, s-maxage=300");
    res.status(200).send(withPreview(await page.text(), text, `${origin}/i/${token}`, ogImage(origin, { t: "invoice" })));
  } catch (err) {
    console.error("invoice page failed", err);
    res.redirect(302, "/");
  }
}
