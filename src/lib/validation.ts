import { z } from "zod";
import { isValidDateOnly } from "@/lib/time";

/** Gemeinsame Zod-Bausteine mit deutschen Fehlermeldungen. */
export const optionalText = (max = 5000) =>
  z.string().trim().max(max, `Maximal ${max} Zeichen.`).optional().transform((v) => (v ? v : null));

export const requiredText = (label: string, max = 300) =>
  z.string({ error: `${label} ist erforderlich.` }).trim().min(1, `${label} ist erforderlich.`).max(max, `Maximal ${max} Zeichen.`);

export const uuid = z.string().uuid("Ungültige Auswahl.");
export const optionalUuid = z
  .string()
  .optional()
  .transform((v) => (v && v !== "none" ? v : null))
  .refine((v) => v === null || /^[0-9a-f-]{36}$/i.test(v), "Ungültige Auswahl.");

export const dateOnly = z.string().refine(isValidDateOnly, "Bitte ein gültiges Datum angeben.");
export const optionalDate = z
  .string()
  .optional()
  .transform((v) => (v ? v : null))
  .refine((v) => v === null || isValidDateOnly(v), "Bitte ein gültiges Datum angeben.");

export const optionalUrl = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? v : null))
  .refine((v) => v === null || /^https?:\/\/[^\s]+$/i.test(v), "Bitte eine vollständige URL mit https:// angeben.");

export const optionalEmail = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? v.toLowerCase() : null))
  .refine((v) => v === null || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v), "Bitte eine gültige E-Mail-Adresse angeben.");

export const email = z.string().trim().toLowerCase().email("Bitte eine gültige E-Mail-Adresse angeben.");

/** FormData → einfaches Objekt (Mehrfachwerte als Array). */
export function formToObject(formData: FormData): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value !== "string") continue;
    if (key in out) {
      const prev = out[key];
      out[key] = Array.isArray(prev) ? [...prev, value] : [prev, value];
    } else {
      out[key] = value;
    }
  }
  return out;
}

/** Suchtext für PostgREST-ilike/or-Filter entschärfen (keine Steuerzeichen der Filtersyntax). */
export function safeSearch(value: string | undefined | null): string {
  return (value ?? "").replace(/[%,()"'\\*:]/g, " ").trim().slice(0, 80);
}

export function parseHashtags(input: string | null | undefined): string[] {
  if (!input) return [];
  return [...new Set(input.split(/[\s,]+/).map((t) => t.trim().replace(/^#*/, "")).filter(Boolean).map((t) => `#${t}`))].slice(0, 60);
}
