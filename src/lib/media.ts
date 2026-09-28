/** Erlaubte Upload-Typen (Browser und Server) – der Storage-Bucket erzwingt dieselbe Liste. */
export const ALLOWED_UPLOAD_TYPES = [
  "image/jpeg", "image/png", "image/webp", "image/gif", "image/tiff", "image/bmp", "video/mp4", "video/quicktime", "application/pdf",
];

export const MAX_UPLOAD_BYTES = 500 * 1024 * 1024;

export function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null) return "–";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toLocaleString("de-DE", { maximumFractionDigits: 0 })} KB`;
  return `${(bytes / 1024 / 1024).toLocaleString("de-DE", { maximumFractionDigits: 1 })} MB`;
}

/** Maße eines Bildes bzw. Länge/Maße eines Videos im Browser auslesen. */
export async function readMediaMetadata(file: File): Promise<{ width: number | null; height: number | null; duration: number | null }> {
  if (file.type.startsWith("image/")) {
    try {
      const bitmap = await createImageBitmap(file);
      const result = { width: bitmap.width, height: bitmap.height, duration: null };
      bitmap.close();
      return result;
    } catch {
      return { width: null, height: null, duration: null };
    }
  }
  if (file.type.startsWith("video/")) {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(file);
      const video = document.createElement("video");
      video.preload = "metadata";
      const done = (value: { width: number | null; height: number | null; duration: number | null }) => {
        URL.revokeObjectURL(url);
        resolve(value);
      };
      video.onloadedmetadata = () => done({ width: video.videoWidth || null, height: video.videoHeight || null, duration: Number.isFinite(video.duration) ? Math.round(video.duration * 10) / 10 : null });
      video.onerror = () => done({ width: null, height: null, duration: null });
      video.src = url;
    });
  }
  return { width: null, height: null, duration: null };
}
