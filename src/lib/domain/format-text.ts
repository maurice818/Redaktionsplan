import { formatRatio, recommendedRatio } from "./format-validation";
import type { FormatRule } from "./types";

/** Formatregel als kurze, verständliche Hinweise für die Medienauswahl. */
export function describeRule(rule: FormatRule): string[] {
  const out: string[] = [];
  const kind = rule.media_kind === "video" ? "Video" : rule.media_kind === "bild" ? "Bild" : "Medium";
  if (rule.allowed_mime_types.length) out.push(`${kind}: ${rule.allowed_mime_types.map((m) => m.split("/")[1]?.toUpperCase()).join(", ")}${rule.max_file_size_mb ? `, max. ${rule.max_file_size_mb} MB` : ""}`);
  if (rule.min_aspect_ratio || rule.max_aspect_ratio) {
    out.push(`Seitenverhältnis ${rule.min_aspect_ratio ? formatRatio(rule.min_aspect_ratio) : "–"} bis ${rule.max_aspect_ratio ? formatRatio(rule.max_aspect_ratio) : "–"}`);
  }
  const rec = recommendedRatio(rule);
  if (rec) out.push(`Empfohlen ${rule.recommended_width} × ${rule.recommended_height} px (${formatRatio(rec)})`);
  if (rule.min_width || rule.max_width) out.push(`Breite ${rule.min_width ?? "–"} bis ${rule.max_width ?? "–"} px`);
  if (rule.min_duration_seconds || rule.max_duration_seconds) out.push(`Länge ${rule.min_duration_seconds ?? 0}–${rule.max_duration_seconds ?? "∞"} s`);
  if (rule.min_items && rule.min_items > 1) out.push(`Mindestens ${rule.min_items} Medien`);
  if (rule.max_items && rule.max_items > 1) out.push(`Höchstens ${rule.max_items} Medien`);
  if (rule.caption_max_length) out.push(`Text max. ${rule.caption_max_length} Zeichen${rule.hashtags_max ? `, ${rule.hashtags_max} Hashtags` : ""}`);
  if (!rule.api_supported) out.push("Per Schnittstelle nicht unterstützt – manuelle Veröffentlichung");
  if (rule.verified_at) out.push(`Stand der Vorgaben: ${rule.verified_at.split("-").reverse().join(".")}`);
  return out;
}
