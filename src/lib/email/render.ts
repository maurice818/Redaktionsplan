/**
 * Rendering von E-Mail-Vorlagen mit {{platzhalter}}.
 * Werte werden für HTML escaped; URLs werden zu Links, der Hauptlink ({{link}})
 * zusätzlich als Schaltfläche dargestellt.
 */
export type TemplateVars = Record<string, string | null | undefined>;

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

const PLACEHOLDER = /\{\{\s*([a-z0-9_]+)\s*\}\}/gi;

export function fillPlaceholders(template: string, vars: TemplateVars): string {
  return template.replace(PLACEHOLDER, (_, key: string) => vars[key] ?? "");
}

export function findPlaceholders(template: string): string[] {
  return [...new Set([...template.matchAll(PLACEHOLDER)].map((m) => m[1]))];
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const URL_RE = /(https?:\/\/[^\s<]+[^\s<.,;:!?)"'])/g;

function linkify(escaped: string): string {
  return escaped.replace(URL_RE, (url) => `<a href="${url}" style="color:#b90845;word-break:break-all">${url}</a>`);
}

export function renderEmail(tpl: { subject: string; body: string }, vars: TemplateVars): RenderedEmail {
  const subject = fillPlaceholders(tpl.subject, vars).replace(/\s+/g, " ").trim();
  const text = fillPlaceholders(tpl.body, vars).replace(/\n{3,}/g, "\n\n").trim();
  const link = vars.link ?? "";

  const paragraphs = text.split(/\n{2,}/).map((block) => {
    const trimmed = block.trim();
    if (link && trimmed === link) {
      return `<p style="margin:24px 0"><a href="${escapeHtml(link)}" style="display:inline-block;background:#b90845;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600">Jetzt öffnen</a></p>
<p style="margin:0 0 16px;font-size:12px;color:#6b6b6b">Falls die Schaltfläche nicht funktioniert: ${linkify(escapeHtml(link))}</p>`;
    }
    return `<p style="margin:0 0 16px">${linkify(escapeHtml(trimmed)).replace(/\n/g, "<br>")}</p>`;
  });

  const html = `<!doctype html>
<html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;background:#f7f6f4;font-family:Rubik,Segoe UI,Helvetica,Arial,sans-serif;color:#2b2b2b;line-height:1.55">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f6f4;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e4e0dd">
<tr><td style="background:#2a1430;padding:18px 24px;color:#ffffff;font-weight:600;letter-spacing:.08em">MEET GERMANY</td></tr>
<tr><td style="padding:28px 24px 12px;font-size:15px">${paragraphs.join("\n")}</td></tr>
<tr><td style="padding:16px 24px 24px;font-size:12px;color:#6b6b6b;border-top:1px solid #efece9">Diese Nachricht wurde über die MEET GERMANY Redaktionszentrale versendet. Der enthaltene Link ist persönlich – bitte nicht weiterleiten.</td></tr>
</table></td></tr></table></body></html>`;

  return { subject, text, html };
}
