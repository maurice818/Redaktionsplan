import Link from "next/link";
import { FolderOpen, Plus } from "lucide-react";
import { EmptyState } from "@/components/common/empty-state";
import { FilterBar } from "@/components/common/filter-bar";
import { PageHeader } from "@/components/common/page-header";
import { Pill, StatusBadge } from "@/components/common/status-badge";
import { Button } from "@/components/ui/button";
import { requireProfile } from "@/lib/auth";
import { calendarStatus } from "@/lib/domain/calendar-status";
import { getCampaignsLite, getClientsLite, getPeople, personName } from "@/lib/data/lookups";
import { getSavedFilters, param } from "@/lib/data/saved-filters";
import { CALENDAR_STATUS, CHANNEL_LABELS, CONTENT_STATUS, DOSSIER_STATUS, OWN_CATEGORY_LABELS, labelOf } from "@/lib/labels";
import { canEdit } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatDateTime } from "@/lib/time";
import { safeSearch } from "@/lib/validation";

export const metadata = { title: "Beiträge & Magazin" };

export default async function PostsPage({ searchParams }: PageProps<"/beitraege">) {
  const sp = await searchParams;
  const profile = await requireProfile();
  const supabase = await createClient();
  const q = param(sp.q);
  const kind = param(sp.art);
  const clientId = param(sp.kunde);
  const campaignId = param(sp.kampagne);
  const status = param(sp.status) ?? "aktiv";
  const owner = param(sp.person) === "ich" ? profile.id : param(sp.person);
  const channel = param(sp.kanal);
  const contentStatus = param(sp.inhalt);

  let query = supabase
    .from("dossiers")
    .select("id, title, kind, own_category, status, topic, owner_id, period_start, period_end, is_demo, updated_at, clients(name), campaigns(name), content_items!inner(id, title, channel, kind, status, schedule_status, scheduled_at, approvals_complete, published_at, approval_invalidated_at)")
    .order("updated_at", { ascending: false })
    .limit(200);
  if (q) query = query.or(`title.ilike.%${safeSearch(q)}%,topic.ilike.%${safeSearch(q)}%`);
  if (kind) query = query.eq("kind", kind);
  if (clientId) query = query.eq("client_id", clientId);
  if (campaignId) query = query.eq("campaign_id", campaignId);
  if (status !== "alle") query = query.eq("status", status);
  if (owner) query = query.eq("owner_id", owner);
  if (channel) query = query.eq("content_items.channel", channel);
  if (contentStatus) query = query.eq("content_items.status", contentStatus);

  // Akten ohne Inhalte zusätzlich anzeigen (inner join schließt sie sonst aus)
  let emptyQuery = supabase
    .from("dossiers")
    .select("id, title, kind, own_category, status, topic, owner_id, period_start, period_end, is_demo, updated_at, clients(name), campaigns(name), content_items(id)")
    .order("updated_at", { ascending: false })
    .limit(100);
  if (kind) emptyQuery = emptyQuery.eq("kind", kind);
  if (clientId) emptyQuery = emptyQuery.eq("client_id", clientId);
  if (campaignId) emptyQuery = emptyQuery.eq("campaign_id", campaignId);
  if (status !== "alle") emptyQuery = emptyQuery.eq("status", status);
  if (owner) emptyQuery = emptyQuery.eq("owner_id", owner);

  const [{ data: dossiers }, { data: maybeEmpty }, people, clients, campaigns, saved] = await Promise.all([
    query, channel || contentStatus || q ? Promise.resolve({ data: [] as never[] }) : emptyQuery,
    getPeople(), getClientsLite(), getCampaignsLite(), getSavedFilters("beitraege"),
  ]);
  const withoutContent = (maybeEmpty ?? []).filter((d) => d.content_items.length === 0);
  const editor = canEdit(profile.role);

  return (
    <div>
      <PageHeader
        title="Beiträge & Magazin"
        description="Beitragsakten verbinden Kunde, Leistung, Magazinartikel, Social-Fassungen, Material, Freigaben und Nachweise."
        actions={editor && <Button asChild><Link href="/beitraege/neu"><Plus /> Eigener Beitrag</Link></Button>}
      />
      <FilterBar
        view="beitraege"
        userId={profile.id}
        saved={saved}
        search={{ name: "q", placeholder: "Titel oder Thema …" }}
        filters={[
          { name: "art", label: "Art", options: [{ value: "kunde", label: "Kundenbeiträge" }, { value: "eigen", label: "Eigene Redaktion" }] },
          { name: "kunde", label: "Kunde", options: clients.map((c) => ({ value: c.id, label: c.name })) },
          { name: "kampagne", label: "Kampagne", options: campaigns.map((c) => ({ value: c.id, label: c.name })) },
          { name: "kanal", label: "Kanal", options: Object.entries(CHANNEL_LABELS).map(([value, label]) => ({ value, label })) },
          { name: "inhalt", label: "Inhaltsstatus", options: Object.entries(CONTENT_STATUS).map(([value, d]) => ({ value, label: d.label })) },
          { name: "status", label: "Aktenstatus", allLabel: "Aktiv", options: [{ value: "alle", label: "Alle" }, ...Object.entries(DOSSIER_STATUS).filter(([k]) => k !== "aktiv").map(([value, d]) => ({ value, label: d.label }))] },
          { name: "person", label: "Verantwortlich", options: [{ value: "ich", label: "Nur meine" }, ...people.filter((p) => p.is_active).map((p) => ({ value: p.id, label: p.full_name || p.email }))] },
        ]}
      />

      {(dossiers ?? []).length === 0 && withoutContent.length === 0 ? (
        <EmptyState
          icon={FolderOpen}
          title="Keine Beitragsakten gefunden"
          action={editor && <Button asChild><Link href="/beitraege/neu"><Plus /> Eigenen Beitrag anlegen</Link></Button>}
        >
          Kundenakten legen Sie in der Kundenakte direkt an einer gebuchten Leistung an. Eigene Beiträge (z. B. SUMMIT, Speaker, Newsletter) hier.
        </EmptyState>
      ) : (
        <div className="grid gap-3">
          {[...(dossiers ?? []), ...withoutContent.map((d) => ({ ...d, content_items: [] as NonNullable<typeof dossiers>[number]["content_items"] }))].map((d) => (
            <Link key={d.id} href={`/beitraege/${d.id}`} className="block rounded-xl border border-border bg-card p-4 transition hover:border-stone-400">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-medium">{d.title}</p>
                <Pill tone={d.kind === "kunde" ? "info" : "brand"}>{d.kind === "kunde" ? d.clients?.name ?? "Kunde" : `Eigen · ${OWN_CATEGORY_LABELS[d.own_category ?? "sonstiges"]}`}</Pill>
                {d.campaigns?.name && <Pill>{d.campaigns.name}</Pill>}
                {d.status !== "aktiv" && <StatusBadge def={labelOf(DOSSIER_STATUS, d.status)} />}
                {d.is_demo && <Pill tone="warning">DEMO</Pill>}
                <span className="ml-auto text-xs text-muted-foreground">{personName(people, d.owner_id)}</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {d.topic ?? "Ohne Thema"}
                {(d.period_start || d.period_end) && ` · Zeitraum ${formatDate(d.period_start)} – ${formatDate(d.period_end)}`}
              </p>
              {d.content_items.length > 0 ? (
                <ul className="mt-3 grid gap-1.5 sm:grid-cols-2 xl:grid-cols-3">
                  {d.content_items.map((c) => {
                    const cs = calendarStatus(c, null);
                    return (
                      <li key={c.id} className="flex items-center gap-2 rounded-lg border border-border/70 px-2.5 py-1.5 text-xs">
                        <span className="w-20 shrink-0 font-medium">{CHANNEL_LABELS[c.channel]}</span>
                        <StatusBadge def={labelOf(CONTENT_STATUS, c.status)} />
                        {c.scheduled_at && c.status !== "veroeffentlicht" && (
                          <span className="ml-auto flex items-center gap-1 text-muted-foreground" title={labelOf(CALENDAR_STATUS, cs.key).label}>
                            {formatDateTime(c.scheduled_at).replace(" Uhr", "")}
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="mt-3 text-xs text-muted-foreground">Noch keine Inhalte – Artikel oder Social-Beitrag in der Akte anlegen.</p>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
