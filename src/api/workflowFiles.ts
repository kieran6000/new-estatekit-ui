import { supabase } from "./_client";
import { extFor, shrinkImage } from "../lib/image";
import type { Attachment } from "../lib/workflow";

// Pictures and PDFs sent with a WhatsApp workflow step, in the same public
// buckets as the rest (logos for pictures, plan-pdfs for PDFs), under the
// signed-in person's own folder.
//
// A picture is made smaller on the way up — as JPEG, because WhatsApp shows a
// WebP as a sticker. A PDF goes exactly as it is: a plan or a brochure is
// meant to be read and printed.

export const MAX_WA_FILE_MB = 10;

export async function uploadWhatsAppFile(file: File): Promise<Attachment> {
  const { data } = await supabase.auth.getUser();
  const me = data.user?.id;
  if (!me) throw new Error("not signed in");
  const pdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
  const body: Blob = pdf ? file : await shrinkImage(file, "attach");
  const ext = pdf ? "pdf" : extFor(body, (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg");
  const bucket = pdf ? "plan-pdfs" : "logos";
  const path = `${me}/wa-${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from(bucket).upload(path, body, { contentType: body.type || file.type || (pdf ? "application/pdf" : "image/jpeg"), upsert: false, cacheControl: "31536000" });
  if (error) throw new Error(error.message);
  return { url: supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl, name: file.name.slice(0, 80), kind: pdf ? "pdf" : "image" };
}
