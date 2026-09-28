import Link from "next/link";
import { Lightbulb, Megaphone, Plus, Repeat } from "lucide-react";
import { CampaignDialog, DeleteIdeaButton, IdeaDialog } from "@/components/campaigns/campaign-dialogs";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { Pill, StatusBadge } from "@/components/common/status-badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { requireProfile } from "@/lib/auth";
import { getClientsLite, getPeople, peopleOptions, personName } from "@/lib/data/lookups";
import { CAMPAIGN_STATUS, IDEA_STATUS, labelOf } from "@/lib/labels";
import { canEdit } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/time";

export const metadata = { title: "Kampagnen" };

export default async function CampaignsPage({ searchParams }: PageProps<"/kampagnen">) {
  const sp = await searchParams;
  const profile = await requireProfile();
  const editor = canEdit(profile.role);
  const supabase = await createClient();
  const [campaignsRes, ideasRes, people, clients] = await Promise.all([
    supabase.from("campaigns").select("*, dossiers(id, content_items(id, status))").order("start_date", { ascending: false, nullsFirst: false }),
    supabase.from("ideas").select("*, campaigns(name), clients(name)").order("created_at", { ascending: false }),
    getPeople(),
    getClientsLite(),
  ]);
  const campaigns = campaignsRes.data ?? [];
  const ideas = ideasRes.data ?? [];
  const campaignOpts = campaigns.map((c) => ({ value: c.id, label: c.name }));
  const clientOpts = clients.map((c) => ({ value: c.id, label: c.name }));
  const tab = typeof sp.tab === "string" ? sp.tab : "kampagnen";
  const highlightIdea = typeof sp.idee === "string" ? sp.idee : null;

  return (
    <div>
      <PageHeader
        title="Kampagnen"
        description="Eigene MEET-GERMANY-Kampagnen (SUMMIT, Speaker, Aussteller, Newsletter, Eventrückblicke …) mit Ziel, Zeitraum, Themen und allen zugehörigen Veröffentlichungen."
        actions={editor && <CampaignDialog people={peopleOptions(people)} />}
      />
      <Tabs defaultValue={tab} className="gap-4">
        <TabsList>
          <TabsTrigger value="kampagnen">Kampagnen ({campaigns.length})</TabsTrigger>
          <TabsTrigger value="ideen">Ideenspeicher ({ideas.filter((i) => i.status !== "verworfen").length})</TabsTrigger>
        </TabsList>

        <TabsContent value="kampagnen">
          {campaigns.length === 0 ? (
            <EmptyState icon={Megaphone} title="Noch keine Kampagnen" action={editor && <CampaignDialog people={peopleOptions(people)} />}>
              Bündeln Sie eigene Beiträge zu Kampagnen, z. B. für den nächsten SUMMIT.
            </EmptyState>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {campaigns.map((c) => {
                const contents = c.dossiers.flatMap((d) => d.content_items);
                const published = contents.filter((x) => x.status === "veroeffentlicht").length;
                return (
                  <Link key={c.id} href={`/kampagnen/${c.id}`} className="rounded-xl border border-border bg-card p-4 transition hover:border-stone-400">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-semibold">{c.name}</p>
                      <StatusBadge def={labelOf(CAMPAIGN_STATUS, c.status)} />
                    </div>
                    {c.goal && <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{c.goal}</p>}
                    <p className="mt-2 text-xs text-muted-foreground">
                      {c.start_date || c.end_date ? `${formatDate(c.start_date)} – ${formatDate(c.end_date)}` : "Ohne Zeitraum"} · {personName(people, c.owner_id)}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {c.topics.map((t) => <Pill key={t}>{t}</Pill>)}
                      {c.is_demo && <Pill tone="warning">DEMO</Pill>}
                    </div>
                    <p className="mt-3 text-xs">{c.dossiers.length} Akten · {contents.length} Inhalte · {published} veröffentlicht</p>
                  </Link>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="ideen">
          <div className="mb-3 flex justify-end">
            <IdeaDialog campaigns={campaignOpts} clients={clientOpts} />
          </div>
          {ideas.length === 0 ? (
            <EmptyState icon={Lightbulb} title="Der Ideenspeicher ist leer">Sammeln Sie Themenideen – wiederverwendbare Formate bleiben nach der Umsetzung verfügbar.</EmptyState>
          ) : (
            <ul className="grid gap-2">
              {ideas.map((i) => (
                <li key={i.id} className={`flex flex-wrap items-start gap-3 rounded-xl border bg-card px-4 py-3 ${highlightIdea === i.id ? "border-[#b90845]" : "border-border"}`}>
                  <Lightbulb className="mt-0.5 size-4 text-amber-500" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">
                      {i.title}
                      {i.is_reusable && <span className="ml-2 inline-flex items-center gap-1 text-xs text-[#6f2659]"><Repeat className="size-3" /> wiederverwendbar ({i.use_count}× genutzt)</span>}
                    </p>
                    {i.description && <p className="mt-0.5 text-xs text-muted-foreground">{i.description}</p>}
                    <div className="mt-1.5 flex flex-wrap items-center gap-1">
                      <StatusBadge def={labelOf(IDEA_STATUS, i.status)} />
                      {i.campaigns?.name && <Pill tone="brand">{i.campaigns.name}</Pill>}
                      {i.clients?.name && <Pill tone="info">{i.clients.name}</Pill>}
                      {i.tags.map((t) => <Pill key={t}>{t}</Pill>)}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {editor && (i.status !== "umgesetzt" || i.is_reusable) && i.status !== "verworfen" && (
                      <Button asChild size="sm" variant="outline"><Link href={`/beitraege/neu?idee=${i.id}`}><Plus /> Beitrag daraus</Link></Button>
                    )}
                    <IdeaDialog idea={i} campaigns={campaignOpts} clients={clientOpts} />
                    <DeleteIdeaButton id={i.id} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
