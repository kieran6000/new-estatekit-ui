// Shared by the link-preview pages (/c, /l, /i): the app's own index.html with
// the link's title, words and picture in the head. WhatsApp, Discord and the
// rest read those to build the preview; they don't run the app.

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** The page's own social tags and title out, the link's in. */
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

/** The picture's address on /api/og (blank values left out). */
export function ogImage(origin, params) {
  // v: the design version. Pictures are cached for good, so a new design needs a new address.
  const q = new URLSearchParams(Object.entries({ ...params, v: "2" }).filter(([, v]) => v));
  return `${origin}/api/og?${q}`;
}

export const originOf = (req) => `https://${req.headers["x-forwarded-host"] || req.headers.host}`;
