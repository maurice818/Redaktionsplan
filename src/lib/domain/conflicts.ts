import { berlinDate } from "@/lib/time";

/** Terminüberschneidungen und Überlastung einzelner Tage im Redaktionskalender. */
export interface ScheduledEntry {
  id: string;
  title: string;
  channel: string;
  scheduled_at: string;
}

export interface ConflictWarning {
  kind: "ueberlastung" | "ueberschneidung";
  day: string;
  message: string;
  ids: string[];
}

export function findConflicts(
  entries: ScheduledEntry[],
  maxPerDay: number,
  minMinutesBetween: number,
): ConflictWarning[] {
  const warnings: ConflictWarning[] = [];
  const byDay = new Map<string, ScheduledEntry[]>();
  for (const e of entries) {
    const day = berlinDate(e.scheduled_at);
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day)!.push(e);
  }

  for (const [day, list] of byDay) {
    if (maxPerDay > 0 && list.length > maxPerDay) {
      warnings.push({
        kind: "ueberlastung",
        day,
        message: `${list.length} Veröffentlichungen an einem Tag (Warnschwelle: ${maxPerDay}).`,
        ids: list.map((e) => e.id),
      });
    }
    const byChannel = new Map<string, ScheduledEntry[]>();
    for (const e of list) {
      if (!byChannel.has(e.channel)) byChannel.set(e.channel, []);
      byChannel.get(e.channel)!.push(e);
    }
    for (const [channel, items] of byChannel) {
      const sorted = [...items].sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));
      for (let i = 1; i < sorted.length; i++) {
        const gap = (new Date(sorted[i].scheduled_at).getTime() - new Date(sorted[i - 1].scheduled_at).getTime()) / 60_000;
        if (gap < minMinutesBetween) {
          warnings.push({
            kind: "ueberschneidung",
            day,
            message: `„${sorted[i - 1].title}“ und „${sorted[i].title}“ liegen im selben Kanal (${channel}) nur ${Math.round(gap)} Minuten auseinander.`,
            ids: [sorted[i - 1].id, sorted[i].id],
          });
        }
      }
    }
  }
  return warnings.sort((a, b) => a.day.localeCompare(b.day));
}
