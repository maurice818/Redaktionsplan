import "server-only";
import { deliverableProgress, isDoneProgress, summarizeGroup, type ProgressKey } from "@/lib/domain/deliverable-progress";
import type { ServerSupabase } from "@/lib/supabase/server";

const MATERIAL_PENDING = new Set(["erstellt", "versendet", "geoeffnet", "in_bearbeitung", "rueckfrage"]);

export const DELIVERABLE_SELECT = `
  id, client_id, contract_id, contract_year_id, service_type_id, title, description, source, unit_no, unit_count,
  parent_deliverable_id, content_kind, status, owner_id, due_date, fulfilled_at, fulfillment_note, evidence_url,
  cancel_reason, created_at,
  service_types(key, name, category),
  contract_years(year_no, start_date, end_date),
  clients(name, is_demo),
  contracts(package_name, package_key, start_date, end_date, status),
  dossiers(id, title, status, material_requests(status, revoked_at)),
  content_items(id, title, status, schedule_status, scheduled_at, published_at, published_url, channel, dossier_id)
` as const;

export interface DeliverableUnit {
  id: string;
  clientId: string;
  clientName: string;
  isDemo: boolean;
  contractId: string | null;
  packageName: string | null;
  packageKey: string | null;
  yearId: string | null;
  yearNo: number | null;
  yearStart: string | null;
  yearEnd: string | null;
  serviceTypeId: string;
  serviceName: string;
  category: string | null;
  title: string;
  description: string | null;
  source: string;
  unitNo: number | null;
  unitCount: number | null;
  parentId: string | null;
  contentKind: string | null;
  status: string;
  ownerId: string | null;
  dueDate: string | null;
  fulfilledAt: string | null;
  fulfillmentNote: string | null;
  evidenceUrl: string | null;
  cancelReason: string | null;
  progress: ProgressKey;
  dossiers: { id: string; title: string; status: string }[];
  contents: { id: string; title: string; status: string; schedule_status: string; scheduled_at: string | null; published_at: string | null; published_url: string | null; channel: string; dossier_id: string }[];
}

export interface DeliverableGroup {
  key: string;
  contractId: string | null;
  yearId: string | null;
  serviceName: string;
  contentKind: string | null;
  units: DeliverableUnit[];
  summary: string;
  done: number;
  total: number;
}

export async function loadDeliverables(
  supabase: ServerSupabase,
  filter: { clientId?: string; contractIds?: string[]; ownerId?: string; status?: string[]; limit?: number } = {},
): Promise<DeliverableUnit[]> {
  let q = supabase.from("deliverables").select(DELIVERABLE_SELECT).order("created_at");
  if (filter.clientId) q = q.eq("client_id", filter.clientId);
  if (filter.contractIds?.length) q = q.in("contract_id", filter.contractIds);
  if (filter.ownerId) q = q.eq("owner_id", filter.ownerId);
  if (filter.status?.length) q = q.in("status", filter.status);
  if (filter.limit) q = q.limit(filter.limit);
  const { data, error } = await q;
  if (error) throw error;

  const rows = data ?? [];
  const byId = new Map(rows.map((r) => [r.id, r]));

  return rows.map((r) => {
    const parent = r.parent_deliverable_id ? byId.get(r.parent_deliverable_id) : undefined;
    const dossiers = [...(r.dossiers ?? []), ...(parent?.dossiers ?? [])];
    const materialPending = dossiers.some((d) =>
      (d.material_requests ?? []).some((m) => !m.revoked_at && MATERIAL_PENDING.has(m.status)),
    );
    const contents = r.content_items ?? [];
    const progress = deliverableProgress({
      status: r.status,
      content_kind: r.content_kind,
      hasDossier: dossiers.length > 0,
      materialPending,
      contents,
    });
    return {
      id: r.id,
      clientId: r.client_id,
      clientName: r.clients?.name ?? "",
      isDemo: r.clients?.is_demo ?? false,
      contractId: r.contract_id,
      packageName: r.contracts?.package_name ?? null,
      packageKey: r.contracts?.package_key ?? null,
      yearId: r.contract_year_id,
      yearNo: r.contract_years?.year_no ?? null,
      yearStart: r.contract_years?.start_date ?? null,
      yearEnd: r.contract_years?.end_date ?? null,
      serviceTypeId: r.service_type_id,
      serviceName: r.service_types?.name ?? r.title,
      category: r.service_types?.category ?? null,
      title: r.title,
      description: r.description,
      source: r.source,
      unitNo: r.unit_no,
      unitCount: r.unit_count,
      parentId: r.parent_deliverable_id,
      contentKind: r.content_kind,
      status: r.status,
      ownerId: r.owner_id,
      dueDate: r.due_date,
      fulfilledAt: r.fulfilled_at,
      fulfillmentNote: r.fulfillment_note,
      evidenceUrl: r.evidence_url,
      cancelReason: r.cancel_reason,
      progress,
      dossiers: dossiers.map((d) => ({ id: d.id, title: d.title, status: d.status })),
      contents,
    } satisfies DeliverableUnit;
  });
}

/** Gruppiert Einheiten je Vertrag, Vertragsjahr und Leistungstyp. */
export function groupDeliverables(units: DeliverableUnit[]): DeliverableGroup[] {
  const map = new Map<string, DeliverableUnit[]>();
  for (const u of units) {
    const key = `${u.contractId ?? "-"}|${u.yearId ?? "-"}|${u.serviceTypeId}|${u.source === "paket" ? "p" : u.title}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(u);
  }
  return [...map.entries()].map(([key, list]) => {
    const sorted = list.sort((a, b) => (a.unitNo ?? 0) - (b.unitNo ?? 0));
    const first = sorted[0];
    const name = first.source === "paket" ? first.serviceName : first.title;
    const active = sorted.filter((u) => u.progress !== "entfallen");
    return {
      key,
      contractId: first.contractId,
      yearId: first.yearId,
      serviceName: name,
      contentKind: first.contentKind,
      units: sorted,
      summary: summarizeGroup(sorted.map((u) => u.progress), first.contentKind, name),
      done: active.filter((u) => isDoneProgress(u.progress)).length,
      total: active.length,
    };
  });
}

/** Aktuelles Vertragsjahr (heute enthalten) oder das nächste/letzte. */
export function currentYearId(units: DeliverableUnit[], contractId: string, today: string): string | null {
  const years = [...new Map(units.filter((u) => u.contractId === contractId && u.yearId).map((u) => [u.yearId!, u])).values()];
  const current = years.find((u) => u.yearStart! <= today && u.yearEnd! >= today);
  if (current) return current.yearId;
  const upcoming = years.filter((u) => u.yearStart! > today).sort((a, b) => a.yearStart!.localeCompare(b.yearStart!))[0];
  if (upcoming) return upcoming.yearId;
  return years.sort((a, b) => b.yearEnd!.localeCompare(a.yearEnd!))[0]?.yearId ?? null;
}
