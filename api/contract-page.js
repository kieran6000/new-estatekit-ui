// Serves /c/<token>: the app's page, with the contract's own title and picture
// in the HTML. WhatsApp reads those to build the link preview and doesn't run
// the app, which is also why a preview never counts as the client opening it.
// If anything here fails the client still gets the contract, with a plainer
// preview at worst.

import { ogImage, originOf, withPreview } from "./_og/preview.js";

const CONTRACT_FN = "https://yfcnsvrhojpysrzqrkdi.supabase.co/functions/v1/contract";

export function previewText(c) {
  if (!c || c.cancelled) return { title: "EstateKit agreement", description: "An agreement from EstateKit." };
  const title = `${c.title} · ${c.reference}`;
  return {
    title,
    description: c.signed
      ? `Signed by ${c.signerName}. Open for the signed copy.`
      : `Prepared for ${c.signerName}. Please read and sign.`,
  };
}

async function lookUp(token) {
  if (!/^[0-9a-f]{32}$/.test(token)) return null;
  try {
    const res = await fetch(CONTRACT_FN, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "preview", token }),
      signal: AbortSignal.timeout(2500),
    });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  const token = String(req.query.token ?? "");
  const origin = originOf(req);
  try {
    const [page, contract] = await Promise.all([fetch(`${origin}/index.html`), lookUp(token)]);
    if (!page.ok) throw new Error(`index.html ${page.status}`);
    const live = contract && !contract.cancelled;
    const image = ogImage(origin, { t: "contract", n: live ? contract.signerName : "", r: live ? contract.reference : "", ok: live && contract.signed ? "1" : "" });
    const html = withPreview(await page.text(), previewText(contract), `${origin}/c/${token}`, image);
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=0, s-maxage=60");
    res.status(200).send(html);
  } catch (err) {
    console.error("contract page failed", err);
    res.redirect(302, `/contract/${encodeURIComponent(token)}`);
  }
}
