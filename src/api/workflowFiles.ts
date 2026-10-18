import { supabase } from "./_client";
import type { Attachment } from "../lib/workflow";

// Pictures and PDFs sent with a WhatsApp workflow step. Kept as they are (a
// photo isn't converted: WhatsApp shows WebP as a sticker), in the same
// public buckets as the rest (logos for pictures, plan-pdfs for PDFs), under
// the signed-in person's own folder.

export const MAX_WA_FILE_MB = 10;

export async function uploadWhatsAppFile(file: File): Promise<Attachment> {
  const { data } = await supabase.auth.getUser();
  const me = data.user?.id;
  if (!me) throw new Error("not signed in");
  const pdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
  const ext = pdf ? "pdf" : (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  const bucket = pdf ? "plan-pdfs" : "logos";
  const path = `${me}/wa-${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from(bucket).upload(path, file, { contentType: file.type || (pdf ? "application/pdf" : "image/jpeg"), upsert: false, cacheControl: "31536000" });
  if (error) throw new Error(error.message);
  return { url: supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl, name: file.name.slice(0, 80), kind: pdf ? "pdf" : "image" };
}
