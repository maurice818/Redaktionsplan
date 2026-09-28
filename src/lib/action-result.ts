import { ZodError } from "zod";

export type ActionResult<T = null> =
  | { ok: true; data: T; message?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

export function ok<T>(data: T, message?: string): ActionResult<T> {
  return { ok: true, data, message };
}

export function fail(error: string, fieldErrors?: Record<string, string>): ActionResult<never> {
  return { ok: false, error, fieldErrors };
}

interface PgLikeError {
  message?: string;
  code?: string;
  details?: string | null;
  hint?: string | null;
}

/** Übersetzt Datenbank-/Validierungsfehler in verständliche deutsche Meldungen. */
export function toErrorMessage(error: unknown): string {
  if (error instanceof ZodError) {
    return error.issues[0]?.message ?? "Bitte prüfen Sie Ihre Eingaben.";
  }
  const e = error as PgLikeError & Error;
  const code = e?.code;
  const msg = e?.message ?? String(error);
  // Unsere Datenbankfunktionen liefern bereits deutsche Meldungen
  if (code === "P0001" || code === "22023" || code === "P0002") return msg;
  if (code === "42501") return /[äöüÄÖÜß]|Berechtigung|Nur /.test(msg) ? msg : "Dafür fehlt Ihnen die Berechtigung.";
  if (code === "23505") return "Dieser Eintrag existiert bereits.";
  if (code === "23503") return "Der Eintrag ist noch mit anderen Daten verknüpft oder ein verknüpfter Datensatz fehlt.";
  if (code === "23514") return "Die Eingaben verletzen eine Plausibilitätsregel (z. B. Enddatum vor Startdatum oder fehlende Begründung).";
  if (code === "PGRST116") return "Der Datensatz wurde nicht gefunden oder Sie haben keinen Zugriff.";
  if (e?.name === "PermissionError") return msg;
  if (/fetch failed|ECONNREFUSED|ENOTFOUND/i.test(msg)) return "Die Datenbank ist nicht erreichbar. Bitte Supabase-Verbindung prüfen.";
  return msg || "Unbekannter Fehler.";
}

export function zodFieldErrors(error: ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".");
    if (key && !out[key]) out[key] = issue.message;
  }
  return out;
}

/** Wrapper für Server Actions: fängt Fehler und liefert ActionResult. */
export async function runAction<T>(fn: () => Promise<T>, successMessage?: string): Promise<ActionResult<T>> {
  try {
    const data = await fn();
    return ok(data, successMessage);
  } catch (error) {
    if (error instanceof ZodError) return fail(toErrorMessage(error), zodFieldErrors(error));
    // Next.js-Redirects/NotFound nicht verschlucken
    if (error && typeof error === "object" && "digest" in error && String((error as { digest: unknown }).digest).startsWith("NEXT_")) {
      throw error;
    }
    return fail(toErrorMessage(error));
  }
}

/**
 * Wirft den Supabase-Fehler weiter, damit runAction ihn übersetzt.
 * Ohne Fehler liefert PostgREST bei .single()/rpc die Daten – daher nicht-null.
 */
export function check<R extends { data: unknown; error: PgLikeError | null }>(res: R): NonNullable<R["data"]> {
  if (res.error) throw res.error;
  return res.data as NonNullable<R["data"]>;
}
