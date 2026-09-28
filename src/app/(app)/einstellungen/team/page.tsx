import { PageHeader } from "@/components/common/page-header";
import { Section } from "@/components/common/section";
import { StatusBadge } from "@/components/common/status-badge";
import { requireAdmin } from "@/lib/auth";
import { features } from "@/lib/env.server";
import { getPeople } from "@/lib/data/lookups";
import { ROLE_DESCRIPTIONS, ROLE_LABELS } from "@/lib/labels";
import { EditMemberDialog, InviteDialog } from "./team-dialogs";

export const metadata = { title: "Team & Rollen" };

export default async function TeamPage() {
  const me = await requireAdmin();
  const people = await getPeople();
  return (
    <div>
      <PageHeader
        title="Team & Rollen"
        description="Zugang nur auf Einladung. Rollen steuern die Berechtigungen – serverseitig durch Row Level Security abgesichert."
        actions={<InviteDialog disabled={!features.admin()} />}
      />
      {!features.admin() && <p className="mb-4 rounded-md bg-amber-50 p-3 text-sm text-amber-900">Einladungen benötigen den SUPABASE_SECRET_KEY (nur serverseitig). Alternativ Nutzer im Supabase-Dashboard einladen und hier die Rolle vergeben.</p>}
      <Section title="Rollen">
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          {Object.entries(ROLE_LABELS).map(([k, label]) => (
            <div key={k}><dt className="font-medium">{label}</dt><dd className="text-muted-foreground">{ROLE_DESCRIPTIONS[k]}</dd></div>
          ))}
        </dl>
      </Section>
      <Section title={`Teammitglieder (${people.length})`} className="mt-4" bodyClassName="p-0">
        <ul className="divide-y">
          {people.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
              <div className="min-w-48 flex-1">
                <p className="font-medium">{p.full_name || "Ohne Namen"}{p.id === me.id && <span className="ml-2 text-xs text-muted-foreground">(Sie)</span>}</p>
                <p className="text-xs text-muted-foreground">{p.email}</p>
              </div>
              <span className="w-32 text-sm">{ROLE_LABELS[p.role]}</span>
              <StatusBadge def={p.is_active ? { label: "Aktiv", tone: "success" } : { label: "Inaktiv", tone: "neutral" }} />
              <EditMemberDialog member={p} />
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}
