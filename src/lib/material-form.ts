import { z } from "zod";

/** Feldtypen des konfigurierbaren Materialformulars. */
export type MaterialFieldType = "text" | "textarea" | "url" | "date" | "list" | "files" | "checkbox" | "heading";

export interface MaterialField {
  key: string;
  label: string;
  type: MaterialFieldType;
  required?: boolean;
  help?: string;
  placeholder?: string;
  count?: number;
  prefill?: "client_name" | "recipient_name";
}

export const FIELD_TYPE_LABELS: Record<MaterialFieldType, string> = {
  text: "Einzeiliger Text",
  textarea: "Mehrzeiliger Text",
  url: "Link",
  date: "Datum",
  list: "Liste (mehrere Punkte)",
  files: "Dateien / Bildmaterial",
  checkbox: "Bestätigung (Checkbox)",
  heading: "Zwischenüberschrift",
};

export function parseFields(raw: unknown): MaterialField[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((f): f is Record<string, unknown> => Boolean(f) && typeof f === "object")
    .map((f) => ({
      key: String(f.key ?? ""),
      label: String(f.label ?? ""),
      type: (String(f.type ?? "text") as MaterialFieldType),
      required: Boolean(f.required),
      help: f.help ? String(f.help) : undefined,
      placeholder: f.placeholder ? String(f.placeholder) : undefined,
      count: typeof f.count === "number" ? f.count : undefined,
      prefill: f.prefill === "client_name" || f.prefill === "recipient_name" ? (f.prefill as MaterialField["prefill"]) : undefined,
    }))
    .filter((f) => f.key && f.label);
}

/** Serverseitige Validierung der Antworten anhand der Felddefinition (Formularstand beim Versand). */
export function answersSchema(fields: MaterialField[], submit: boolean) {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const f of fields) {
    if (f.type === "files" || f.type === "heading") continue;
    let s: z.ZodTypeAny;
    switch (f.type) {
      case "list":
        // Leere Punkte können als null/undefined ankommen (z. B. Punkt 3 vor Punkt 1 ausgefüllt)
        s = z
          .array(
            z.string().nullish()
              .transform((v) => (v ?? "").trim())
              .refine((v) => v.length <= 1000, "Maximal 1000 Zeichen je Punkt."),
          )
          .max(f.count ?? 10, `„${f.label}“: zu viele Punkte.`);
        if (submit && f.required) s = s.refine((a) => (a as string[]).some((x) => x.trim()), `„${f.label}“ ist ein Pflichtfeld.`);
        break;
      case "url":
        s = z.string().trim().max(2000).refine((v) => v === "" || /^https?:\/\/\S+$/i.test(v), `„${f.label}“: bitte einen vollständigen Link angeben.`);
        if (submit && f.required) s = s.refine((v) => (v as string).length > 0, `„${f.label}“ ist ein Pflichtfeld.`);
        break;
      case "checkbox":
        s = z.boolean();
        if (submit && f.required) s = s.refine((v) => v === true, `Bitte „${f.label}“ bestätigen.`);
        break;
      case "date":
        s = z.string().trim().max(10).refine((v) => v === "" || /^\d{4}-\d{2}-\d{2}$/.test(v), `„${f.label}“: ungültiges Datum.`);
        if (submit && f.required) s = s.refine((v) => (v as string).length > 0, `„${f.label}“ ist ein Pflichtfeld.`);
        break;
      default:
        s = z.string().trim().max(f.type === "textarea" ? 10000 : 500, "Der Text ist zu lang.");
        if (submit && f.required) s = s.refine((v) => (v as string).length > 0, `„${f.label}“ ist ein Pflichtfeld.`);
    }
    shape[f.key] = s.optional();
  }
  return z.object(shape).strip();
}
