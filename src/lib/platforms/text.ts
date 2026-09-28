/**
 * Zusammensetzen des Kanaltexts aus Text, Call-to-Action, Link und Hashtags.
 */
export interface SocialTextInput {
  caption: string | null;
  cta: string | null;
  hashtags: string[] | null;
  link_url: string | null;
  channel: string;
  post_format: string | null;
}

export function normalizeHashtag(tag: string): string {
  const cleaned = tag.trim().replace(/^#+/, "").replace(/\s+/g, "");
  return cleaned ? `#${cleaned}` : "";
}

export function composeSocialText(input: SocialTextInput): string {
  const parts: string[] = [];
  if (input.caption?.trim()) parts.push(input.caption.trim());
  if (input.cta?.trim()) parts.push(input.cta.trim());
  // Bei Link-Beiträgen übergibt der Adapter den Link separat; sonst im Text belassen.
  if (input.link_url && input.post_format !== "link" && input.channel !== "instagram") {
    parts.push(input.link_url);
  }
  const tags = (input.hashtags ?? []).map(normalizeHashtag).filter(Boolean);
  if (tags.length) parts.push(tags.join(" "));
  return parts.join("\n\n");
}

/**
 * LinkedIn "Little Text Format": reservierte Zeichen müssen mit Backslash
 * maskiert werden; Hashtags werden als {hashtag|\#|tag} übergeben.
 * https://learn.microsoft.com/linkedin/marketing/community-management/shares/little-text-format
 */
export function toLinkedInLittleText(text: string): string {
  const escapeChars = (s: string) => s.replace(/[\\|{}@[\]()<>*_~]/g, (c) => `\\${c}`);
  return text
    .split(/(#[\p{L}\p{N}_]+)/u)
    .map((part) => {
      if (/^#[\p{L}\p{N}_]+$/u.test(part)) {
        return `{hashtag|\\#|${escapeChars(part.slice(1))}}`;
      }
      return escapeChars(part).replace(/#/g, "\\#");
    })
    .join("");
}
