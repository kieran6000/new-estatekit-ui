// Every video plays in a landscape (16:9) box. An upright video is fitted in
// the middle, with a blurred copy of its picture filling the sides (as
// YouTube shows Shorts on a computer). If the upright video has black bands
// baked in above and below its real picture, we find the picture in its
// thumbnail and fit that part instead, so the bands fall outside the box.

export interface Rect { left: number; top: number; width: number; height: number } // % of the box

/** The rows (0–1, top to bottom) where a picture's real content is. */
export interface Band { top: number; bottom: number }

/**
 * Where to put a video whose height ÷ width is `ratio` in a box `box` high
 * (÷ its width), so that `band` of it is as big as it can be without being cut.
 */
export function fitVideo(ratio: number, band: Band = { top: 0, bottom: 1 }, box = 9 / 16): Rect {
  const span = Math.max(0.05, band.bottom - band.top);
  // Width of the video, as a share of the box's width.
  const w = Math.min(1, box / (ratio * span));
  const h = w * ratio; // in box widths
  const middle = h * (band.top + span / 2);
  return {
    left: ((1 - w) / 2) * 100,
    top: ((box / 2 - middle) / box) * 100,
    width: w * 100,
    height: (h / box) * 100,
  };
}

/** Rows whose pixels are almost all black, from the top and from the bottom,
 *  are bands. `light(row)` says how many of a row's pixels aren't black (0–1). */
export function findBand(rows: number, light: (row: number) => number): Band {
  const isContent = (r: number) => light(r) > 0.03;
  let top = 0;
  while (top < rows - 1 && !isContent(top)) top++;
  let bottom = rows - 1;
  while (bottom > top && !isContent(bottom)) bottom--;
  const band = { top: top / rows, bottom: (bottom + 1) / rows };
  // Too thin to trust (a dark scene, not bands): use the whole picture.
  return band.bottom - band.top < 0.3 ? { top: 0, bottom: 1 } : band;
}

/** Reads a thumbnail and finds its band (the whole picture if it can't). */
export async function bandOfImage(url: string): Promise<Band> {
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.src = url;
  await img.decode();
  const W = 48;
  const H = Math.max(1, Math.round((img.naturalHeight / img.naturalWidth) * W));
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  if (!ctx) return { top: 0, bottom: 1 };
  ctx.drawImage(img, 0, 0, W, H);
  const px = ctx.getImageData(0, 0, W, H).data;
  return findBand(H, (row) => {
    let lit = 0;
    for (let x = 0; x < W; x++) {
      const i = (row * W + x) * 4;
      if (0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2] > 28) lit++;
    }
    return lit / W;
  });
}
