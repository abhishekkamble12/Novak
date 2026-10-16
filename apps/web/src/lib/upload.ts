const CLOUD_NAME = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;
const UPLOAD_PRESET = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET;

/** File uploads need a Cloudinary *unsigned* upload preset; otherwise posts take an image URL. */
export const uploadsEnabled = Boolean(CLOUD_NAME && UPLOAD_PRESET);

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export async function uploadImage(file: File): Promise<string> {
  if (!uploadsEnabled) throw new Error("Uploads are not configured");
  if (!file.type.startsWith("image/")) throw new Error("Please choose an image file");
  if (file.size > MAX_UPLOAD_BYTES) throw new Error("Images must be 10 MB or smaller");

  const body = new FormData();
  body.append("file", file);
  body.append("upload_preset", UPLOAD_PRESET!);

  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, {
    method: "POST",
    body,
  });
  const json = (await res.json().catch(() => ({}))) as { secure_url?: string; error?: { message?: string } };
  if (!res.ok || !json.secure_url) throw new Error(json.error?.message || "Upload failed");
  return json.secure_url;
}
