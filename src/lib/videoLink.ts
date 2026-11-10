// Any video link people paste, turned into something we can play.
//  * youtube / vimeo: their players, with play tracking and the end button.
//  * file: a direct video file (.mp4, .webm, .mov…), Dropbox links included.
//  * embed: a site's own player in a frame (Loom, Wistia, Google Drive,
//    Facebook, Streamable, TikTok, Dailymotion…), or any other https link.
// Nothing that's a link is refused: an unknown site is shown in a frame.

export type VideoKind =
  | { type: "youtube"; id: string }
  | { type: "vimeo"; id: string; hash?: string }
  | { type: "file"; src: string }
  | { type: "embed"; src: string; site: string; tall?: boolean }
  | null;

/** Pasted without https://, or with spaces round it: tidy it into a URL. */
function asUrl(raw: string): URL | null {
  let s = (raw || "").trim();
  if (!s) return null;
  // An embed code pasted whole: take the src out of it.
  const src = s.match(/<iframe[^>]*\ssrc=["']([^"']+)["']/i)?.[1];
  if (src) s = src;
  if (s.startsWith("//")) s = "https:" + s;
  if (!/^[a-z]+:\/\//i.test(s)) s = "https://" + s;
  try {
    const u = new URL(s);
    if (u.protocol === "http:") u.protocol = "https:";
    if (u.protocol !== "https:" || !u.hostname.includes(".")) return null;
    return u;
  } catch {
    return null;
  }
}

const FILE = /\.(mp4|webm|mov|m4v|ogv|ogg)$/i;

export function videoKind(raw: string): VideoKind {
  const u = asUrl(raw);
  if (!u) return null;
  const host = u.hostname.replace(/^(www|m|music)\./, "").toLowerCase();
  const path = u.pathname;

  // YouTube: watch, youtu.be, shorts, live, embed, nocookie.
  if (/(^|\.)youtube(-nocookie)?\.com$|^youtu\.be$/.test(host)) {
    const id = host === "youtu.be" ? path.slice(1, 12) : u.searchParams.get("v") ?? path.match(/\/(?:embed|shorts|live|v)\/([\w-]{11})/)?.[1];
    if (id && /^[\w-]{11}$/.test(id)) return { type: "youtube", id };
  }

  // Vimeo: vimeo.com/123, vimeo.com/123/abcdef (unlisted), player.vimeo.com/video/123?h=abc,
  // channels/…/123, showcase/…/video/123, groups/…/videos/123.
  if (/(^|\.)vimeo\.com$/.test(host)) {
    const m = path.match(/(?:^|\/)(?:video\/|videos\/)?(\d{6,})(?:\/([0-9a-f]{6,}))?/);
    if (m) return { type: "vimeo", id: m[1], hash: m[2] ?? u.searchParams.get("h") ?? undefined };
  }

  // Dropbox: the shared link, made to send the file itself.
  if (/(^|\.)dropbox\.com$/.test(host) && FILE.test(path)) {
    u.searchParams.delete("dl");
    u.searchParams.set("raw", "1");
    return { type: "file", src: u.toString() };
  }
  if (FILE.test(path)) return { type: "file", src: u.toString() };

  // Loom
  const loom = /(^|\.)loom\.com$/.test(host) && path.match(/\/(?:share|embed)\/([0-9a-f]{20,})/i);
  if (loom) return { type: "embed", site: "Loom", src: `https://www.loom.com/embed/${loom[1]}?hide_owner=true&hide_share=true&hide_title=true` };

  // Wistia: x.wistia.com/medias/ID, fast.wistia.net/embed/iframe/ID, wi.st/medias/ID
  const wistia = /wistia\.(com|net)$|^wi\.st$/.test(host) && path.match(/\/(?:medias|iframe)\/([a-z0-9]{6,})/i);
  if (wistia) return { type: "embed", site: "Wistia", src: `https://fast.wistia.net/embed/iframe/${wistia[1]}?videoFoam=true` };

  // Google Drive: file/d/ID/view → preview
  const drive = host === "drive.google.com" && (path.match(/\/file\/d\/([\w-]{10,})/)?.[1] ?? u.searchParams.get("id"));
  if (drive) return { type: "embed", site: "Google Drive", src: `https://drive.google.com/file/d/${drive}/preview` };

  // Facebook: any video or reel link, through Facebook's video player.
  if (/(^|\.)facebook\.com$|^fb\.watch$/.test(host) && !path.startsWith("/plugins/")) {
    return { type: "embed", site: "Facebook", src: `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(u.toString())}&show_text=false`, tall: /\/reel\//.test(path) };
  }

  // Streamable
  const streamable = host === "streamable.com" && path.match(/^\/(?:e\/)?([a-z0-9]{4,})/i);
  if (streamable) return { type: "embed", site: "Streamable", src: `https://streamable.com/e/${streamable[1]}` };

  // TikTok (upright)
  const tiktok = /(^|\.)tiktok\.com$/.test(host) && path.match(/\/video\/(\d{8,})/);
  if (tiktok) return { type: "embed", site: "TikTok", src: `https://www.tiktok.com/embed/v2/${tiktok[1]}`, tall: true };

  // Dailymotion
  const dm = /dailymotion\.com$|^dai\.ly$/.test(host) && (host === "dai.ly" ? path.slice(1) : path.match(/\/video\/([a-z0-9]+)/i)?.[1]);
  if (dm) return { type: "embed", site: "Dailymotion", src: `https://www.dailymotion.com/embed/video/${dm}` };

  // Instagram reel or post
  const ig = /(^|\.)instagram\.com$/.test(host) && path.match(/\/(reel|p|tv)\/([\w-]+)/);
  if (ig) return { type: "embed", site: "Instagram", src: `https://www.instagram.com/${ig[1]}/${ig[2]}/embed`, tall: true };

  // Anything else that's a link: shown in a frame as it is.
  return { type: "embed", site: host, src: u.toString() };
}

export const canPlayVideo = (url: string) => videoKind(url) !== null;

/** Plays with our tracking and the end-of-video button (YouTube, Vimeo, files). */
export const tracksViews = (url: string) => {
  const k = videoKind(url);
  return !!k && k.type !== "embed";
};
