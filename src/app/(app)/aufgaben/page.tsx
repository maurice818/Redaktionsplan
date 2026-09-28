import { CheckSquare, Hourglass } from "lucide-react";
import { EmptyState } from "@/components/common/empty-state";
import { FilterBar } from "@/components/common/filter-bar";
import { PageHeader } from "@/components/common/page-header";
import { Section } from "@/components/common/section";
import { TaskDialog } from "@/components/tasks/task-dialog";
import { TaskRow, type TaskRowData } from "@/components/tasks/task-row";
import { requireProfile } from "@/lib/auth";
import { getCampaignsLite, getClientsLite, getPeople, peopleOptions, personName } from "@/lib/data/lookups";
import { getSavedFilters, param } from "@/lib/data/saved-filters";
import { TASK_STATUS, TASK_TYPE_LABELS } from "@/lib/labels";
import { createClient } from "@/lib/supabase/server";
import { addDays, berlinToday } from "@/lib/time";
import { safeSearch } from "@/lib/validation";

export const metadata = { title: "Aufgaben" };

export default async function TasksPage({ searchParams }: PageProps<"/aufgaben">) {
  const sp = await searchParams;
  const profile = await requireProfile();
  const supabase = await createClient();
  const today = berlinToday();
  const personParam = param(sp.person) ?? (param(sp.aufgabe) ? "alle" : "ich");
  const person = personParam === "ich" ? profile.id : personParam === "alle" ? undefined : personParam;
  const status = param(sp.status) ?? "aktiv";
  const due = param(sp.faellig);
  const type = param(sp.art);
  const clientId = param(sp.kunde);
  const campaignId = param(sp.kampagne);
  const q = param(sp.q);
  const highlight = param(sp.aufgabe);

  let query = supabase
    .from("tasks")
    .select("*, clients(name), dossiers(title), content_items(title)")
    .order("due_date", { ascending: true, nullsFirst: false })
    .order("priority", { ascending: false })
    .limit(500);
  if (person) query = query.eq("assignee_id", person);
  if (status === "aktiv") query = query.in("status", ["offen", "in_arbeit", "wartet_auf_kunde"]);
  else if (status !== "alle") query = query.eq("status", status);
  if (type) query = query.eq("task_type", type);
  if (clientId) query = query.eq("client_id", clientId);
  if (campaignId) query = query.eq("campaign_id", campaignId);
  if (q) query = query.ilike("title", `%${safeSearch(q)}%`);
  if (due === "heute") query = query.lte("due_date", today);
  if (due === "woche") query = query.lte("due_date", addDays(today, 7));

  const [{ data }, people, clients, campaigns, saved] = await Promise.all([query, getPeople(), getClientsLite(), getCampaignsLite(), getSavedFilters("aufgaben")]);
  const personOpts = peopleOptions(people);
  const rows: TaskRowData[] = (data ?? []).map((t) => ({
    ...t,
    assigneeName: personName(people, t.assignee_id),
    contextLabel: t.content_items?.title ?? t.dossiers?.title ?? t.clients?.name ?? null,
    contextHref: t.content_item_id && t.dossier_id ? `/beitraege/${t.dossier_id}/inhalte/${t.content_item_id}` : t.dossier_id ? `/beitraege/${t.dossier_id}` : t.client_id ? `/kunden/${t.client_id}` : null,
  }));

  const active = rows.filter((t) => !["erledigt", "abgebrochen"].includes(t.status));
  const waiting = active.filter((t) => t.status === "wartet_auf_kunde");
  const internal = active.filter((t) => t.status !== "wartet_auf_kunde");
  const groups = [
    { key: "ueberfaellig", title: "Intern überfällig", tone: "text-red-700", items: internal.filter((t) => t.due_date && t.due_date < today) },
    { key: "heute", title: "Heute fällig", tone: "", items: internal.filter((t) => t.due_date === today) },
    { key: "woche", title: "Nächste 7 Tage", tone: "", items: internal.filter((t) => t.due_date && t.due_date > today && t.due_date <= addDays(today, 7)) },
    { key: "spaeter", title: "Später", tone: "", items: internal.filter((t) => t.due_date && t.due_date > addDays(today, 7)) },
    { key: "ohne", title: "Ohne Fälligkeit", tone: "", items: internal.filter((t) => !t.due_date) },
  ].filter((g) => g.items.length);
  const closed = rows.filter((t) => ["erledigt", "abgebrochen"].includes(t.status));

  return (
    <div>
      <PageHeader
        title="Aufgaben"
        description="Automatisch aus dem Ablauf entstandene und manuell angelegte Aufgaben. „Wartet auf Kunde“ wird getrennt von intern überfälligen Aufgaben geführt."
        actions={<TaskDialog people={personOpts} />}
      />
      <FilterBar
        view="aufgaben"
        userId={profile.id}
        saved={saved}
        search={{ name: "q", placeholder: "Aufgabe suchen …" }}
        filters={[
          { name: "person", label: "Zuständig", allLabel: "Nur meine", options: [{ value: "alle", label: "Alle Personen" }, ...people.filter((p) => p.is_active && p.id !== profile.id).map((p) => ({ value: p.id, label: p.full_name || p.email }))] },
          { name: "status", label: "Status", allLabel: "Alle offenen", options: [{ value: "alle", label: "Alle inkl. erledigt" }, ...Object.entries(TASK_STATUS).map(([value, d]) => ({ value, label: d.label }))] },
          { name: "faellig", label: "Fälligkeit", options: [{ value: "heute", label: "Heute & überfällig" }, { value: "woche", label: "Bis in 7 Tagen" }] },
          { name: "art", label: "Art", options: Object.entries(TASK_TYPE_LABELS).map(([value, label]) => ({ value, label })) },
          { name: "kunde", label: "Kunde", options: clients.map((c) => ({ value: c.id, label: c.name })) },
          { name: "kampagne", label: "Kampagne", options: campaigns.map((c) => ({ value: c.id, label: c.name })) },
        ]}
      />

      {rows.length === 0 ? (
        <EmptyState icon={CheckSquare} title="Keine Aufgaben für diese Auswahl" action={<TaskDialog people={personOpts} />}>
          Aufgaben entstehen automatisch (z. B. „Material prüfen“, „Manuell veröffentlichen“) oder lassen sich hier manuell anlegen.
        </EmptyState>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
          <div className="grid content-start gap-4">
            {groups.map((g) => (
              <Section key={g.key} title={<span className={g.tone}>{g.title} ({g.items.length})</span>} bodyClassName="p-0">
                <ul className="divide-y">{g.items.map((t) => <TaskRow key={t.id} task={t} today={today} people={personOpts} highlight={t.id === highlight} />)}</ul>
              </Section>
            ))}
            {groups.length === 0 && <EmptyState icon={CheckSquare} title="Keine internen Aufgaben offen" compact />}
            {closed.length > 0 && (
              <Section title={`Erledigt / abgebrochen (${closed.length})`} bodyClassName="p-0">
                <ul className="divide-y">{closed.slice(0, 100).map((t) => <TaskRow key={t.id} task={t} today={today} people={personOpts} highlight={t.id === highlight} />)}</ul>
              </Section>
            )}
          </div>
          <Section title={<span className="flex items-center gap-2"><Hourglass className="size-4 text-amber-600" /> Wartet auf Kunde ({waiting.length})</span>} description="Nicht intern überfällig – Erinnerungen an Kunden laufen automatisch nach den Erinnerungsregeln." bodyClassName="p-0" className="h-fit">
            {waiting.length === 0 ? <p className="px-4 py-4 text-sm text-muted-foreground">Nichts offen beim Kunden.</p> : (
              <ul className="divide-y">{waiting.map((t) => <TaskRow key={t.id} task={t} today={today} people={personOpts} highlight={t.id === highlight} />)}</ul>
            )}
          </Section>
        </div>
      )}
    </div>
  );
}
