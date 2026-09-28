import {
  CONTENT_STATUS, DELIVERABLE_STATUS, MATERIAL_STATUS, PREVIEW_STATUS, PUBLISH_JOB_STATUS, SCHEDULE_STATUS, TASK_STATUS,
  labelOf,
} from "@/lib/labels";
import { formatDateTime } from "@/lib/time";

export interface AuditEntry {
  id: number;
  occurred_at: string;
  actor_label: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  summary: string | null;
  changes: unknown;
  reason: string | null;
}

const ENTITY: Record<string, string> = {
  clients: "Kunde",
  contacts: "Ansprechpartner",
  contracts: "Vertrag",
  deliverables: "Leistung",
  dossiers: "Beitragsakte",
  content_items: "Inhalt",
  tasks: "Aufgabe",
  media_assets: "Medium",
  material_requests: "Materialanfrage",
  previews: "Kundenvorschau",
  publish_jobs: "Veröffentlichungsauftrag",
  campaigns: "Kampagne",
  platform_accounts: "Plattformkonto",
  format_rules: "Formatregel",
  email_templates: "E-Mail-Vorlage",
  reminder_rules: "Erinnerungsregel",
};

const FIELD: Record<string, string> = {
  status: "Status",
  title: "Titel",
  assignee_id: "Zuständigkeit",
  owner_id: "Verantwortlich",
  due_date: "Fälligkeit",
  scheduled_at: "Termin",
  schedule_status: "Planung",
  body_html: "Artikeltext",
  caption: "Text",
  teaser: "Teaser",
  hashtags: "Hashtags",
  cta: "Call-to-Action",
  post_format: "Format",
  published_url: "Veröffentlichungslink",
  published_at: "Veröffentlicht am",
  priority: "Priorität",
  internal_approval_id: "Interne Freigabe",
  client_approval_id: "Kundenfreigabe",
  approval_invalidated_at: "Freigabe ungültig",
  current_version_no: "Version",
  auto_publish: "Automatische Veröffentlichung",
  platform_account_id: "Zielkonto",
  evidence_url: "Nachweis",
  alt_text: "Alt-Text",
  credit: "Bildnachweis",
  window_start: "Zeitraum ab",
  window_end: "Zeitraum bis",
};

const STATUS_MAPS: Record<string, Parameters<typeof labelOf>[0]> = {
  content_items: CONTENT_STATUS,
  tasks: TASK_STATUS,
  deliverables: DELIVERABLE_STATUS,
  material_requests: MATERIAL_STATUS,
  previews: PREVIEW_STATUS,
  publish_jobs: PUBLISH_JOB_STATUS,
};

function formatValue(entity: string, field: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return "–";
  if (field === "status" && STATUS_MAPS[entity]) return labelOf(STATUS_MAPS[entity], String(value)).label;
  if (field === "schedule_status") return labelOf(SCHEDULE_STATUS, String(value)).label;
  if (typeof value === "boolean") return value ? "ja" : "nein";
  if (Array.isArray(value)) return value.join(" ");
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value)) return formatDateTime(value);
  if (typeof value === "string" && /^[0-9a-f-]{36}$/.test(value)) return "geändert";
  return String(value).slice(0, 120);
}

export function describeEntry(e: AuditEntry): { title: string; details: string[] } {
  const entity = ENTITY[e.entity_type] ?? e.entity_type;
  if (e.action === "insert") return { title: `${entity} angelegt${e.summary ? `: ${e.summary}` : ""}`, details: [] };
  if (e.action === "delete") return { title: `${entity} gelöscht${e.summary ? `: ${e.summary}` : ""}`, details: [] };
  if (e.action === "update") {
    const changes = (e.changes ?? {}) as Record<string, unknown>;
    const details = Object.entries(changes)
      .filter(([k]) => FIELD[k])
      .map(([k, v]) => {
        if (v && typeof v === "object" && !Array.isArray(v) && (v as { geaendert?: boolean }).geaendert) return `${FIELD[k]} geändert`;
        const [from, to] = Array.isArray(v) ? v : [null, v];
        return `${FIELD[k]}: ${formatValue(e.entity_type, k, from)} → ${formatValue(e.entity_type, k, to)}`;
      });
    return { title: `${entity} geändert${e.summary ? `: ${e.summary}` : ""}`, details };
  }
  return { title: e.summary ?? e.action, details: [] };
}

export function Timeline({ entries, emptyText = "Noch keine Einträge." }: { entries: AuditEntry[]; emptyText?: string }) {
  const visible = entries
    .map((e) => ({ e, d: describeEntry(e) }))
    .filter(({ e, d }) => e.action !== "update" || d.details.length > 0);
  if (visible.length === 0) return <p className="text-sm text-muted-foreground">{emptyText}</p>;
  return (
    <ol className="relative space-y-4 border-l border-border pl-5">
      {visible.map(({ e, d }) => (
        <li key={e.id} className="relative">
          <span aria-hidden className="absolute top-1.5 -left-[25px] size-2.5 rounded-full border-2 border-white bg-[#6f2659] ring-1 ring-border" />
          <p className="text-sm font-medium">{d.title}</p>
          {d.details.length > 0 && (
            <ul className="mt-0.5 space-y-0.5 text-xs text-muted-foreground">
              {d.details.map((x) => <li key={x}>{x}</li>)}
            </ul>
          )}
          {e.reason && <p className="mt-0.5 text-xs text-muted-foreground">Begründung/Kommentar: {e.reason}</p>}
          <p className="mt-0.5 text-[11px] text-muted-foreground">{formatDateTime(e.occurred_at)} · {e.actor_label ?? "System"}</p>
        </li>
      ))}
    </ol>
  );
}
