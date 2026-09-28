import Link from "next/link";
import {
  AlertTriangle, CalendarClock, CheckCircle2, ClipboardList, FileWarning, Hourglass, Inbox, ListChecks, MailWarning,
  Package, Plus, Send, UserCheck,
} from "lucide-react";
import { DashCard, DashRow } from "@/components/common/dash-card";
import { FilterBar } from "@/components/common/filter-bar";
import { PageHeader } from "@/components/common/page-header";
import { Pill, StatusBadge } from "@/components/common/status-badge";
import { Button } from "@/components/ui/button";
import { requireProfile } from "@/lib/auth";
import { calendarStatus } from "@/lib/domain/calendar-status";
import { currentYearId, groupDeliverables, loadDeliverables } from "@/lib/data/deliverables";
import { getCampaignsLite, getClientsLite, getPackageTemplates, getPeople, getSettings, personName, settingNumber } from "@/lib/data/lookups";
import { getSavedFilters, param } from "@/lib/data/saved-filters";
import { CALENDAR_STATUS, CHANNEL_LABELS, labelOf, PUBLISH_JOB_STATUS } from "@/lib/labels";
import { canEdit } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { addDays, berlinDate, berlinToday, daysBetween, formatDate, formatDateTime, isoFromNow, relativeDay } from "@/lib/time";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage({ searchParams }: PageProps<"/">) {
  const sp = await searchParams;
  const profile = await requireProfile();
  const person = param(sp.person) === "ich" ? profile.id : param(sp.person);
  const clientId = param(sp.kunde);
  const packageKey = param(sp.paket);
  const campaignId = param(sp.kampagne);
  const days = Number(param(sp.zeitraum) ?? 7) || 7;

  const supabase = await createClient();
  const today = berlinToday();
  const nowIso = isoFromNow();
  const untilIso = isoFromNow(days * 86_400_000);

  const [people, clients, campaigns, packages, settings, saved] = await Promise.all([
    getPeople(), getClientsLite(), getCampaignsLite(), getPackageTemplates(), getSettings(), getSavedFilters("dashboard"),
  ]);
  const warningDays = settingNumber(settings, "contract.warning_days", 60);

  // Paketfilter → Kunden mit passendem aktiven Vertrag
  let packageClientIds: string[] | null = null;
  if (packageKey) {
    const { data } = await supabase.from("contracts").select("client_id").eq("package_key", packageKey).in("status", ["aktiv", "gekuendigt"]);
    packageClientIds = [...new Set((data ?? []).map((c) => c.client_id))];
  }
  const clientScope = clientId ? [clientId] : packageClientIds;
  const noMatch = clientScope !== null && clientScope.length === 0;
  const scopeIds = noMatch ? ["00000000-0000-0000-0000-000000000000"] : clientScope;

  // Aufgaben: heute fällig & überfällig / wartet auf Kunde
  let taskQ = supabase
    .from("tasks")
    .select("id, title, status, priority, due_date, assignee_id, dossier_id, client_id, task_type, waiting_since, clients(name), dossiers(title)")
    .in("status", ["offen", "in_arbeit", "wartet_auf_kunde"])
    .lte("due_date", today)
    .order("due_date")
    .limit(60);
  if (person) taskQ = taskQ.eq("assignee_id", person);
  if (scopeIds) taskQ = taskQ.in("client_id", scopeIds);
  if (campaignId) taskQ = taskQ.eq("campaign_id", campaignId);

  let waitingQ = supabase
    .from("tasks")
    .select("id, title, due_date, waiting_since, assignee_id, clients(name)")
    .eq("status", "wartet_auf_kunde")
    .order("waiting_since")
    .limit(30);
  if (person) waitingQ = waitingQ.eq("assignee_id", person);
  if (scopeIds) waitingQ = waitingQ.in("client_id", scopeIds);

  // Material fehlt
  let materialQ = supabase
    .from("material_requests")
    .select("id, status, sent_at, due_date, created_at, dossier_id, client_id, clients(name), dossiers(title, owner_id, campaign_id)")
    .in("status", ["erstellt", "versendet", "geoeffnet", "in_bearbeitung", "rueckfrage", "eingereicht"])
    .is("revoked_at", null)
    .order("created_at")
    .limit(40);
  if (scopeIds) materialQ = materialQ.in("client_id", scopeIds);

  // Inhalte (interne Prüfung, freigegeben ohne Termin, nächste Veröffentlichungen)
  const contentSelect = "id, title, channel, kind, status, schedule_status, scheduled_at, approvals_complete, published_at, approval_invalidated_at, assignee_id, dossier_id, dossiers!inner(title, client_id, owner_id, campaign_id, clients(name))";
  const scopeContent = <T extends { eq: (c: string, v: string) => T; in: (c: string, v: string[]) => T }>(q: T): T => {
    let r = q;
    if (scopeIds) r = r.in("dossiers.client_id", scopeIds);
    if (campaignId) r = r.eq("dossiers.campaign_id", campaignId);
    if (person) r = r.eq("assignee_id", person);
    return r;
  };
  const reviewQ = scopeContent(supabase.from("content_items").select(contentSelect).eq("status", "interne_pruefung").order("updated_at").limit(30));
  const approvedQ = scopeContent(
    supabase.from("content_items").select(contentSelect).eq("status", "freigegeben").neq("schedule_status", "verbindlich").order("updated_at").limit(30),
  );
  const upcomingQ = scopeContent(
    supabase.from("content_items").select(contentSelect).gte("scheduled_at", nowIso).lte("scheduled_at", untilIso).neq("status", "veroeffentlicht").order("scheduled_at").limit(50),
  );

  // Vorschauen ohne Antwort
  let previewQ = supabase
    .from("previews")
    .select("id, status, sent_at, response_due_date, round, dossier_id, client_id, recipient_name, clients(name), dossiers(title, owner_id, campaign_id)")
    .in("status", ["versendet", "geoeffnet", "teilweise_beantwortet"])
    .is("revoked_at", null)
    .order("sent_at")
    .limit(30);
  if (scopeIds) previewQ = previewQ.in("client_id", scopeIds);

  // Fehlgeschlagene Veröffentlichungen & E-Mails
  const failedJobsQ = supabase
    .from("publish_jobs")
    .select("id, status, channel, last_error, scheduled_at, dossier_id, content_item_id, content_items(title), dossiers(client_id, campaign_id)")
    .in("status", ["fehlgeschlagen", "unklar"])
    .order("updated_at", { ascending: false })
    .limit(20);
  const failedMailsQ = supabase
    .from("email_events")
    .select("id, subject, to_email, status, error, created_at, dossier_id, client_id")
    .in("status", ["fehlgeschlagen", "nicht_konfiguriert"])
    .gte("created_at", isoFromNow(-14 * 86_400_000))
    .order("created_at", { ascending: false })
    .limit(20);

  // Verträge
  let contractQ = supabase
    .from("contracts")
    .select("id, client_id, package_name, package_key, start_date, end_date, status, owner_id, clients(name, is_demo)")
    .in("status", ["aktiv", "gekuendigt"])
    .order("end_date");
  if (scopeIds) contractQ = contractQ.in("client_id", scopeIds);
  if (packageKey) contractQ = contractQ.eq("package_key", packageKey);
  if (person) contractQ = contractQ.eq("owner_id", person);

  const [tasksRes, waitingRes, materialRes, reviewRes, approvedRes, upcomingRes, previewRes, failedJobsRes, failedMailsRes, contractRes] =
    await Promise.all([taskQ, waitingQ, materialQ, reviewQ, approvedQ, upcomingQ, previewQ, failedJobsQ, failedMailsQ, contractQ]);

  const tasks = (tasksRes.data ?? []).filter((t) => t.status !== "wartet_auf_kunde");
  const overdue = tasks.filter((t) => t.due_date! < today);
  const dueToday = tasks.filter((t) => t.due_date === today);
  const waiting = waitingRes.data ?? [];

  const material = (materialRes.data ?? []).filter((m) => (!campaignId || m.dossiers?.campaign_id === campaignId) && (!person || m.dossiers?.owner_id === person));
  const materialToReview = material.filter((m) => m.status === "eingereicht");
  const materialMissing = material.filter((m) => m.status !== "eingereicht");

  const previews = (previewRes.data ?? []).filter((p) => (!campaignId || p.dossiers?.campaign_id === campaignId) && (!person || p.dossiers?.owner_id === person));

  const contracts = contractRes.data ?? [];
  const units = contracts.length ? await loadDeliverables(supabase, { contractIds: contracts.map((c) => c.id) }) : [];

  // Zeitraum-Warnungen für Vertragsjahre
  const yearWarnings = contracts.flatMap((c) => {
    const yearId = currentYearId(units, c.id, today);
    const yearUnits = units.filter((u) => u.contractId === c.id && u.yearId === yearId);
    const end = yearUnits[0]?.yearEnd;
    if (!end) return [];
    const left = daysBetween(today, end);
    const open = yearUnits.filter((u) => u.progress !== "veroeffentlicht" && u.progress !== "erbracht" && u.progress !== "entfallen");
    if (left > warningDays || left < 0 || open.length === 0) return [];
    return [{ contract: c, end, left, open: open.length }];
  });

  const failedJobs = (failedJobsRes.data ?? []).filter((j) => (!scopeIds || scopeIds.includes(j.dossiers?.client_id ?? "")) && (!campaignId || j.dossiers?.campaign_id === campaignId));
  const failedMails = (failedMailsRes.data ?? []).filter((m) => !scopeIds || scopeIds.includes(m.client_id ?? ""));

  const clientName = (d: { dossiers?: { clients?: { name: string } | null } | null }) => d.dossiers?.clients?.name ?? "Eigene Redaktion";

  return (
    <div>
      <PageHeader
        title={`Guten ${new Date().getHours() < 11 ? "Morgen" : "Tag"}${profile.full_name ? `, ${profile.full_name.split(" ")[0]}` : ""}`}
        description={`Ihr Arbeitsplatz für ${formatDate(today)}. Alle Karten führen direkt zur betreffenden Akte, Aufgabe oder Kundenakte.`}
        actions={
          canEdit(profile.role) && (
            <>
              <Button asChild variant="outline"><Link href="/kunden/neu"><Plus /> Kunde & Paket</Link></Button>
              <Button asChild><Link href="/beitraege/neu"><Plus /> Eigener Beitrag</Link></Button>
            </>
          )
        }
      />

      <FilterBar
        view="dashboard"
        userId={profile.id}
        saved={saved}
        filters={[
          { name: "person", label: "Zuständige Person", options: [{ value: "ich", label: "Nur meine" }, ...people.filter((p) => p.is_active).map((p) => ({ value: p.id, label: p.full_name || p.email }))] },
          { name: "kunde", label: "Kunde", options: clients.map((c) => ({ value: c.id, label: c.name })) },
          { name: "paket", label: "Paket", options: packages.map((p) => ({ value: p.key, label: p.name })) },
          { name: "kampagne", label: "Kampagne", options: campaigns.map((c) => ({ value: c.id, label: c.name })) },
          { name: "zeitraum", label: "Zeitraum Vorschau", allLabel: "7 Tage", options: [{ value: "14", label: "14 Tage" }, { value: "30", label: "30 Tage" }] },
        ]}
      />

      <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
        <DashCard title="Heute fällig & überfällig" icon={ClipboardList} count={tasks.length} tone={overdue.length ? "danger" : "brand"} href={`/aufgaben?faellig=heute${person ? `&person=${person}` : ""}`} empty="Keine fälligen Aufgaben – gut gemacht.">
          {[...overdue, ...dueToday].slice(0, 8).map((t) => (
            <DashRow
              key={t.id}
              href={`/aufgaben?aufgabe=${t.id}`}
              urgent={t.due_date! < today}
              title={t.title}
              meta={[t.clients?.name ?? t.dossiers?.title, personName(people, t.assignee_id)].filter(Boolean).join(" · ")}
              aside={<span className={t.due_date! < today ? "font-medium text-red-700" : "text-muted-foreground"}>{t.due_date! < today ? `überfällig (${relativeDay(t.due_date!, today)})` : "heute"}</span>}
            />
          ))}
        </DashCard>

        <DashCard title="Wartet auf Kunde" icon={Hourglass} count={waiting.length} tone="waiting" href="/aufgaben?status=wartet_auf_kunde" empty="Aktuell wartet nichts auf Kunden.">
          {waiting.slice(0, 8).map((t) => (
            <DashRow
              key={t.id}
              href={`/aufgaben?aufgabe=${t.id}`}
              title={t.title}
              meta={t.clients?.name ?? undefined}
              aside={<span className="text-muted-foreground">{t.waiting_since ? `seit ${relativeDay(berlinDate(t.waiting_since), today).replace("vor ", "")}` : ""}</span>}
            />
          ))}
        </DashCard>

        <DashCard title="Kundenmaterial fehlt" icon={FileWarning} count={materialMissing.length + materialToReview.length} tone={materialToReview.length ? "brand" : "waiting"} empty="Kein Material ausstehend.">
          {materialToReview.slice(0, 4).map((m) => (
            <DashRow key={m.id} href={`/beitraege/${m.dossier_id}#material`} title={m.clients?.name ?? m.dossiers?.title} meta={`${m.dossiers?.title} · eingegangen – bitte prüfen`} aside={<Pill tone="info">prüfen</Pill>} />
          ))}
          {materialMissing.slice(0, 6).map((m) => {
            const overdueM = m.due_date && m.due_date < today;
            return (
              <DashRow
                key={m.id}
                href={`/beitraege/${m.dossier_id}#material`}
                urgent={Boolean(overdueM)}
                title={m.clients?.name ?? m.dossiers?.title}
                meta={`${m.dossiers?.title} · ${m.sent_at ? `angefordert ${relativeDay(berlinDate(m.sent_at), today)}` : "Link erstellt, noch nicht versendet"}`}
                aside={m.due_date ? <span className={overdueM ? "text-red-700" : "text-muted-foreground"}>Frist {formatDate(m.due_date)}</span> : undefined}
              />
            );
          })}
        </DashCard>

        <DashCard title="Wartet auf interne Prüfung" icon={UserCheck} count={reviewRes.data?.length ?? 0} tone="brand" href="/freigaben" empty="Keine Inhalte in interner Prüfung.">
          {(reviewRes.data ?? []).slice(0, 8).map((c) => (
            <DashRow key={c.id} href={`/beitraege/${c.dossier_id}/inhalte/${c.id}`} title={c.title} meta={`${CHANNEL_LABELS[c.channel]} · ${clientName(c)}`} />
          ))}
        </DashCard>

        <DashCard title="Kundenvorschauen ohne Antwort" icon={Inbox} count={previews.length} tone="waiting" href="/freigaben?tab=kunde" empty="Keine offenen Kundenvorschauen.">
          {previews.slice(0, 8).map((p) => {
            const late = p.response_due_date && p.response_due_date < today;
            return (
              <DashRow
                key={p.id}
                href={`/beitraege/${p.dossier_id}#vorschauen`}
                urgent={Boolean(late)}
                title={`${p.clients?.name ?? ""} – ${p.dossiers?.title ?? ""}`}
                meta={`Runde ${p.round} an ${p.recipient_name ?? "Kunde"} · ${p.sent_at ? `versendet ${relativeDay(berlinDate(p.sent_at), today)}` : "noch nicht versendet"}`}
                aside={p.response_due_date ? <span className={late ? "text-red-700" : "text-muted-foreground"}>bis {formatDate(p.response_due_date)}</span> : undefined}
              />
            );
          })}
        </DashCard>

        <DashCard title="Freigegeben, noch nicht terminiert" icon={CheckCircle2} count={approvedRes.data?.length ?? 0} tone="success" empty="Alle freigegebenen Inhalte sind terminiert.">
          {(approvedRes.data ?? []).slice(0, 8).map((c) => (
            <DashRow
              key={c.id}
              href={`/beitraege/${c.dossier_id}/inhalte/${c.id}#planung`}
              title={c.title}
              meta={`${CHANNEL_LABELS[c.channel]} · ${clientName(c)}`}
              aside={c.scheduled_at ? <span className="text-muted-foreground">vorläufig {formatDate(berlinDate(c.scheduled_at))}</span> : <span className="text-muted-foreground">ohne Termin</span>}
            />
          ))}
        </DashCard>

        <DashCard title={`Veröffentlichungen der nächsten ${days} Tage`} icon={CalendarClock} count={upcomingRes.data?.length ?? 0} tone="brand" href="/kalender?ansicht=liste" hrefLabel="Im Kalender öffnen" empty="Keine Veröffentlichungen geplant.">
          {(upcomingRes.data ?? []).slice(0, 10).map((c) => {
            const cs = calendarStatus(c, null);
            return (
              <DashRow
                key={c.id}
                href={`/beitraege/${c.dossier_id}/inhalte/${c.id}`}
                title={c.title}
                meta={`${formatDateTime(c.scheduled_at)} · ${CHANNEL_LABELS[c.channel]} · ${clientName(c)}`}
                aside={<StatusBadge def={labelOf(CALENDAR_STATUS, cs.key)} title={cs.reasons.join(", ")} />}
              />
            );
          })}
        </DashCard>

        <DashCard title="Fehlgeschlagene Veröffentlichungen & E-Mails" icon={AlertTriangle} count={failedJobs.length + failedMails.length} tone="danger" href="/veroeffentlichungen?status=probleme" empty="Keine Fehler.">
          {failedJobs.slice(0, 5).map((j) => (
            <DashRow
              key={j.id}
              href={`/veroeffentlichungen?auftrag=${j.id}`}
              urgent
              title={j.content_items?.title ?? "Veröffentlichung"}
              meta={`${CHANNEL_LABELS[j.channel]} · ${j.last_error ?? ""}`}
              aside={<StatusBadge def={labelOf(PUBLISH_JOB_STATUS, j.status)} />}
            />
          ))}
          {failedMails.slice(0, 5).map((m) => (
            <DashRow
              key={m.id}
              href={m.dossier_id ? `/beitraege/${m.dossier_id}#emails` : "/einstellungen/protokoll"}
              urgent={m.status === "fehlgeschlagen"}
              title={<span className="inline-flex items-center gap-1"><MailWarning className="size-3.5" aria-hidden /> {m.subject}</span>}
              meta={`${m.to_email} · ${m.status === "nicht_konfiguriert" ? "E-Mail-Versand nicht eingerichtet" : m.error ?? "Fehler"}`}
              aside={<span className="text-muted-foreground">{formatDate(berlinDate(m.created_at))}</span>}
            />
          ))}
        </DashCard>

        <DashCard title="Vertragsjahr endet – Leistungen offen" icon={AlertTriangle} count={yearWarnings.length} tone={yearWarnings.length ? "danger" : "neutral"} empty={`Kein Vertragsjahr endet in den nächsten ${warningDays} Tagen mit offenen Leistungen.`}>
          {yearWarnings.map((w) => (
            <DashRow
              key={w.contract.id}
              href={`/kunden/${w.contract.client_id}#leistungen`}
              urgent={w.left <= 30}
              title={w.contract.clients?.name}
              meta={`${w.contract.package_name} · ${w.open} Leistung(en) offen`}
              aside={<span className={w.left <= 30 ? "font-medium text-red-700" : "text-muted-foreground"}>endet {formatDate(w.end)}</span>}
            />
          ))}
        </DashCard>

        <DashCard title="Offene Leistungen je Membership" icon={Package} count={contracts.length} className="md:col-span-2 2xl:col-span-3" href="/leistungen" hrefLabel="Zum Leistungsüberblick" empty={<>Keine aktiven Memberships. <Link className="text-[#b90845] underline" href="/kunden/neu">Kunden anlegen und Paket buchen</Link></>}>
          <div className="grid gap-x-6 md:grid-cols-2 2xl:grid-cols-3">
            {contracts.slice(0, 18).map((c) => {
              const yearId = currentYearId(units, c.id, today);
              const groups = groupDeliverables(units.filter((u) => u.contractId === c.id && u.yearId === yearId));
              return (
                <Link key={c.id} href={`/kunden/${c.client_id}#leistungen`} className="block rounded-lg px-2 py-2.5 hover:bg-muted/70">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">{c.clients?.name}</span>
                    {c.clients?.is_demo && <Pill tone="warning">DEMO</Pill>}
                  </span>
                  <span className="block text-xs text-muted-foreground">{c.package_name} · bis {formatDate(c.end_date)}</span>
                  <ul className="mt-1 space-y-0.5">
                    {groups.length === 0 && <li className="text-xs text-muted-foreground">Keine Leistungen im aktuellen Vertragsjahr.</li>}
                    {groups.map((g) => (
                      <li key={g.key} className="flex items-start gap-1.5 text-xs">
                        <ListChecks className={g.done === g.total ? "mt-0.5 size-3 text-emerald-600" : "mt-0.5 size-3 text-muted-foreground"} aria-hidden />
                        <span>{g.summary}</span>
                      </li>
                    ))}
                  </ul>
                </Link>
              );
            })}
          </div>
        </DashCard>
      </div>

      <p className="mt-6 flex items-center gap-1.5 text-xs text-muted-foreground">
        <Send className="size-3.5" aria-hidden /> Zeitraum-Vorschau bis {formatDate(addDays(today, days))}. Wartet-auf-Kunde-Aufgaben zählen nicht als intern überfällig.
      </p>
    </div>
  );
}
