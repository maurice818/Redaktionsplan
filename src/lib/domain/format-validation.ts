import type { FormatRule, Issue, MediaInfo } from "./types";

/**
 * Prüft Medien gegen die konfigurierten Formatregeln.
 *  - "error": die Plattform/API lehnt das Medium voraussichtlich ab
 *  - "warning": zulässig, aber von der Empfehlung abweichend
 *  - "info": nicht prüfbar (z. B. Google-Drive-Link ohne Maße)
 */

const MB = 1024 * 1024;

export function mediaKindForMime(mime: string | null | undefined): "bild" | "video" | "dokument" {
  if (!mime) return "dokument";
  if (mime.startsWith("image/")) return "bild";
  if (mime.startsWith("video/")) return "video";
  return "dokument";
}

export function formatRatio(ratio: number): string {
  const known: [number, string][] = [
    [1, "1:1"], [0.8, "4:5"], [1.91, "1,91:1"], [0.5625, "9:16"], [1.7778, "16:9"], [0.75, "3:4"], [1.3333, "4:3"],
  ];
  for (const [value, label] of known) {
    if (Math.abs(ratio - value) / value < 0.015) return label;
  }
  return `${ratio.toLocaleString("de-DE", { maximumFractionDigits: 2 })}:1`;
}

export function recommendedRatio(rule: Pick<FormatRule, "recommended_width" | "recommended_height">): number | null {
  if (!rule.recommended_width || !rule.recommended_height) return null;
  return rule.recommended_width / rule.recommended_height;
}

export function rulesFor(rules: FormatRule[], channel: string, postFormat: string | null | undefined): FormatRule[] {
  return rules.filter((r) => r.is_active && r.channel === channel && r.post_format === (postFormat ?? ""));
}

export function ruleForMedia(rules: FormatRule[], channel: string, postFormat: string | null | undefined, kind: string) {
  return rulesFor(rules, channel, postFormat).find((r) => r.media_kind === kind) ?? null;
}

export function validateMedia(media: MediaInfo, rule: FormatRule): Issue[] {
  const issues: Issue[] = [];
  const id = media.id;
  const name = media.file_name ? `„${media.file_name}“` : "Das Medium";

  if (media.status === "veraltet") {
    issues.push({ level: "error", code: "veraltet", message: `${name} ist als veraltet gekennzeichnet.`, mediaId: id });
  }

  if (rule.allowed_mime_types.length > 0) {
    if (!media.mime_type) {
      issues.push({ level: "info", code: "typ_unbekannt", message: `Dateityp von ${name} ist unbekannt – bitte prüfen.`, mediaId: id });
    } else if (!rule.allowed_mime_types.includes(media.mime_type)) {
      const allowed = rule.allowed_mime_types.map((m) => m.split("/")[1]?.toUpperCase()).join(", ");
      issues.push({
        level: "error",
        code: "typ",
        message: `${name} hat den Typ ${media.mime_type}. Für ${rule.label} erlaubt: ${allowed}.`,
        mediaId: id,
      });
    }
  }

  if (rule.max_file_size_mb && media.size_bytes != null && media.size_bytes > rule.max_file_size_mb * MB) {
    issues.push({
      level: "error",
      code: "groesse",
      message: `${name} ist ${(media.size_bytes / MB).toLocaleString("de-DE", { maximumFractionDigits: 1 })} MB groß (max. ${rule.max_file_size_mb} MB).`,
      mediaId: id,
    });
  }

  const hasDims = media.width != null && media.height != null && media.width > 0 && media.height > 0;
  if (!hasDims && (rule.min_aspect_ratio || rule.max_aspect_ratio || rule.recommended_width || rule.min_width)) {
    issues.push({
      level: "info",
      code: "masse_unbekannt",
      message: `Maße von ${name} sind nicht bekannt (z. B. bei Drive-Links) – Seitenverhältnis bitte manuell prüfen oder Maße eintragen.`,
      mediaId: id,
    });
  }

  if (hasDims) {
    const w = media.width!;
    const h = media.height!;
    const ratio = w / h;
    if (rule.min_width && w < rule.min_width) {
      issues.push({ level: "error", code: "breite_min", message: `${name} ist nur ${w} px breit (mind. ${rule.min_width} px).`, mediaId: id });
    }
    if (rule.max_width && w > rule.max_width) {
      issues.push({
        level: rule.channel === "instagram" && rule.media_kind === "bild" ? "warning" : "error",
        code: "breite_max",
        message: `${name} ist ${w} px breit (max. ${rule.max_width} px) – wird ggf. verkleinert oder abgelehnt.`,
        mediaId: id,
      });
    }
    if (rule.max_pixels && w * h > rule.max_pixels) {
      issues.push({ level: "error", code: "pixel", message: `${name} überschreitet ${rule.max_pixels.toLocaleString("de-DE")} Pixel.`, mediaId: id });
    }
    if (rule.min_aspect_ratio && ratio < rule.min_aspect_ratio - 0.005) {
      issues.push({
        level: "error",
        code: "seitenverhaeltnis",
        message: `${name} hat das Seitenverhältnis ${formatRatio(ratio)} – zulässig ab ${formatRatio(rule.min_aspect_ratio)}.`,
        mediaId: id,
      });
    } else if (rule.max_aspect_ratio && ratio > rule.max_aspect_ratio + 0.005) {
      issues.push({
        level: "error",
        code: "seitenverhaeltnis",
        message: `${name} hat das Seitenverhältnis ${formatRatio(ratio)} – zulässig bis ${formatRatio(rule.max_aspect_ratio)}.`,
        mediaId: id,
      });
    } else {
      const rec = recommendedRatio(rule);
      if (rec && Math.abs(ratio - rec) / rec > 0.02) {
        issues.push({
          level: "warning",
          code: "empfehlung",
          message: `${name} (${formatRatio(ratio)}) weicht von der Empfehlung ${formatRatio(rec)} (${rule.recommended_width} × ${rule.recommended_height} px) ab.`,
          mediaId: id,
        });
      } else if (rule.recommended_width && w < rule.recommended_width * 0.9) {
        issues.push({
          level: "warning",
          code: "aufloesung",
          message: `${name} ist ${w} px breit – empfohlen sind ${rule.recommended_width} px.`,
          mediaId: id,
        });
      }
    }
  }

  if (media.duration_seconds != null) {
    if (rule.min_duration_seconds && media.duration_seconds < rule.min_duration_seconds) {
      issues.push({ level: "error", code: "dauer_min", message: `${name} ist kürzer als ${rule.min_duration_seconds} s.`, mediaId: id });
    }
    if (rule.max_duration_seconds && media.duration_seconds > rule.max_duration_seconds) {
      issues.push({ level: "error", code: "dauer_max", message: `${name} ist länger als ${rule.max_duration_seconds} s.`, mediaId: id });
    }
  } else if (media.kind === "video" && (rule.min_duration_seconds || rule.max_duration_seconds)) {
    issues.push({ level: "info", code: "dauer_unbekannt", message: `Länge von ${name} ist nicht bekannt.`, mediaId: id });
  }

  return issues;
}

