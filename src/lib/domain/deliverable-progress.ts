/**
 * Fortschritt zugesagter Leistungen, z. B.
 * „2 von 4 Artikeln veröffentlicht; 1 wartet auf Freigabe; 1 noch ohne Thema“.
 */
export type ProgressKey =
  | "ohne_thema"
  | "offen"
  | "in_vorbereitung"
  | "wartet_auf_material"
  | "interne_pruefung"
  | "wartet_auf_freigabe"
  | "aenderungen"
  | "freigegeben"
  | "geplant"
  | "veroeffentlicht"
  | "erbracht"
  | "entfallen"
  | "laufend";

export interface ProgressInput {
  status: string; // offen | in_arbeit | erbracht | entfallen
  content_kind: string | null;
  hasDossier: boolean;
  materialPending?: boolean;
  contents: { status: string; schedule_status: string; published_at: string | null }[];
}

export function deliverableProgress(d: ProgressInput): ProgressKey {
  if (d.status === "entfallen") return "entfallen";
  if (d.contents.some((c) => c.status === "veroeffentlicht" && c.published_at)) return "veroeffentlicht";
  if (d.status === "erbracht") return "erbracht";

  // Leistungen ohne Redaktionseinheit (Firmenprofil, Circle …)
  if (!d.content_kind) return d.status === "in_arbeit" ? "laufend" : "offen";

  if (!d.hasDossier && d.contents.length === 0) return "ohne_thema";
  if (d.contents.some((c) => c.status === "freigegeben" && c.schedule_status === "verbindlich")) return "geplant";
  const statuses = new Set(d.contents.map((c) => c.status));
  if (statuses.has("freigegeben")) return "freigegeben";
  if (statuses.has("aenderung_gewuenscht")) return "aenderungen";
  if (statuses.has("beim_kunden") || statuses.has("intern_freigegeben")) return "wartet_auf_freigabe";
  if (statuses.has("interne_pruefung")) return "interne_pruefung";
  if (d.materialPending) return "wartet_auf_material";
  return "in_vorbereitung";
}

export function isDoneProgress(key: ProgressKey): boolean {
  return key === "veroeffentlicht" || key === "erbracht";
}

const PHRASE: Record<ProgressKey, [singular: string, plural: string]> = {
  veroeffentlicht: ["veröffentlicht", "veröffentlicht"],
  erbracht: ["erbracht", "erbracht"],
  geplant: ["verbindlich geplant", "verbindlich geplant"],
  freigegeben: ["freigegeben", "freigegeben"],
  wartet_auf_freigabe: ["wartet auf Freigabe", "warten auf Freigabe"],
  aenderungen: ["in Überarbeitung", "in Überarbeitung"],
  interne_pruefung: ["in interner Prüfung", "in interner Prüfung"],
  wartet_auf_material: ["wartet auf Material", "warten auf Material"],
  in_vorbereitung: ["in Vorbereitung", "in Vorbereitung"],
  ohne_thema: ["noch ohne Thema", "noch ohne Thema"],
  offen: ["offen", "offen"],
  laufend: ["laufend", "laufend"],
  entfallen: ["entfallen", "entfallen"],
};

const ORDER: ProgressKey[] = [
  "geplant", "freigegeben", "wartet_auf_freigabe", "aenderungen", "interne_pruefung",
  "wartet_auf_material", "in_vorbereitung", "laufend", "offen", "ohne_thema",
];

function noun(contentKind: string | null, total: number): string {
  if (contentKind === "magazinartikel") return total === 1 ? "Artikel" : "Artikeln";
  if (contentKind === "social") return total === 1 ? "Social-Beitrag" : "Social-Beiträgen";
  return total === 1 ? "Leistung" : "Leistungen";
}

/** Zusammenfassung für eine Gruppe gleichartiger Leistungseinheiten. */
export function summarizeGroup(keys: ProgressKey[], contentKind: string | null, title: string): string {
  const active = keys.filter((k) => k !== "entfallen");
  const cancelled = keys.length - active.length;
  if (active.length === 0) return cancelled ? `${title}: entfallen` : `${title}: keine Einheiten`;

  if (!contentKind && active.length === 1) {
    return `${title}: ${PHRASE[active[0]][0]}`;
  }

  const done = active.filter(isDoneProgress).length;
  const head = `${done} von ${active.length} ${noun(contentKind, active.length)} ${contentKind ? "veröffentlicht" : "erbracht"}`;
  const counts = new Map<ProgressKey, number>();
  for (const k of active) {
    if (!isDoneProgress(k)) counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const rest = ORDER.filter((k) => counts.has(k)).map((k) => {
    const n = counts.get(k)!;
    return `${n} ${PHRASE[k][n === 1 ? 0 : 1]}`;
  });
  if (cancelled) rest.push(`${cancelled} entfallen`);
  return [head, ...rest].join("; ");
}
