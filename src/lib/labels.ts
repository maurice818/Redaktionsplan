/**
 * Verständliche deutsche Bezeichnungen für alle technischen Statuswerte.
 * Farbtöne (tone) werden von <StatusBadge> in ruhige Farben übersetzt.
 */
export type Tone = "neutral" | "info" | "waiting" | "success" | "brand" | "danger" | "warning";

export interface LabelDef {
  label: string;
  tone: Tone;
  hint?: string;
}

type LabelMap = Record<string, LabelDef>;

export const ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  redaktion: "Redaktion",
  freigabe: "Freigabe/Leitung",
  mitarbeit: "Mitarbeit",
};

export const ROLE_DESCRIPTIONS: Record<string, string> = {
  admin: "Einstellungen, Pakete, Team, Integrationen und alle Inhalte verwalten.",
  redaktion: "Kunden, Leistungen, Themen, Artikel, Social-Beiträge und Aufgaben bearbeiten.",
  freigabe: "Wie Redaktion – zusätzlich interne Freigabe und verbindliche Planung von Veröffentlichungen.",
  mitarbeit: "Zugewiesene Aufgaben und Inhalte bearbeiten.",
};

export const CONTENT_STATUS: LabelMap = {
  entwurf: { label: "In Arbeit", tone: "neutral" },
  interne_pruefung: { label: "Wartet auf interne Prüfung", tone: "info" },
  intern_freigegeben: { label: "Intern freigegeben", tone: "info", hint: "Kundenvorschau kann versendet werden" },
  beim_kunden: { label: "Beim Kunden zur Freigabe", tone: "waiting" },
  aenderung_gewuenscht: { label: "Änderung gewünscht", tone: "warning" },
  freigegeben: { label: "Freigegeben", tone: "success" },
  veroeffentlicht: { label: "Veröffentlicht", tone: "success" },
  archiviert: { label: "Archiviert", tone: "neutral" },
};

export const SCHEDULE_STATUS: LabelMap = {
  ohne_termin: { label: "Ohne Termin", tone: "neutral" },
  vorlaeufig: { label: "Vorläufig geplant", tone: "neutral" },
  verbindlich: { label: "Verbindlich eingeplant", tone: "brand" },
};

export const CALENDAR_STATUS: LabelMap = {
  vorlaeufig: { label: "Vorläufig", tone: "neutral" },
  freigegeben: { label: "Freigegeben", tone: "success" },
  verbindlich: { label: "Verbindlich geplant", tone: "brand" },
  veroeffentlicht: { label: "Veröffentlicht", tone: "success" },
  blockiert: { label: "Blockiert", tone: "danger" },
};

export const CHANNEL_LABELS: Record<string, string> = {
  magazin: "MICE Magazin",
  instagram: "Instagram",
  facebook: "Facebook",
  linkedin: "LinkedIn",
};

export const CONTENT_KIND_LABELS: Record<string, string> = {
  magazinartikel: "Magazinartikel",
  social: "Social-Beitrag",
};

export const POST_FORMAT_LABELS: Record<string, string> = {
  artikel: "Artikel",
  feed_bild: "Feed-Bild",
  karussell: "Karussell / Mehrbild",
  reel: "Reel",
  story: "Story",
  video: "Video",
  text: "Nur Text",
  link: "Link-Beitrag",
};

export const TASK_STATUS: LabelMap = {
  offen: { label: "Offen", tone: "neutral" },
  in_arbeit: { label: "In Arbeit", tone: "info" },
  wartet_auf_kunde: { label: "Wartet auf Kunde", tone: "waiting" },
  erledigt: { label: "Erledigt", tone: "success" },
  abgebrochen: { label: "Abgebrochen", tone: "neutral" },
};

export const TASK_PRIORITY: LabelMap = {
  niedrig: { label: "Niedrig", tone: "neutral" },
  normal: { label: "Normal", tone: "neutral" },
  hoch: { label: "Hoch", tone: "warning" },
  dringend: { label: "Dringend", tone: "danger" },
};

