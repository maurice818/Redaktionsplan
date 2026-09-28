import sanitizeHtml from "sanitize-html";

/**
 * Bereinigt HTML aus dem Rich-Text-Editor (serverseitig vor dem Speichern).
 * Erlaubt nur redaktionelle Auszeichnungen – keine Skripte, Styles oder Events.
 */
export function sanitizeArticleHtml(html: string | null | undefined): string {
  if (!html) return "";
  return sanitizeHtml(html, {
    allowedTags: ["p", "br", "h2", "h3", "h4", "strong", "em", "u", "s", "a", "ul", "ol", "li", "blockquote", "hr", "code", "pre"],
    allowedAttributes: { a: ["href", "target", "rel"] },
    allowedSchemes: ["https", "http", "mailto"],
    transformTags: {
      a: sanitizeHtml.simpleTransform("a", { rel: "noopener noreferrer", target: "_blank" }),
      h1: "h2",
      b: "strong",
      i: "em",
    },
  }).trim();
}

export function htmlToPlainText(html: string | null | undefined): string {
  if (!html) return "";
  return sanitizeHtml(html.replace(/<\/(p|h[1-6]|li|blockquote)>/gi, "\n").replace(/<br\s*\/?>/gi, "\n"), {
    allowedTags: [],
    allowedAttributes: {},
  })
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
