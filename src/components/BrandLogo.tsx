import { useEffect, useState } from "react";
import Box from "@mui/material/Box";
import { findLogoBounds, logoPlate, sampleLogoColors } from "../lib/logo";

type Trimmed = { url: string; colors: string[] };

const MAX_SIDE = 1200;
const cache = new Map<string, Promise<Trimmed | null>>();

/** Cuts the empty margin off a logo. Null if the picture can't be read
 *  (its host doesn't allow it), in which case it's shown as it is. */
function trimLogo(src: string): Promise<Trimmed | null> {
  let job = cache.get(src);
  if (job) return job;
  job = new Promise<Trimmed | null>((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onerror = () => resolve(null);
    img.onload = () => {
      try {
        const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
        const w = Math.max(1, Math.round(img.naturalWidth * scale));
        const h = Math.max(1, Math.round(img.naturalHeight * scale));
        const read = document.createElement("canvas");
        read.width = w;
        read.height = h;
        const ctx = read.getContext("2d", { willReadFrequently: true });
        if (!ctx) return resolve(null);
        ctx.drawImage(img, 0, 0, w, h);
        const { data } = ctx.getImageData(0, 0, w, h);
        const b = findLogoBounds(data, w, h);
        if (!b) return resolve({ url: src, colors: [] });
        const colors = b.background ? [] : sampleLogoColors(data, w, b);
        // A logo on its own background keeps a little of it, so it doesn't sit hard against the edge.
        const pad = b.background ? Math.round(Math.min(b.w, b.h) * 0.1) : 0;
        const out = document.createElement("canvas");
        out.width = b.w + pad * 2;
        out.height = b.h + pad * 2;
        const octx = out.getContext("2d");
        if (!octx) return resolve(null);
        if (b.background) {
          octx.fillStyle = b.background;
          octx.fillRect(0, 0, out.width, out.height);
        }
        octx.drawImage(read, b.x, b.y, b.w, b.h, pad, pad, b.w, b.h);
        out.toBlob((blob) => resolve({ url: blob ? URL.createObjectURL(blob) : src, colors }), "image/png");
      } catch {
        resolve(null);
      }
    };
    img.src = src;
  });
  cache.set(src, job);
  return job;
}

/** An agent's logo, as large as `size` allows with its empty margin cut off,
 *  and on a plate if it would vanish against `onColor`. */
export default function BrandLogo({ src, size, onColor, alt = "" }: { src: string; size: number; onColor: string; alt?: string }) {
  const [done, setDone] = useState<{ src: string; result: Trimmed | null } | null>(null);
  useEffect(() => {
    let live = true;
    void trimLogo(src).then((result) => { if (live) setDone({ src, result }); });
    return () => { live = false; };
  }, [src]);

  const ready = done?.src === src;
  const result = ready ? done.result : null;
  const plate = result ? logoPlate(result.colors, onColor) : null;
  const inset = plate ? 6 : 0;
  return (
    <Box sx={{ display: "inline-block", verticalAlign: "middle", maxWidth: "100%", lineHeight: 0, p: `${inset}px`, borderRadius: plate ? "6px" : 0, bgcolor: plate ?? "transparent", visibility: ready ? "visible" : "hidden" }}>
      <Box component="img" src={result?.url ?? src} alt={alt} sx={{ display: "block", height: size - inset * 2, width: "auto", maxWidth: "100%", objectFit: "contain", borderRadius: "4px" }} />
    </Box>
  );
}
