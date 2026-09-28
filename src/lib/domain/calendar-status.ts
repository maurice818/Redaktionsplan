/**
 * Kalenderstatus eines Inhalts: vorläufig, freigegeben, verbindlich geplant,
 * veröffentlicht oder blockiert – inklusive verständlicher Gründe.
 */
export type CalendarStatusKey = "vorlaeufig" | "freigegeben" | "verbindlich" | "veroeffentlicht" | "blockiert";

export interface CalendarStatusInput {
  status: string;
  schedule_status: string;
  scheduled_at: string | null;
  approvals_complete: boolean;
  published_at: string | null;
  approval_invalidated_at?: string | null;
}

export interface CalendarStatus {
  key: CalendarStatusKey;
  reasons: string[];
}

const HOUR = 3_600_000;

export function calendarStatus(
  item: CalendarStatusInput,
  jobStatus: string | null | undefined,
  now: Date = new Date(),
): CalendarStatus {
  if (item.status === "veroeffentlicht" && item.published_at) {
    return { key: "veroeffentlicht", reasons: [] };
  }

  const reasons: string[] = [];
  if (jobStatus === "fehlgeschlagen") reasons.push("Veröffentlichung fehlgeschlagen");
  if (jobStatus === "unklar") reasons.push("Ergebnis der Veröffentlichung unklar");
  if (item.status === "aenderung_gewuenscht") reasons.push("Änderungswunsch offen");

  if (item.scheduled_at) {
    const at = new Date(item.scheduled_at).getTime();
    if (at < now.getTime() - HOUR) {
      reasons.push("Termin überschritten, nicht veröffentlicht");
    } else if (!item.approvals_complete && at - now.getTime() < 48 * HOUR) {
      reasons.push("Termin in weniger als 48 Stunden ohne vollständige Freigabe");
    }
  }

  if (
    item.approval_invalidated_at &&
    item.schedule_status !== "verbindlich" &&
    !item.approvals_complete &&
    now.getTime() - new Date(item.approval_invalidated_at).getTime() < 14 * 24 * HOUR
  ) {
    reasons.push("Freigabe durch Änderung ungültig geworden");
  }

  if (reasons.length > 0) return { key: "blockiert", reasons };
  if (item.schedule_status === "verbindlich") return { key: "verbindlich", reasons };
  if (item.approvals_complete) return { key: "freigegeben", reasons };
  return { key: "vorlaeufig", reasons };
}
