import "server-only";
import type { ServerSupabase } from "@/lib/supabase/server";
import { groupDeliverables, loadDeliverables, type DeliverableGroup } from "./deliverables";

export interface ReportPublication {
  id: string;
  title: string;
  channel: string;
  kind: string;
  published_at: string | null;
  published_url: string | null;
  publish_method: string | null;
  metrics: { reach?: number; impressions?: number; clicks?: number; source?: string; recorded_at?: string } | null;
  dossierTitle: string;
  deliverableId: string | null;
}

export interface ClientReport {
  client: { id: string; name: string; legal_name: string | null; city: string | null; is_demo: boolean };
  contracts: {
    id: string;
    package_name: string;
    start_date: string;
    end_date: string;
    status: string;
    years: { id: string; year_no: number; start_date: string; end_date: string; groups: DeliverableGroup[] }[];
  }[];
  publications: ReportPublication[];
}

export async function loadClientReport(supabase: ServerSupabase, clientId: string): Promise<ClientReport | null> {
  const { data: client } = await supabase.from("clients").select("id, name, legal_name, city, is_demo").eq("id", clientId).maybeSingle();
  if (!client) return null;
  const [{ data: contracts }, units, { data: dossiers }] = await Promise.all([
    supabase.from("contracts").select("id, package_name, start_date, end_date, status, contract_years(id, year_no, start_date, end_date)").eq("client_id", clientId).order("start_date"),
    loadDeliverables(supabase, { clientId }),
    supabase
      .from("dossiers")
      .select("title, content_items(id, title, channel, kind, published_at, published_url, publish_method, metrics, deliverable_id, status)")
      .eq("client_id", clientId),
  ]);

  const publications: ReportPublication[] = (dossiers ?? [])
    .flatMap((d) =>
      d.content_items
        .filter((c) => c.status === "veroeffentlicht")
        .map((c) => ({
          id: c.id, title: c.title, channel: c.channel, kind: c.kind, published_at: c.published_at, published_url: c.published_url,
          publish_method: c.publish_method, metrics: (c.metrics ?? null) as ReportPublication["metrics"], dossierTitle: d.title,
          deliverableId: c.deliverable_id,
        })),
    )
    .sort((a, b) => (a.published_at ?? "").localeCompare(b.published_at ?? ""));

  return {
    client,
    contracts: (contracts ?? []).map((c) => ({
      id: c.id,
      package_name: c.package_name,
      start_date: c.start_date,
      end_date: c.end_date,
      status: c.status,
      years: c.contract_years
        .sort((a, b) => a.year_no - b.year_no)
        .map((y) => ({ ...y, groups: groupDeliverables(units.filter((u) => u.contractId === c.id && u.yearId === y.id)) })),
    })),
    publications,
  };
}