export interface ContentForValidation {
  kind: string;
  channel: string;
  post_format: string | null;
  caption?: string | null;
  hashtags?: string[] | null;
  body_html?: string | null;
}

export function countCaptionLength(caption: string | null | undefined, hashtags: string[] | null | undefined): number {
  const tags = (hashtags ?? []).join(" ");
  return (caption ?? "").length + (tags ? tags.length + 2 : 0);
}

/** Gesamtprüfung eines Inhalts inkl. Medienanzahl, Medienart, Textlänge und Hashtags. */
export function validateContent(content: ContentForValidation, media: MediaInfo[], rules: FormatRule[]): Issue[] {
  const issues: Issue[] = [];
  const applicable = rulesFor(rules, content.channel, content.post_format);

  if (applicable.length === 0) {
    issues.push({
      level: "info",
      code: "keine_regel",
      message: "Für diesen Kanal und dieses Format ist keine Formatregel hinterlegt.",
    });
    return issues;
  }

  const mediaRequired = applicable.some((r) => r.media_required);
  const acceptedKinds = new Set(applicable.map((r) => r.media_kind));
  const minItems = Math.max(0, ...applicable.map((r) => r.min_items ?? 0));
  const maxItemsList = applicable.map((r) => r.max_items).filter((n): n is number => n != null);
  const maxItems = maxItemsList.length ? Math.max(...maxItemsList) : null;
  const visual = media.filter((m) => m.kind === "bild" || m.kind === "video");

  if (mediaRequired && visual.length === 0) {
    issues.push({ level: "error", code: "medium_fehlt", message: "Für dieses Format ist ein Bild bzw. Video erforderlich." });
  }
  if (visual.length > 0 && minItems > 1 && visual.length < minItems) {
    issues.push({ level: "error", code: "zu_wenige", message: `Mindestens ${minItems} Medien erforderlich (aktuell ${visual.length}).` });
  }
  if (maxItems != null && visual.length > maxItems) {
    issues.push({ level: "error", code: "zu_viele", message: `Höchstens ${maxItems} Medien möglich (aktuell ${visual.length}).` });
  }
  if (acceptedKinds.has("keins") && visual.length > 0 && !acceptedKinds.has("bild") && !acceptedKinds.has("video")) {
    issues.push({ level: "warning", code: "medium_unnoetig", message: "Dieses Format veröffentlicht keine Medien – zugeordnete Medien werden ignoriert." });
  }

  for (const m of visual) {
    const rule = applicable.find((r) => r.media_kind === m.kind);
    if (!rule) {
      if (!acceptedKinds.has("keins")) {
        issues.push({
          level: "error",
          code: "medienart",
          message: `${m.kind === "video" ? "Videos" : "Bilder"} sind für ${applicable[0].label} nicht vorgesehen.`,
          mediaId: m.id,
        });
      }
      continue;
    }
    issues.push(...validateMedia(m, rule));
  }

  if (content.kind === "social") {
    const length = countCaptionLength(content.caption, content.hashtags);
    const captionMax = applicable.map((r) => r.caption_max_length).find((n) => n != null);
    const hashtagsMax = applicable.map((r) => r.hashtags_max).find((n) => n != null);
    if (!content.caption?.trim()) {
      issues.push({ level: "error", code: "text_fehlt", message: "Der Kanaltext fehlt." });
    }
    if (captionMax && length > captionMax) {
      issues.push({ level: "error", code: "text_lang", message: `Text inkl. Hashtags hat ${length} Zeichen (max. ${captionMax}).` });
    }
    const tagCount = (content.hashtags ?? []).length + ((content.caption ?? "").match(/(^|\s)#[\p{L}\p{N}_]+/gu)?.length ?? 0);
    if (hashtagsMax && tagCount > hashtagsMax) {
      issues.push({ level: "error", code: "hashtags", message: `${tagCount} Hashtags (max. ${hashtagsMax}).` });
    }
  }

  if (content.kind === "magazinartikel" && !content.body_html?.replace(/<[^>]*>/g, "").trim()) {
    issues.push({ level: "error", code: "text_fehlt", message: "Der Artikeltext fehlt." });
  }

  return issues;
}

export function hasBlockingIssues(issues: Issue[]): boolean {
  return issues.some((i) => i.level === "error");
}
