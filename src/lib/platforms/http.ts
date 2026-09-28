import "server-only";

export interface HttpResult<T = unknown> {
  ok: boolean;
  status: number;
  body: T;
  headers: Headers;
  networkError?: string;
}

/**
 * fetch mit Zeitlimit. Netzwerkfehler werden nicht geworfen, sondern als
 * networkError gemeldet – der Aufrufer entscheidet, ob das Ergebnis "unklar" ist.
 */
export async function httpJson<T = unknown>(
  url: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<HttpResult<T>> {
  const { timeoutMs = 20_000, ...rest } = init;
  try {
    const res = await fetch(url, { ...rest, signal: AbortSignal.timeout(timeoutMs), cache: "no-store" });
    const text = await res.text();
    let body: unknown = text;
    try {
      body = text ? JSON.parse(text) : {};
    } catch {
      // kein JSON
    }
    return { ok: res.ok, status: res.status, body: body as T, headers: res.headers };
  } catch (error) {
    return { ok: false, status: 0, body: {} as T, headers: new Headers(), networkError: (error as Error).message };
  }
}

export function graphErrorMessage(body: unknown): string {
  const err = (body as { error?: { message?: string; code?: number; error_subcode?: number; error_user_msg?: string } })?.error;
  if (!err) return typeof body === "string" ? body.slice(0, 500) : "Unbekannter Fehler der Plattform";
  return [err.error_user_msg ?? err.message, err.code ? `(Code ${err.code}${err.error_subcode ? `/${err.error_subcode}` : ""})` : ""]
    .filter(Boolean)
    .join(" ");
}
