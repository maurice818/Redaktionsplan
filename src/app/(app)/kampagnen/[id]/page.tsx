import Link from "next/link";
import { notFound } from "next/navigation";
import { FolderOpen, Plus } from "lucide-react";
import { CampaignDialog, DeleteCampaignButton, IdeaDialog } from "@/components/campaigns/campaign-dialogs";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { Section } from "@/components/common/section";
import { Pill, StatusBadge } from "@/components/common/status-badge";
import { Timeline, type AuditEntry } from "@/components/common/timeline";
import { TaskDialog } from "@/components/tasks/task-dialog";
import { TaskRow } from "@/components/tasks/task-row";
import { Button } from "@/components/ui/button";
import { requireProfile } from "@/lib/auth";
import { calendarStatus } from "@/lib/domain/calendar-status";
import { getCampaignsLite, getClientsLite, getPeople, peopleOptions, personName } from "@/lib/data/lookups";
import { CALENDAR_STATUS, CAMPAIGN_STATUS, CHANNEL_LABELS, CONTENT_STATUS, IDEA_STATUS, labelOf } from "@/lib/labels";
import { canEdit } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { berlinToday, formatDate, formatDateTime } from "@/lib/time";

export default async function CampaignPage({ params }: PageProps<"/kampagnen/[id]">) {
  const { id } = await params;
  const profile = await requireProfile();
  const editor = canEdit(profile.role);
  const supabase = await createClient();
  const { data: campaign } = await supabase.from("campaigns").select("*").eq("id", id).maybeSingle();
  if (!campaign) notFound();

  const [dossiersRes, ideasRes, tasksRes, auditRes, people, campaigns, clients] = await Promise.all([
    supabase
      .from("dossiers")
      .select("id, title, kind, status, owner_id, clients(name), content_items(id, title, channel, status, schedule_status, scheduled_at, approvals_complete, published_at, published_url, approval_invalidated_at)")
      .eq("campaign_id", id)
      .order("period_start", { nullsFirst: false }),
    supabase.from("ideas").select("*").eq("campaign_id", id).order("created_at", { ascending: false }),
    supabase.from("tasks").select("*").eq("campaign_id", id).in("status", ["offen", "in_arbeit", "wartet_auf_kunde"]).order("due_date"),
    supabase.from("audit_log").select("id, occurred_at, actor_label, action, entity_type, entity_id, summary, changes, reason").eq("entity_type", "campaigns").eq("entity_id", id).order("occurred_at", { ascending: false }).limit(30),
    getPeople(),
    getCampaignsLite(),
    getClientsLite(),
  ]);
  const dossiers = dossiersRes.data ?? [];
  const contents = dossiers.flatMap((d) => d.content_items.map((c) => ({ ...c, dossierId: d.id, dossierTitle: d.title })))
    .sort((a, b) => (a.scheduled_at ?? "9999").localeCompare(b.scheduled_at ?? "9999"));
  const personOpts = peopleOptions(people);

  return (
    <div>
      <PageHeader
        back={{ href: "/kampagnen", label: "Kampagnen" }}
        title={campaign.name}
        description={campaign.goal ?? undefined}
        meta={
          <>
            <StatusBadge def={labelOf(CAMPAIGN_STATUS, campaign.status)} />
            <span className="text-xs text-muted-foreground">
              {campaign.start_date || campaign.end_date ? `${formatDate(campaign.start_date)} – ${formatDate(campaign.end_date)}` : "Ohne Zeitraum"} · Verantwortlich: {personName(people, campaign.owner_id)}
            </span>
            {campaign.topics.map((t) => <Pill key={t}>{t}</Pill>)}
          </>
        }
        actions={
          editor && (
            <>
              <Button asChild><Link href={`/beitraege/neu?kampagne=${id}`}><Plus /> Beitrag zur Kampagne</Link></Button>
              <CampaignDialog campaign={campaign} people={personOpts} />
              <DeleteCampaignButton id={id} />
            </>
          )
        }
      />
      <div className="grid gap-4 xl:grid-cols-[1fr_22rem]">
        <div className="grid content-start gap-4">
          <Section title={`Veröffentlichungen (${contents.length})`} description="Alle Inhalte der Kampagne in zeitlicher Reihenfolge.">
            {contents.length === 0 ? (
              <EmptyState compact icon={FolderOpen} title="Noch keine Inhalte in dieser Kampagne" />
            ) : (
              <ul className="divide-y">
                {contents.map((c) => {
                  const cs = calendarStatus(c, null);
                  return (
                    <li key={c.id} className="flex flex-wrap items-center gap-3 py-2.5 text-sm">
                      <span className="w-40 shrink-0 text-xs text-muted-foreground">{c.published_at ? formatDateTime(c.published_at) : c.scheduled_at ? formatDateTime(c.scheduled_at) : "ohne Termin"}</span>
                      <span className="w-24 shrink-0 font-medium">{CHANNEL_LABELS[c.channel]}</span>
                      <Link href={`/beitraege/${c.dossierId}/inhalte/${c.id}`} className="min-w-40 flex-1 hover:text-[#b90845]">{c.title}</Link>
                      <StatusBadge def={labelOf(CONTENT_STATUS, c.status)} />
                      {c.scheduled_at && c.status !== "veroeffentlicht" && <StatusBadge def={labelOf(CALENDAR_STATUS, cs.key)} />}
                    </li>
                  );
                })}
              </ul>
            )}
          </Section>
          <Section title={`Beitragsakten (${dossiers.length})`}>
            <ul className="divide-y">
              {dossiers.map((d) => (
                <li key={d.id} className="flex items-center gap-3 py-2 text-sm">
                  <Link href={`/beitraege/${d.id}`} className="flex-1 hover:text-[#b90845]">{d.title}</Link>
                  {d.kind === "kunde" && <Pill tone="info">{d.clients?.name}</Pill>}
                  <span className="text-xs text-muted-foreground">{personName(people, d.owner_id)}</span>
                </li>
              ))}
            </ul>
          </Section>
          <Section title="Historie"><Timeline entries={(auditRes.data ?? []) as AuditEntry[]} /></Section>
        </div>
        <aside className="grid content-start gap-4">
          <Section title="Aufgaben" action={<TaskDialog people={personOpts} context={{ campaignId: id }} />} bodyClassName="p-0">
            {(tasksRes.data ?? []).length === 0 ? <p className="px-4 py-3 text-sm text-muted-foreground">Keine offenen Aufgaben.</p> : (
              <ul className="divide-y">{(tasksRes.data ?? []).map((t) => <TaskRow key={t.id} task={{ ...t, assigneeName: personName(people, t.assignee_id) }} today={berlinToday()} people={personOpts} />)}</ul>
            )}
          </Section>
          <Section title="Themenideen" action={<IdeaDialog campaigns={campaigns.map((c) => ({ value: c.id, label: c.name }))} clients={clients.map((c) => ({ value: c.id, label: c.name }))} defaultCampaign={id} />}>
            {(ideasRes.data ?? []).length === 0 ? <p className="text-sm text-muted-foreground">Keine Ideen.</p> : (
              <ul className="grid gap-2 text-sm">
                {(ideasRes.data ?? []).map((i) => (
                  <li key={i.id} className="flex items-start justify-between gap-2">
                    <span>{i.title}<span className="block"><StatusBadge def={labelOf(IDEA_STATUS, i.status)} /></span></span>
                    {editor && i.status !== "verworfen" && <Button asChild size="sm" variant="ghost"><Link href={`/beitraege/neu?idee=${i.id}`}>Umsetzen</Link></Button>}
                  </li>
                ))}
              </ul>
            )}
          </Section>
          {campaign.description && <Section title="Beschreibung"><p className="text-sm whitespace-pre-line">{campaign.description}</p></Section>}
        </aside>
      </div>
    </div>
  );
}
