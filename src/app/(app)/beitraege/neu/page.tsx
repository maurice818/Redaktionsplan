import { PageHeader } from "@/components/common/page-header";
import { requireEditor } from "@/lib/auth";
import { getCampaignsLite, getPeople, peopleOptions } from "@/lib/data/lookups";
import { param } from "@/lib/data/saved-filters";
import { createClient } from "@/lib/supabase/server";
import { OwnPostForm } from "./own-post-form";

export const metadata = { title: "Eigener Beitrag" };

export default async function NewOwnPostPage({ searchParams }: PageProps<"/beitraege/neu">) {
  const sp = await searchParams;
  const profile = await requireEditor();
  const supabase = await createClient();
  const [people, campaigns, { data: ideas }] = await Promise.all([
    getPeople(),
    getCampaignsLite(),
    supabase.from("ideas").select("id, title, description, campaign_id, is_reusable").in("status", ["neu", "vorgemerkt"]).order("created_at", { ascending: false }).limit(100),
  ]);
  const ideaId = param(sp.idee);
  const idea = (ideas ?? []).find((i) => i.id === ideaId);
  return (
    <div>
      <PageHeader
        title="Eigenen Beitrag anlegen"
        description="Eigene MEET-GERMANY-Inhalte (SUMMIT, Speaker, Aussteller, Newsletter, Eventrückblicke …): Beitrag anlegen, Aufgabe zuweisen und vorläufig terminieren."
        back={{ href: "/beitraege", label: "Beiträge & Magazin" }}
      />
      <OwnPostForm
        people={peopleOptions(people)}
        campaigns={campaigns.filter((c) => c.status !== "archiviert").map((c) => ({ value: c.id, label: c.name }))}
        ideas={(ideas ?? []).map((i) => ({ value: i.id, label: `${i.title}${i.is_reusable ? " (wiederverwendbar)" : ""}` }))}
        currentUserId={profile.id}
        defaults={{
          title: idea?.title ?? "",
          topic: idea?.description ?? "",
          idea_id: idea?.id ?? "",
          campaign_id: idea?.campaign_id ?? param(sp.kampagne) ?? "",
        }}
      />
    </div>
  );
}
