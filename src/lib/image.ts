import { supabase } from "../api/_client";

// Every picture goes through here: shrunk in the browser to what the app
// actually shows, saved as WebP in the public "logos" bucket, and cached for
// a year (each upload gets a new file name, so a change still shows at once).
// Before this, photos went up at full size and landing-page images were kept
// as text inside the database rows, which was most of the Supabase egress.

export type ImageKind = "logo" | "photo" | "sale";

const BOX: Record<ImageKind, { w: number; h: number; q: number }> = {
  logo: { w: 480, h: 160, q: 0.85 }, // shown about 50px tall
  photo: { w: 400, h: 400, q: 0.82 }, // round photos, up to ~120px
  sale: { w: 1000, h: 1000, q: 0.8 }, // recent-sales cards and pages
};

/** Largest file we'll even try to read (phones can take 10 MB+ photos). */
export const MAX_IMAGE_BYTES = 20 * 1024 * 1024;

async function decode(file: File): Promise<ImageBitmap | HTMLImageElement> {
  try {
    // Respects the phone's rotation, so photos aren't sideways.
    return await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return img;
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

/** Shrinks a picture to fit `kind`'s box (never enlarges) and returns WebP,
 *  or the original file if the browser can't process it. */
export async function shrinkImage(file: File, kind: ImageKind): Promise<Blob> {
  const { w, h, q } = BOX[kind];
  try {
    const img = await decode(file);
    const iw = "naturalWidth" in img ? img.naturalWidth : img.width;
    const ih = "naturalHeight" in img ? img.naturalHeight : img.height;
    const scale = Math.min(1, w / iw, h / ih);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(iw * scale));
    canvas.height = Math.max(1, Math.round(ih * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/webp", q));
    // Some older browsers ignore WebP and return PNG; only use it if smaller.
    return blob && blob.size < file.size ? blob : file;
  } catch {
    return file;
  }
}

/** Shrinks and uploads a picture; returns its public URL. */
export async function uploadImage(file: File, kind: ImageKind, folder: string): Promise<string> {
  const blob = await shrinkImage(file, kind);
  const ext = blob.type === "image/webp" ? "webp" : (file.name.split(".").pop() || "jpg").toLowerCase();
  const path = `${folder}/${kind}-${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from("logos").upload(path, blob, {
    upsert: true,
    contentType: blob.type || file.type || "image/jpeg",
    cacheControl: "31536000",
  });
  if (error) throw error;
  return supabase.storage.from("logos").getPublicUrl(path).data.publicUrl;
}
