import Link from "next/link";
import { AlertTriangle, CheckCircle2, Clock, ExternalLink, Hand, Send } from "lucide-react";
import { CancelJobDialog, ConfirmPublicationDialog, CopyTextButton, DownloadMediaButton, RetryButton, RunNowButton } from "@/components/publishing/publishing-actions";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { Section } from "@/components/common/section";
import { Pill, StatusBadge } from "@/components/common/status-badge";
import { requireProfile } from "@/lib/auth";
import { features } from "@/lib/env.server";
import { getPlatformAccounts } from "@/lib/data/lookups";
import { param } from "@/lib/data/saved-filters";
import { CHANNEL_LABELS, CONNECTION_STATUS, PUBLISH_JOB_STATUS, labelOf } from "@/lib/labels";
import { canEdit, isAdmin } from "@/lib/permissions";
import { composeSocialText } from "@/lib/platforms/text";
import { htmlToPlainText } from "@/lib/sanitize";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime, requestNow, toBerlinLocalInput } from "@/lib/time";
import { cn } from "@/lib/utils";

export const metadata = { title: "Veröffentlichungen" };

export default async function PublishingPage({ searchParams }: PageProps<"/veroeffentlichungen">) {
  const sp = await searchParams;
  const profile = await requireProfile();
  const editor = canEdit(profile.role);
  const supabase = await createClient();
  const selected = param(sp.auftrag);
  const nowLocal = toBerlinLocalInput(new Date());

  const jobSelect = "*, content_items(id, title, kind, channel, caption, cta, hashtags, link_url, post_format, teaser, body_html, seo_title, meta_description, published_url, content_media(position, media_assets(id, file_name, kind))), dossiers(title, kind, clients(name)), platform_accounts(display_name)";
  const [activeRes, doneRes, runsRes, accounts, selectedRes] = await Promise.all([
    supabase.from("publish_jobs").select(jobSelect).in("status", ["fehlgeschlagen", "unklar", "manuell_offen", "geplant", "in_bearbeitung", "wartet_auf_plattform"]).order("scheduled_at"),
    supabase.from("publish_jobs").select("id, channel, method, published_at, published_url, content_item_id, dossier_id, confirmed_by, content_items(title), dossiers(title, clients(name))").eq("status", "veroeffentlicht").order("published_at", { ascending: false }).limit(50),
    supabase.from("job_runs").select("*").eq("job", "tick").order("started_at", { ascending: false }).limit(5),
    getPlatformAccounts(),
    selected ? supabase.from("publish_jobs").select("*, content_items(title), publish_attempts(*)").eq("id", selected).maybeSingle() : Promise.resolve({ data: null }),
  ]);

  const jobs = activeRes.data ?? [];
  const problems = jobs.filter((j) => j.status === "fehlgeschlagen" || j.status === "unklar");
  const manual = jobs.filter((j) => j.status === "manuell_offen");
  const auto = jobs.filter((j) => ["geplant", "in_bearbeitung", "wartet_auf_plattform"].includes(j.status));
  const lastRun = runsRes.data?.[0];
  const now = requestNow();
  const overdueAuto = auto.filter((j) => new Date(j.scheduled_at).getTime() < now - 30 * 60_000);
  const detail = selectedRes.data;

  const packageText = (c: NonNullable<(typeof jobs)[number]["content_items"]>) =>
    c.kind === "magazinartikel"
      ? [c.title, c.teaser, c.seo_title ? `SEO-Titel: ${c.seo_title}` : "", c.meta_description ? `Meta-Beschreibung: ${c.meta_description}` : "", "", htmlToPlainText(c.body_html)].filter((x) => x !== null).join("\n\n")
      : composeSocialText(c);

  return (
    <div>
      <PageHeader
        title="Veröffentlichungen"
        description="Geplante, manuelle und fehlgeschlagene Veröffentlichungen mit Nachweis. Als veröffentlicht gilt ein Inhalt nur mit Plattformbestätigung oder manueller Bestätigung inkl. Link."
        actions={isAdmin(profile.role) && features.admin() && <RunNowButton />}
      />

      <div className="mb-4 grid gap-3 md:grid-cols-2">
        <Section title="Hintergrundprozess" bodyClassName="text-sm">
          {!features.cron() && <p className="mb-2 rounded-md bg-amber-50 p-2 text-xs text-amber-900">Einrichtung erforderlich: CRON_SECRET ist nicht gesetzt – der geschützte Hintergrundprozess kann nicht automatisch aufgerufen werden.</p>}
          {lastRun ? (
            <p>Letzter Lauf: {formatDateTime(lastRun.started_at)} · <StatusBadge def={{ label: lastRun.status === "ok" ? "erfolgreich" : lastRun.status === "uebersprungen" ? "übersprungen" : lastRun.status === "laeuft" ? "läuft" : "Fehler", tone: lastRun.status === "ok" ? "success" : lastRun.status === "fehler" ? "danger" : "neutral" }} /></p>
          ) : (
            <p className="text-muted-foreground">Noch kein Lauf protokolliert.</p>
          )}
          {lastRun?.error && <p className="mt-1 text-xs text-red-700">{lastRun.error}</p>}
          {overdueAuto.length > 0 && (
            <p className="mt-2 flex gap-1.5 text-xs text-orange-800"><AlertTriangle className="size-3.5 shrink-0" /> {overdueAuto.length} automatische Veröffentlichung(en) sind seit über 30 Minuten fällig. Läuft der Cron-Job häufig genug? (Vercel Hobby: nur 1× täglich)</p>
          )}
        </Section>
        <Section title="Plattformkonten" bodyClassName="text-sm" action={<Link href="/einstellungen/integrationen" className="text-xs text-[#b90845] hover:underline">Integrationen</Link>}>
          {accounts.length === 0 ? (
            <p className="text-muted-foreground">Noch keine Konten angelegt – alle Social-Beiträge werden manuell veröffentlicht.</p>
          ) : (
            <ul className="grid gap-1">
              {accounts.map((a) => (
                <li key={a.id} className="flex items-center gap-2">
                  <span className="w-20 text-xs font-medium">{CHANNEL_LABELS[a.platform]}</span>
                  <span className="flex-1 truncate">{a.display_name}</span>
                  <StatusBadge def={a.api_enabled ? labelOf(CONNECTION_STATUS, a.connection_status) : { label: "Manuell", tone: "neutral" }} />
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-xs text-muted-foreground">MICE Magazin: keine Schnittstelle bekannt – Veröffentlichung manuell mit URL-Erfassung.</p>
        </Section>
      </div>

      {detail && (
        <Section className="mb-4 border-[#b90845]" title={`Auftrag: ${detail.content_items?.title ?? ""}`} description={`${CHANNEL_LABELS[detail.channel]} · ${detail.method === "api" ? "Schnittstelle" : "manuell"} · Versuche: ${detail.attempt_count}`} action={<StatusBadge def={labelOf(PUBLISH_JOB_STATUS, detail.status)} />}>
          {detail.last_error && <p className="mb-3 rounded-md bg-red-50 p-2 text-sm text-red-800">{detail.last_error}</p>}
          {detail.manual_reason && <p className="mb-3 text-sm text-muted-foreground">Grund für manuelle Veröffentlichung: {detail.manual_reason}</p>}
          {detail.publish_attempts.length === 0 ? <p className="text-sm text-muted-foreground">Noch keine Versuche.</p> : (
            <ol className="grid gap-2 text-xs">
              {[...detail.publish_attempts].sort((a, b) => b.started_at.localeCompare(a.started_at)).map((a) => (
                <li key={a.id} className="rounded-lg border border-border p-2">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{a.step}</span>
                    <Pill tone={a.outcome === "erfolg" ? "success" : a.outcome === "unklar" ? "warning" : a.outcome === "fehler" ? "danger" : "neutral"}>{a.outcome}</Pill>
                    {a.http_status ? <span>HTTP {a.http_status}</span> : null}
                    <span className="ml-auto text-muted-foreground">{formatDateTime(a.started_at)}</span>
                  </p>
                  {a.error_message && <p className="mt-1 text-red-700">{a.error_message}</p>}
                  {a.response != null && (
                    <details className="mt-1"><summary className="cursor-pointer text-muted-foreground">Antwort der Plattform</summary><pre className="mt-1 max-h-48 overflow-auto rounded bg-muted p-2 text-[11px]">{JSON.stringify(a.response, null, 2)}</pre></details>
                  )}
                </li>
              ))}
            </ol>
          )}
        </Section>
      )}

      <div className="grid gap-4">
        <Section title={<span className="flex items-center gap-2"><AlertTriangle className="size-4 text-red-600" /> Fehlgeschlagen oder unklar ({problems.length})</span>} description="Bleiben sichtbar, bis sie gezielt wiederholt, manuell bestätigt oder abgebrochen werden.">
          {problems.length === 0 ? <p className="text-sm text-muted-foreground">Keine Probleme.</p> : (
            <ul className="grid gap-2">
              {problems.map((j) => (
                <li key={j.id} className={cn("rounded-lg border p-3", j.id === selected ? "border-[#b90845]" : "border-red-200 bg-red-50/40")}>
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge def={labelOf(PUBLISH_JOB_STATUS, j.status)} />
                    <Link href={`/beitraege/${j.dossier_id}/inhalte/${j.content_item_id}`} className="font-medium hover:text-[#b90845]">{j.content_items?.title}</Link>
                    <span className="text-xs text-muted-foreground">{CHANNEL_LABELS[j.channel]} · {j.platform_accounts?.display_name ?? "ohne Konto"} · geplant {formatDateTime(j.scheduled_at)} · {j.attempt_count} Versuch(e)</span>
                  </div>
                  {j.last_error && <p className="mt-1 text-xs text-red-800">{j.last_error}</p>}
                  {editor && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      <RetryButton jobId={j.id} unclear={j.status === "unklar"} />
                      <ConfirmPublicationDialog contentId={j.content_item_id} nowLocal={nowLocal} label={j.status === "unklar" ? "Ist erschienen – Link eintragen" : "Manuell veröffentlicht"} />
                      <CancelJobDialog jobId={j.id} />
                      <Link href={`/veroeffentlichungen?auftrag=${j.id}`} className="inline-flex items-center px-2 text-xs text-[#b90845] hover:underline">Versuche ansehen</Link>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title={<span className="flex items-center gap-2"><Hand className="size-4 text-amber-600" /> Manuell zu veröffentlichen ({manual.length})</span>} description="Text und Medien sind vorbereitet. Nach dem Posten bitte Link und Zeitpunkt eintragen.">
          {manual.length === 0 ? <p className="text-sm text-muted-foreground">Keine manuellen Veröffentlichungen offen.</p> : (
            <ul className="grid gap-3">
              {manual.map((j) => {
                const c = j.content_items!;
                const text = packageText(c);
                const media = (c.content_media ?? []).sort((a, b) => a.position - b.position).map((m) => m.media_assets).filter(Boolean);
                const due = new Date(j.scheduled_at).getTime() <= now;
                return (
                  <li key={j.id} className={cn("rounded-lg border p-3", due ? "border-amber-300 bg-amber-50/40" : "border-border")}>
                    <div className="flex flex-wrap items-center gap-2">
                      <Pill tone="brand">{CHANNEL_LABELS[j.channel]}</Pill>
                      <Link href={`/beitraege/${j.dossier_id}/inhalte/${j.content_item_id}`} className="font-medium hover:text-[#b90845]">{c.title}</Link>
                      <span className="text-xs text-muted-foreground">{j.dossiers?.kind === "kunde" ? j.dossiers.clients?.name : "Eigene Redaktion"} · {due ? "fällig seit" : "geplant"} {formatDateTime(j.scheduled_at)}</span>
                    </div>
                    {j.manual_reason && <p className="mt-1 text-xs text-muted-foreground">{j.manual_reason}</p>}
                    <details className="mt-2">
                      <summary className="cursor-pointer text-xs font-medium">Vorbereiteter {c.kind === "magazinartikel" ? "Artikel" : "Beitragstext"} & Medien</summary>
                      <pre className="mt-2 max-h-64 overflow-auto rounded-md bg-muted p-3 text-xs whitespace-pre-wrap">{text}</pre>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {media.map((m) => m && <DownloadMediaButton key={m.id} mediaId={m.id} name={m.file_name} />)}
                      </div>
                    </details>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <CopyTextButton text={text} />
                      {editor && <ConfirmPublicationDialog contentId={j.content_item_id} nowLocal={nowLocal} />}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Section>

        <Section title={<span className="flex items-center gap-2"><Clock className="size-4 text-[#6f2659]" /> Automatisch geplant ({auto.length})</span>}>
          {auto.length === 0 ? <p className="text-sm text-muted-foreground">Keine automatischen Veröffentlichungen geplant.</p> : (
            <ul className="divide-y text-sm">
              {auto.map((j) => (
                <li key={j.id} className="flex flex-wrap items-center gap-3 py-2">
                  <span className="w-40 text-xs text-muted-foreground">{formatDateTime(j.scheduled_at)}</span>
                  <span className="w-24 text-xs font-medium">{CHANNEL_LABELS[j.channel]}</span>
                  <Link href={`/beitraege/${j.dossier_id}/inhalte/${j.content_item_id}`} className="flex-1 hover:text-[#b90845]">{j.content_items?.title}</Link>
                  <StatusBadge def={labelOf(PUBLISH_JOB_STATUS, j.status)} />
                  {editor && j.status === "geplant" && <CancelJobDialog jobId={j.id} />}
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title={<span className="flex items-center gap-2"><CheckCircle2 className="size-4 text-emerald-600" /> Veröffentlicht (letzte 50)</span>}>
          {(doneRes.data ?? []).length === 0 ? (
            <EmptyState compact icon={Send} title="Noch keine Veröffentlichungen" />
          ) : (
            <ul className="divide-y text-sm">
              {(doneRes.data ?? []).map((j) => (
                <li key={j.id} className="flex flex-wrap items-center gap-3 py-2">
                  <span className="w-40 text-xs text-muted-foreground">{formatDateTime(j.published_at)}</span>
                  <span className="w-24 text-xs font-medium">{CHANNEL_LABELS[j.channel]}</span>
                  <Link href={`/beitraege/${j.dossier_id}/inhalte/${j.content_item_id}`} className="min-w-40 flex-1 hover:text-[#b90845]">{j.content_items?.title}</Link>
                  <span className="text-xs text-muted-foreground">{j.dossiers?.clients?.name ?? "Eigen"} · {j.method === "api" && !j.confirmed_by ? "Schnittstelle" : "manuell bestätigt"}</span>
                  {j.published_url && <a href={j.published_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-[#b90845] hover:underline">Link <ExternalLink className="size-3" /></a>}
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </div>
  );
}
