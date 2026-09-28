import { CalendarView, type CalendarEntry } from "@/components/calendar/calendar-view";
import { FilterBar } from "@/components/common/filter-bar";
import { PageHeader } from "@/components/common/page-header";
import { requireProfile } from "@/lib/auth";
import { calendarStatus } from "@/lib/domain/calendar-status";
import { getCampaignsLite, getClientsLite, getPeople, getSettings, settingNumber } from "@/lib/data/lookups";
import { getSavedFilters, param } from "@/lib/data/saved-filters";
import { CALENDAR_STATUS, CHANNEL_LABELS, TASK_TYPE_LABELS } from "@/lib/labels";
import { canApprove } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { addDays, berlinDate, berlinDayStartIso, berlinToday, endOfMonth, isValidDateOnly, startOfMonth, startOfWeek } from "@/lib/time";

export const metadata = { title: "Redaktionskalender" };

const IMPORTANT_TASKS = ["interne_pruefung", "kundenvorschau", "kundenfeedback", "terminierung", "manuelle_veroeffentlichung", "grafik", "material_pruefen", "aenderungen"];

export default async function CalendarPage({ searchParams }: PageProps<"/kalender">) {
  const sp = await searchParams;
  const profile = await requireProfile();
  const today = berlinToday();
  const viewParam = param(sp.ansicht);
  const view = viewParam === "woche" || viewParam === "liste" ? viewParam : "monat";
  const datumParam = param(sp.datum);
  const anchor = datumParam && isValidDateOnly(datumParam) ? datumParam : today;
  const channel = param(sp.kanal);
  const clientId = param(sp.kunde);
  const campaignId = param(sp.kampagne);
  const kind = param(sp.art);
  const person = param(sp.person) === "ich" ? profile.id : param(sp.person);
  const statusFilter = param(sp.status);
  const showTasks = param(sp.aufgaben) !== "aus";

  let days: string[];
  if (view === "monat") {
    const start = startOfWeek(startOfMonth(anchor));
    const end = addDays(startOfWeek(endOfMonth(anchor)), 6);
    days = [];
    for (let d = start; d <= end; d = addDays(d, 1)) days.push(d);
  } else if (view === "woche") {
    const start = startOfWeek(anchor);
    days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  } else {
    days = Array.from({ length: 31 }, (_, i) => addDays(anchor, i));
  }
  const fromIso = berlinDayStartIso(days[0]);
  const toIso = berlinDayStartIso(addDays(days[days.length - 1], 1));

  const supabase = await createClient();
  let contentQ = supabase
    .from("content_items")
    .select("id, title, channel, kind, status, schedule_status, scheduled_at, published_at, approvals_complete, approval_invalidated_at, assignee_id, window_start, window_end, dossier_id, dossiers!inner(kind, client_id, campaign_id, owner_id, clients(name)), publish_jobs(status), tasks(title, due_date, status, task_type)")
    .or(`and(scheduled_at.gte.${fromIso},scheduled_at.lt.${toIso}),and(published_at.gte.${fromIso},published_at.lt.${toIso})`)
    .neq("status", "archiviert")
    .limit(1000);
  if (channel) contentQ = contentQ.eq("channel", channel);
  if (clientId) contentQ = contentQ.eq("dossiers.client_id", clientId);
  if (campaignId) contentQ = contentQ.eq("dossiers.campaign_id", campaignId);
  if (kind) contentQ = contentQ.eq("dossiers.kind", kind);
  if (person) contentQ = contentQ.eq("assignee_id", person);

  let taskQ = supabase
    .from("tasks")
    .select("id, title, task_type, due_date, status, assignee_id, dossier_id, content_item_id, client_id, campaign_id, dossiers(kind, clients(name))")
    .in("status", ["offen", "in_arbeit", "wartet_auf_kunde"])
    .in("task_type", IMPORTANT_TASKS)
    .gte("due_date", days[0])
    .lte("due_date", days[days.length - 1])
    .limit(500);
  if (clientId) taskQ = taskQ.eq("client_id", clientId);
  if (campaignId) taskQ = taskQ.eq("campaign_id", campaignId);
  if (person) taskQ = taskQ.eq("assignee_id", person);

  let previewQ = supabase
    .from("previews")
    .select("id, response_due_date, dossier_id, client_id, clients(name), dossiers(title)")
    .in("status", ["versendet", "geoeffnet", "teilweise_beantwortet"])
    .is("revoked_at", null)
    .gte("response_due_date", days[0])
    .lte("response_due_date", days[days.length - 1]);
  if (clientId) previewQ = previewQ.eq("client_id", clientId);

  const [contentRes, taskRes, previewRes, people, clients, campaigns, settings, saved] = await Promise.all([
    contentQ,
    showTasks && !channel && kind !== "eigen" ? taskQ : Promise.resolve({ data: [] as never[] }),
    showTasks && !channel && kind !== "eigen" ? previewQ : Promise.resolve({ data: [] as never[] }),
    getPeople(), getClientsLite(), getCampaignsLite(), getSettings(), getSavedFilters("kalender"),
  ]);

  const approver = canApprove(profile.role);
  const entries: CalendarEntry[] = [];
  for (const c of contentRes.data ?? []) {
    const job = c.publish_jobs.find((j) => j.status !== "abgebrochen");
    const cs = calendarStatus(c, job?.status);
    if (statusFilter && cs.key !== statusFilter) continue;
    const at = c.status === "veroeffentlicht" && c.published_at ? c.published_at : c.scheduled_at;
    if (!at) continue;
    entries.push({
      id: c.id,
      type: "inhalt",
      title: c.title,
      day: berlinDate(at),
      at,
      channel: c.channel,
      statusKey: cs.key,
      reasons: cs.reasons,
      href: `/beitraege/${c.dossier_id}/inhalte/${c.id}`,
      clientName: c.dossiers?.clients?.name ?? null,
      kind: (c.dossiers?.kind as "kunde" | "eigen") ?? null,
      scheduleStatus: c.schedule_status,
      movable: c.status !== "veroeffentlicht" && (c.schedule_status !== "verbindlich" || approver) && !["in_bearbeitung", "wartet_auf_plattform", "unklar"].includes(job?.status ?? ""),
      related: (c.tasks ?? []).filter((t) => !["erledigt", "abgebrochen"].includes(t.status)).map((t) => ({ label: `${TASK_TYPE_LABELS[t.task_type] ?? t.task_type}: ${t.title}`, due: t.due_date })),
      windowStart: c.window_start,
      windowEnd: c.window_end,
    });
  }
  if (!statusFilter) {
    for (const t of taskRes.data ?? []) {
      if (t.content_item_id && entries.some((e) => e.id === t.content_item_id && e.day === t.due_date)) continue;
      entries.push({
        id: `t-${t.id}`,
        type: "aufgabe",
        title: `${TASK_TYPE_LABELS[t.task_type] ?? ""}: ${t.title}`,
        day: t.due_date!,
        at: null,
        channel: null,
        statusKey: t.status,
        reasons: [],
        href: `/aufgaben?aufgabe=${t.id}`,
        clientName: t.dossiers?.clients?.name ?? null,
        kind: (t.dossiers?.kind as "kunde" | "eigen") ?? null,
        movable: false,
      });
    }
    for (const p of previewRes.data ?? []) {
      entries.push({
        id: `p-${p.id}`,
        type: "frist",
        title: `Freigabefrist Kunde: ${p.dossiers?.title ?? ""}`,
        day: p.response_due_date!,
        at: null,
        channel: null,
        statusKey: "frist",
        reasons: [],
        href: `/beitraege/${p.dossier_id}#vorschauen`,
        clientName: p.clients?.name ?? null,
        kind: "kunde",
        movable: false,
      });
    }
  }

  const baseQuery = new URLSearchParams(
    Object.entries({ kanal: channel, kunde: clientId, kampagne: campaignId, art: kind, person: param(sp.person), status: statusFilter, aufgaben: param(sp.aufgaben) })
      .filter(([, v]) => v) as [string, string][],
  ).toString();

  return (
    <div>
      <PageHeader
        title="Redaktionskalender"
        description="Magazinartikel, Social-Beiträge je Kanal, eigene und Kundenbeiträge sowie wichtige Aufgaben und Freigabefristen. Vorläufige Termine sind vor der Freigabe möglich; verbindlich wird erst mit allen Freigaben."
      />
      <FilterBar
        view="kalender"
        userId={profile.id}
        saved={saved}
        filters={[
          { name: "kanal", label: "Kanal", options: Object.entries(CHANNEL_LABELS).map(([value, label]) => ({ value, label })) },
          { name: "kunde", label: "Kunde", options: clients.map((c) => ({ value: c.id, label: c.name })) },
          { name: "kampagne", label: "Kampagne", options: campaigns.map((c) => ({ value: c.id, label: c.name })) },
          { name: "art", label: "Beitragstyp", options: [{ value: "kunde", label: "Kundenbeiträge" }, { value: "eigen", label: "Eigene MEET-GERMANY-Beiträge" }] },
          { name: "person", label: "Verantwortlich", options: [{ value: "ich", label: "Nur meine" }, ...people.filter((p) => p.is_active).map((p) => ({ value: p.id, label: p.full_name || p.email }))] },
          { name: "status", label: "Status", options: Object.entries(CALENDAR_STATUS).map(([value, d]) => ({ value, label: d.label })) },
          { name: "aufgaben", label: "Aufgaben & Fristen", allLabel: "Anzeigen", options: [{ value: "aus", label: "Ausblenden" }] },
        ]}
      />
      <CalendarView
        view={view}
        anchor={anchor}
        today={today}
        days={days}
        entries={entries}
        maxPerDay={settingNumber(settings, "calendar.max_posts_per_day", 3)}
        minMinutes={settingNumber(settings, "calendar.min_minutes_between_posts", 60)}
        baseQuery={baseQuery}
      />
    </div>
  );
}