export const TASK_TYPE_LABELS: Record<string, string> = {
  allgemein: "Allgemein",
  material_anfordern: "Material anfordern",
  material_pruefen: "Material prüfen",
  rueckfrage: "Rückfrage",
  entwurf: "Entwurf",
  social_vorbereiten: "Social vorbereiten",
  grafik: "Grafik",
  interne_pruefung: "Interne Prüfung",
  kundenvorschau: "Kundenvorschau",
  kundenfeedback: "Kundenfeedback",
  aenderungen: "Änderungen",
  terminierung: "Terminierung",
  manuelle_veroeffentlichung: "Manuelle Veröffentlichung",
  nachweis: "Nachweis",
  erinnerung: "Erinnerung",
};

export const DELIVERABLE_STATUS: LabelMap = {
  offen: { label: "Offen", tone: "neutral" },
  in_arbeit: { label: "In Arbeit", tone: "info" },
  erbracht: { label: "Erbracht", tone: "success" },
  entfallen: { label: "Entfallen", tone: "neutral" },
};

export const DELIVERABLE_SOURCE: Record<string, string> = {
  paket: "Paketleistung",
  zusatzbuchung: "Zusatzbuchung",
  korrektur: "Korrektur",
  manuell: "Manuell erfasst",
};

export const DELIVERABLE_PROGRESS: LabelMap = {
  ohne_thema: { label: "Noch ohne Thema", tone: "neutral" },
  offen: { label: "Offen", tone: "neutral" },
  in_vorbereitung: { label: "In Vorbereitung", tone: "info" },
  wartet_auf_material: { label: "Wartet auf Material", tone: "waiting" },
  interne_pruefung: { label: "In interner Prüfung", tone: "info" },
  wartet_auf_freigabe: { label: "Wartet auf Freigabe", tone: "waiting" },
  aenderungen: { label: "Änderungen in Arbeit", tone: "warning" },
  freigegeben: { label: "Freigegeben", tone: "success" },
  geplant: { label: "Verbindlich geplant", tone: "brand" },
  veroeffentlicht: { label: "Veröffentlicht", tone: "success" },
  erbracht: { label: "Erbracht", tone: "success" },
  entfallen: { label: "Entfallen", tone: "neutral" },
  laufend: { label: "Laufend", tone: "info" },
};

export const CONTRACT_STATUS: LabelMap = {
  entwurf: { label: "Entwurf", tone: "neutral" },
  aktiv: { label: "Aktiv", tone: "success" },
  gekuendigt: { label: "Gekündigt", tone: "warning" },
  beendet: { label: "Beendet", tone: "neutral" },
};

export const CLIENT_STATUS: LabelMap = {
  interessent: { label: "Interessent", tone: "neutral" },
  aktiv: { label: "Aktiv", tone: "success" },
  pausiert: { label: "Pausiert", tone: "warning" },
  beendet: { label: "Beendet", tone: "neutral" },
};

export const DOSSIER_STATUS: LabelMap = {
  aktiv: { label: "Aktiv", tone: "info" },
  pausiert: { label: "Pausiert", tone: "warning" },
  abgeschlossen: { label: "Abgeschlossen", tone: "success" },
  abgebrochen: { label: "Abgebrochen", tone: "neutral" },
};

export const OWN_CATEGORY_LABELS: Record<string, string> = {
  summit: "SUMMIT",
  speaker: "Speaker",
  aussteller: "Aussteller",
  newsletter: "Newsletter",
  eventrueckblick: "Eventrückblick",
  netzwerk: "Netzwerk",
  sonstiges: "Sonstiges",
};

export const CAMPAIGN_STATUS: LabelMap = {
  planung: { label: "In Planung", tone: "neutral" },
  aktiv: { label: "Aktiv", tone: "info" },
  abgeschlossen: { label: "Abgeschlossen", tone: "success" },
  archiviert: { label: "Archiviert", tone: "neutral" },
};

export const IDEA_STATUS: LabelMap = {
  neu: { label: "Neu", tone: "neutral" },
  vorgemerkt: { label: "Vorgemerkt", tone: "info" },
  umgesetzt: { label: "Umgesetzt", tone: "success" },
  verworfen: { label: "Verworfen", tone: "neutral" },
};

