// Serves /c/<token>: the app's page, with the contract's own title and picture
// in the HTML. WhatsApp reads those to build the link preview and doesn't run
// the app, which is also why a preview never counts as the client opening it.
// If anything here fails the client still gets the contract, with a plainer
// preview at worst.

const CONTRACT_FN = "https://yfcnsvrhojpysrzqrkdi.supabase.co/functions/v1/contract";

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

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

/** The page's own social tags and title out, the contract's in. */
export function withPreview(html, { title, description }, url, image) {
  const tags = [
    `<title>${esc(title)}</title>`,
    `<meta name="description" content="${esc(description)}" />`,
    `<meta name="robots" content="noindex, nofollow" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="EstateKit" />`,
    `<meta property="og:title" content="${esc(title)}" />`,
    `<meta property="og:description" content="${esc(description)}" />`,
    `<meta property="og:url" content="${esc(url)}" />`,
    `<meta property="og:image" content="${esc(image)}" />`,
    `<meta property="og:image:type" content="image/png" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${esc(title)}" />`,
    `<meta name="twitter:description" content="${esc(description)}" />`,
    `<meta name="twitter:image" content="${esc(image)}" />`,
  ].join("\n    ");
  return html
    .replace(/<title>[\s\S]*?<\/title>\s*/i, "")
    .replace(/<meta\s+(name="description"|name="twitter:[^"]*"|property="og:[^"]*")[^>]*>\s*/gi, "")
    .replace(/<\/head>/i, `    ${tags}\n  </head>`);
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
  const origin = `https://${req.headers["x-forwarded-host"] || req.headers.host}`;
  try {
    const [page, contract] = await Promise.all([fetch(`${origin}/index.html`), lookUp(token)]);
    if (!page.ok) throw new Error(`index.html ${page.status}`);
    const html = withPreview(await page.text(), previewText(contract), `${origin}/c/${token}`, `${origin}/contract-preview.png`);
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=0, s-maxage=60");
    res.status(200).send(html);
  } catch (err) {
    console.error("contract page failed", err);
    res.redirect(302, `/contract/${encodeURIComponent(token)}`);
  }
}
