/**
 * Die 15 Schritte einer Beitragsakte – aus den tatsächlichen Daten abgeleitet
 * (kein manuell gepflegter Status, der veralten könnte).
 */
export type StepState = "done" | "open" | "na";

export interface WorkflowStep {
  no: number;
  key: string;
  label: string;
  state: StepState;
  hint?: string;
}

export interface WorkflowInput {
  kind: "kunde" | "eigen";
  ownerId: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  materialRequests: { status: string; revoked_at: string | null }[];
  contents: {
    kind: string;
    status: string;
    body_html: string | null;
    caption: string | null;
    requires_internal_approval: boolean;
    requires_client_approval: boolean;
    internal_ok: boolean;
    client_ok: boolean;
    schedule_status: string;
    published_at: string | null;
    published_url: string | null;
    mediaCount: number;
    finalMediaCount: number;
    needsMedia: boolean;
  }[];
  graphicTasksOpen: number;
  previews: { status: string; sent_at: string | null }[];
  deliverables: { status: string }[];
}

const hasText = (html: string | null) => Boolean(html?.replace(/<[^>]*>/g, "").trim());

export function dossierWorkflow(input: WorkflowInput): WorkflowStep[] {
  const c = input.contents;
  const articles = c.filter((x) => x.kind === "magazinartikel");
  const socials = c.filter((x) => x.kind === "social");
  const needClient = c.filter((x) => x.requires_client_approval);
  const activeRequests = input.materialRequests.filter((r) => !r.revoked_at);
  const isClient = input.kind === "kunde";

  const all = (list: typeof c, pred: (x: (typeof c)[number]) => boolean) => list.length > 0 && list.every(pred);
  const published = (x: (typeof c)[number]) => x.status === "veroeffentlicht";

  const steps: Omit<WorkflowStep, "no">[] = [
    { key: "angelegt", label: "Leistung oder Thema angelegt", state: "done" },
    {
      key: "verantwortung",
      label: "Verantwortliche und groben Zeitraum festgelegt",
      state: input.ownerId && (input.periodStart || input.periodEnd) ? "done" : "open",
      hint: !input.ownerId ? "Verantwortliche Person fehlt" : !(input.periodStart || input.periodEnd) ? "Zeitraum fehlt" : undefined,
    },
    {
      key: "material_angefordert",
      label: "Kundenmaterial angefordert",
      state: !isClient ? "na" : activeRequests.length > 0 ? "done" : "open",
    },
    {
      key: "material_geprueft",
      label: "Material geprüft (ggf. Rückfragen geklärt)",
      state: !isClient ? "na" : activeRequests.some((r) => r.status === "geprueft") ? "done" : "open",
      hint: activeRequests.some((r) => r.status === "eingereicht") ? "Material eingegangen – bitte prüfen" : undefined,
    },
    {
      key: "artikel",
      label: "Magazinartikel entworfen",
      state: articles.length === 0 ? (isClient ? "open" : "na") : articles.every((a) => hasText(a.body_html)) ? "done" : "open",
    },
    {
      key: "social",
      label: "Social-Beiträge je Kanal vorbereitet",
      state: socials.length === 0 ? (isClient ? "open" : "na") : socials.every((s) => Boolean(s.caption?.trim())) ? "done" : "open",
    },
    {
      key: "grafik",
      label: "Grafiken erstellt und verlinkt",
      state: c.filter((x) => x.needsMedia).length === 0
        ? "na"
        : c.filter((x) => x.needsMedia).every((x) => x.finalMediaCount > 0) && input.graphicTasksOpen === 0 ? "done" : "open",
    },
    {
      key: "intern",
      label: "Interne Prüfung",
      state: all(c, (x) => !x.requires_internal_approval || x.internal_ok || published(x)) ? "done" : "open",
    },
    {
      key: "vorschau",
      label: "Kundenvorschau versendet",
      state: needClient.length === 0 ? "na" : input.previews.some((p) => p.sent_at) ? "done" : "open",
    },
    {
      key: "aenderungen",
      label: "Änderungswünsche bearbeitet",
      state: needClient.length === 0 ? "na" : c.some((x) => x.status === "aenderung_gewuenscht") ? "open" : input.previews.some((p) => p.sent_at) ? "done" : "open",
    },
    {
      key: "kundenfreigabe",
      label: "Ausdrückliche Kundenfreigabe dokumentiert",
      state: needClient.length === 0 ? "na" : needClient.every((x) => x.client_ok || published(x)) ? "done" : "open",
    },
    {
      key: "termine",
      label: "Veröffentlichungstermine verbindlich festgelegt",
      state: all(c, (x) => x.schedule_status === "verbindlich" || published(x)) ? "done" : "open",
    },
    { key: "veroeffentlicht", label: "Veröffentlicht", state: all(c, published) ? "done" : "open" },
    {
      key: "nachweis",
      label: "Links und Veröffentlichungsdaten gespeichert",
      state: all(c, (x) => published(x) && Boolean(x.published_url) && Boolean(x.published_at)) ? "done" : "open",
    },
    {
      key: "leistungen",
      label: "Zugehörige Leistungen als erbracht markiert",
      state: input.deliverables.length === 0
        ? "na"
        : input.deliverables.every((d) => d.status === "erbracht" || d.status === "entfallen") ? "done" : "open",
    },
  ];

  return steps.map((s, i) => ({ ...s, no: i + 1 }));
}

export function currentStep(steps: WorkflowStep[]): WorkflowStep | null {
  return steps.find((s) => s.state === "open") ?? null;
}