export const MATERIAL_STATUS: LabelMap = {
  erstellt: { label: "Link erstellt", tone: "neutral" },
  versendet: { label: "Versendet", tone: "waiting" },
  geoeffnet: { label: "Vom Kunden geöffnet", tone: "waiting" },
  in_bearbeitung: { label: "Kunde füllt aus", tone: "waiting" },
  eingereicht: { label: "Eingereicht – prüfen", tone: "info" },
  geprueft: { label: "Geprüft", tone: "success" },
  rueckfrage: { label: "Rückfrage offen", tone: "warning" },
  widerrufen: { label: "Widerrufen", tone: "neutral" },
};

export const PREVIEW_STATUS: LabelMap = {
  erstellt: { label: "Erstellt (nicht versendet)", tone: "neutral" },
  versendet: { label: "Versendet – wartet auf Kunde", tone: "waiting" },
  geoeffnet: { label: "Geöffnet – wartet auf Antwort", tone: "waiting" },
  teilweise_beantwortet: { label: "Teilweise beantwortet", tone: "warning" },
  beantwortet: { label: "Beantwortet", tone: "success" },
  ersetzt: { label: "Durch neue Runde ersetzt", tone: "neutral" },
  widerrufen: { label: "Widerrufen", tone: "neutral" },
};

export const APPROVAL_DECISION: LabelMap = {
  freigegeben: { label: "Freigegeben", tone: "success" },
  aenderung_gewuenscht: { label: "Änderung gewünscht", tone: "warning" },
};

export const PUBLISH_JOB_STATUS: LabelMap = {
  geplant: { label: "Automatisch geplant", tone: "brand" },
  in_bearbeitung: { label: "Wird veröffentlicht …", tone: "info" },
  wartet_auf_plattform: { label: "Plattform verarbeitet", tone: "info" },
  veroeffentlicht: { label: "Veröffentlicht", tone: "success" },
  fehlgeschlagen: { label: "Fehlgeschlagen", tone: "danger" },
  unklar: { label: "Ergebnis unklar – prüfen", tone: "danger" },
  manuell_offen: { label: "Manuell zu veröffentlichen", tone: "waiting" },
  abgebrochen: { label: "Abgebrochen", tone: "neutral" },
};

export const EMAIL_STATUS: LabelMap = {
  ausstehend: { label: "Ausstehend", tone: "neutral" },
  versendet: { label: "Versendet", tone: "success" },
  fehlgeschlagen: { label: "Fehlgeschlagen", tone: "danger" },
  nicht_konfiguriert: { label: "Nicht versendet (E-Mail-Versand nicht eingerichtet)", tone: "warning" },
};

export const CONNECTION_STATUS: LabelMap = {
  nicht_verbunden: { label: "Einrichtung erforderlich", tone: "warning" },
  verbunden: { label: "Verbunden", tone: "success" },
  abgelaufen: { label: "Autorisierung abgelaufen", tone: "danger" },
  fehler: { label: "Fehler", tone: "danger" },
};

export const SERVICE_CATEGORY_LABELS: Record<string, string> = {
  redaktion: "Redaktion",
  social: "Social Media",
  profil: "Profil",
  community: "Community",
  event: "Events",
  reichweite: "Reichweite",
  vernetzung: "Vernetzung",
  vorteil: "Vorteile",
  circle: "Circle",
  sonstiges: "Sonstiges",
};

export const MEDIA_STATUS: LabelMap = {
  entwurf: { label: "Entwurf", tone: "neutral" },
  final: { label: "Final", tone: "success" },
  veraltet: { label: "Veraltet", tone: "warning" },
};

export function labelOf(map: LabelMap, key: string | null | undefined): LabelDef {
  if (!key) return { label: "–", tone: "neutral" };
  return map[key] ?? { label: key, tone: "neutral" };
}

export function textOf(map: Record<string, string>, key: string | null | undefined): string {
  if (!key) return "–";
  return map[key] ?? key;
}
