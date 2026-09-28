import { TZDate } from "@date-fns/tz";

/**
 * Zeitlogik der Redaktionszentrale.
 *
 *  - Zeitpunkte (timestamptz) werden als ISO-String in UTC gespeichert und
 *    grundsätzlich in Europe/Berlin angezeigt.
 *  - Kalendertage (date) sind Strings "YYYY-MM-DD" und beziehen sich immer auf
 *    den Berliner Kalender (keine Zeitzonenverschiebung).
 */
export const TZ = "Europe/Berlin";

const dateFmt = new Intl.DateTimeFormat("de-DE", { timeZone: TZ, day: "2-digit", month: "2-digit", year: "numeric" });
const dateTimeFmt = new Intl.DateTimeFormat("de-DE", {
  timeZone: TZ, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
});
const timeFmt = new Intl.DateTimeFormat("de-DE", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
const weekdayFmt = new Intl.DateTimeFormat("de-DE", { timeZone: TZ, weekday: "short" });
const longDateFmt = new Intl.DateTimeFormat("de-DE", { timeZone: TZ, weekday: "long", day: "numeric", month: "long", year: "numeric" });
const monthFmt = new Intl.DateTimeFormat("de-DE", { timeZone: "UTC", month: "long", year: "numeric" });
const partsFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** Aktueller Zeitpunkt der Anfrage (Server Components rendern pro Anfrage genau einmal). */
export function requestNow(): number {
  return Date.now();
}

/** ISO-Zeitpunkt relativ zu jetzt (z. B. offsetMs = 7 Tage). */
export function isoFromNow(offsetMs = 0): string {
  return new Date(requestNow() + offsetMs).toISOString();
}

function toDate(value: string | Date): Date {
  return value instanceof Date ? value : new Date(value);
}

/** "YYYY-MM-DD" → Date um 12:00 UTC (stabil für reine Kalenderberechnungen). */
export function dateOnlyToUtcNoon(day: string): Date {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12));
}

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return "–";
  if (typeof value === "string" && DATE_ONLY.test(value)) {
    const [y, m, d] = value.split("-");
    return `${d}.${m}.${y}`;
  }
  return dateFmt.format(toDate(value));
}

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return "–";
  return `${dateTimeFmt.format(toDate(value))} Uhr`;
}

export function formatTime(value: string | Date | null | undefined): string {
  if (!value) return "";
  return timeFmt.format(toDate(value));
}

export function formatWeekday(value: string | Date): string {
  if (typeof value === "string" && DATE_ONLY.test(value)) {
    return new Intl.DateTimeFormat("de-DE", { timeZone: "UTC", weekday: "short" }).format(dateOnlyToUtcNoon(value));
  }
  return weekdayFmt.format(toDate(value));
}

export function formatLongDate(value: string | Date): string {
  if (typeof value === "string" && DATE_ONLY.test(value)) {
    return new Intl.DateTimeFormat("de-DE", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long", year: "numeric" })
      .format(dateOnlyToUtcNoon(value));
  }
  return longDateFmt.format(toDate(value));
}

export function formatMonth(day: string): string {
  return monthFmt.format(dateOnlyToUtcNoon(day));
}

function berlinParts(value: string | Date) {
  const parts = Object.fromEntries(partsFmt.formatToParts(toDate(value)).map((p) => [p.type, p.value]));
  return { y: parts.year, m: parts.month, d: parts.day, h: parts.hour, min: parts.minute };
}

/** Berliner Kalendertag eines Zeitpunkts als "YYYY-MM-DD". */
export function berlinDate(value: string | Date): string {
  const p = berlinParts(value);
  return `${p.y}-${p.m}-${p.d}`;
}

/** Heutiger Berliner Kalendertag. */
export function berlinToday(now: Date = new Date()): string {
  return berlinDate(now);
}

/** Wert für <input type="datetime-local"> in Berliner Ortszeit. */
export function toBerlinLocalInput(value: string | Date | null | undefined): string {
  if (!value) return "";
  const p = berlinParts(value);
  return `${p.y}-${p.m}-${p.d}T${p.h}:${p.min}`;
}

/** "YYYY-MM-DDTHH:mm" (Berliner Ortszeit) → eindeutiger ISO-Zeitpunkt in UTC. */
export function berlinLocalToIso(local: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(local);
  if (!match) throw new Error(`Ungültige Ortszeit: ${local}`);
  const [, y, m, d, h, min] = match.map(Number);
  // TZDate#toISOString liefert den Offset der Zone – für die Speicherung normieren wir auf UTC.
  return new Date(new TZDate(y, m - 1, d, h, min, TZ).getTime()).toISOString();
}

/** Beginn eines Berliner Kalendertags als ISO-Zeitpunkt (UTC). */
export function berlinDayStartIso(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(new TZDate(y, m - 1, d, 0, 0, TZ).getTime()).toISOString();
}

export function addDays(day: string, n: number): string {
  const date = dateOnlyToUtcNoon(day);
  date.setUTCDate(date.getUTCDate() + n);
  return date.toISOString().slice(0, 10);
}

export function addMonths(day: string, n: number): string {
  const date = dateOnlyToUtcNoon(day);
  const targetMonth = date.getUTCMonth() + n;
  const result = new Date(Date.UTC(date.getUTCFullYear(), targetMonth, 1, 12));
  const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0, 12)).getUTCDate();
  result.setUTCDate(Math.min(date.getUTCDate(), lastDay));
  return result.toISOString().slice(0, 10);
}

/** Anzahl Kalendertage von a nach b (b − a). */
export function daysBetween(a: string, b: string): number {
  return Math.round((dateOnlyToUtcNoon(b).getTime() - dateOnlyToUtcNoon(a).getTime()) / 86_400_000);
}

/** Montag der Woche (ISO-Woche) für einen Kalendertag. */
export function startOfWeek(day: string): string {
  const date = dateOnlyToUtcNoon(day);
  const weekday = (date.getUTCDay() + 6) % 7; // Mo = 0
  return addDays(day, -weekday);
}

export function startOfMonth(day: string): string {
  return `${day.slice(0, 7)}-01`;
}

export function endOfMonth(day: string): string {
  const d = dateOnlyToUtcNoon(startOfMonth(day));
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0, 12)).toISOString().slice(0, 10);
}

export function isoWeekNumber(day: string): number {
  const date = dateOnlyToUtcNoon(day);
  const target = new Date(date);
  target.setUTCDate(date.getUTCDate() + 3 - ((date.getUTCDay() + 6) % 7));
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4, 12));
  return 1 + Math.round(((target.getTime() - firstThursday.getTime()) / 86_400_000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
}

/** "heute", "morgen", "gestern", "in 3 Tagen", "vor 2 Tagen" */
export function relativeDay(day: string, today: string = berlinToday()): string {
  const diff = daysBetween(today, day);
  if (diff === 0) return "heute";
  if (diff === 1) return "morgen";
  if (diff === -1) return "gestern";
  if (diff > 1) return `in ${diff} Tagen`;
  return `vor ${Math.abs(diff)} Tagen`;
}

export function isValidDateOnly(value: string): boolean {
  if (!DATE_ONLY.test(value)) return false;
  const d = dateOnlyToUtcNoon(value);
  return d.toISOString().slice(0, 10) === value;
}
