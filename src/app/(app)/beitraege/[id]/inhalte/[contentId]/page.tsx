import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { ArticleForm } from "@/components/content/article-form";
import { MediaPanel, PublicationPanel, ReviewPanel, SchedulePanel, VersionList, type AssignedMedia, type VersionInfo } from "@/components/content/content-panels";
import { SocialForm } from "@/components/content/social-form";
import { ActionButton } from "@/components/common/action-button";
import { PageHeader } from "@/components/common/page-header";
import { Section } from "@/components/common/section";
import { Pill, StatusBadge } from "@/components/common/status-badge";
import { AddLinkDialog } from "@/components/media/media-dialogs";
import { MediaUploader } from "@/components/media/media-uploader";
import { TaskDialog } from "@/components/tasks/task-dialog";
import { TaskRow } from "@/components/tasks/task-row";
import { archiveContent, deleteContent } from "@/actions/content";
import { requireProfile } from "@/lib/auth";
import { calendarStatus } from "@/lib/domain/calendar-status";
import { describeRule } from "@/lib/domain/format-text";
import { rulesFor, validateContent } from "@/lib/domain/format-validation";
import { publishReadiness } from "@/lib/domain/readiness";
import { getFormatRules, getPeople, getPlatformAccounts, peopleOptions, personName, signedUrls } from "@/lib/data/lookups";
import { CALENDAR_STATUS, CHANNEL_LABELS, CONNECTION_STATUS, CONTENT_KIND_LABELS, CONTENT_STATUS, POST_FORMAT_LABELS, PUBLISH_JOB_STATUS, labelOf } from "@/lib/labels";
import { canApprove as canApproveRole, canEdit } from "@/lib/permissions";
import { adapterFor } from "@/lib/platforms/registry";
import { sanitizeArticleHtml } from "@/lib/sanitize";
import { createClient } from "@/lib/supabase/server";
import { berlinToday, formatDateTime, toBerlinLocalInput } from "@/lib/time";

export default async function ContentPage({ params }: PageProps<"/beitraege/[id]/inhalte/[contentId]">) {
  const { id, contentId } = await params;
  const profile = await requireProfile();
  const supabase = await createClient();

  const { data: item } = await supabase
    .from("content_items")
    .select("*, dossiers(id, title, kind, client_id, clients(name)), deliverables(title, unit_no, unit_count)")
    .eq("id", contentId)
    .eq("dossier_id", id)
    .maybeSingle();
  if (!item) notFound();

  const [versionsRes, approvalsRes, linksRes, libraryRes, jobsRes, tasksRes, people, rules, accounts] = await Promise.all([
    supabase.from("content_versions").select("id, version_no, fingerprint, reason, created_at, created_by, snapshot").eq("content_item_id", contentId).order("version_no", { ascending: false }),
    supabase.from("approvals").select("id, kind, decision, decided_at, decided_by, approver_name, approver_email, content_version_id, comment").eq("content_item_id", contentId).order("decided_at", { ascending: false }),
    supabase.from("content_media").select("position, role, media_assets(*)").eq("content_item_id", contentId).order("position"),
    supabase.from("media_assets").select("id, file_name, kind, status").eq("dossier_id", id).neq("status", "veraltet").order("created_at", { ascending: false }),
    supabase.from("publish_jobs").select("*").eq("content_item_id", contentId).order("created_at", { ascending: false }),
    supabase.from("tasks").select("*").eq("content_item_id", contentId).not("status", "in", "(erledigt,abgebrochen)").order("due_date"),
    getPeople(),
    getFormatRules(),
    getPlatformAccounts(),
  ]);

  const versions = versionsRes.data ?? [];
  const approvals = approvalsRes.data ?? [];
  const assignedAssets = (linksRes.data ?? []).map((l) => ({ ...l.media_assets!, role: l.role })).filter((m) => m.id);
  const urls = await signedUrls(supabase, assignedAssets.filter((m) => m.storage_path).map((m) => m.storage_path!));
  const channelAccounts = accounts.filter((a) => a.platform === item.channel);
  const account = channelAccounts.find((a) => a.id === item.platform_account_id) ?? null;
  const job = (jobsRes.data ?? []).find((j) => j.status !== "abgebrochen") ?? null;
  const personOpts = peopleOptions(people);
  const approver = canApproveRole(profile.role);
  const editor = canEdit(profile.role);

  const approvalInfo = (approvalId: string | null) => {
    const a = approvals.find((x) => x.id === approvalId);
    if (!a) return null;
    const v = versions.find((x) => x.id === a.content_version_id);
    return {
      ok: a.decision === "freigegeben" && v?.fingerprint === item.fingerprint,
      versionNo: v?.version_no ?? null,
      by: a.decided_by ? personName(people, a.decided_by) : `${a.approver_name} <${a.approver_email}>`,
      at: a.decided_at,
    };
  };

  const applicable = rulesFor(rules, item.channel, item.post_format);
  const apiFormat = applicable.some((r) => r.api_supported) && (adapterFor(item.channel)?.supportedFormats.includes(item.post_format ?? "") ?? false);
  const readiness = publishReadiness(item, assignedAssets, rules, account, apiFormat);
  const issues = validateContent(item, assignedAssets, rules).filter((i) => i.code !== "text_fehlt");
  const apiAvailable = Boolean(account && account.api_enabled && account.connection_status === "verbunden" && apiFormat);
  const apiReason = !account
    ? "kein Zielkonto zugeordnet"
    : !account.api_enabled || account.connection_status !== "verbunden"
      ? `Konto ${labelOf(CONNECTION_STATUS, account.connection_status).label.toLowerCase()}${!account.api_enabled ? ", API-Veröffentlichung nicht aktiviert" : ""}`
      : !apiFormat ? "Format wird per API nicht unterstützt" : null;
  const cs = calendarStatus(item, job?.status);
  const published = item.status === "veroeffentlicht";

  const assigned: AssignedMedia[] = assignedAssets.map((m) => ({
    id: m.id, file_name: m.file_name, kind: m.kind, source: m.source, status: m.status, url: m.storage_path ? urls[m.storage_path] ?? null : null,
    width: m.width, height: m.height, alt_text: m.alt_text, credit: m.credit, role: m.role,
  }));
  const versionInfos: VersionInfo[] = versions.map((v) => {
    const snap = (v.snapshot ?? {}) as VersionInfo["snapshot"];
    return {
      id: v.id,
      version_no: v.version_no,
      reason: v.reason,
      created_at: v.created_at,
      author: personName(people, v.created_by),
      isCurrent: v.fingerprint === item.fingerprint,
      approvals: approvals.filter((a) => a.content_version_id === v.id).map((a) => ({
        kind: a.kind, decision: a.decision, at: a.decided_at, who: a.decided_by ? personName(people, a.decided_by) : `${a.approver_name}`,
      })),
      snapshot: { ...snap, body_html: snap.body_html ? sanitizeArticleHtml(snap.body_html) : undefined },
    };
  });

  return (
    <div>
      <PageHeader
        back={{ href: `/beitraege/${id}`, label: item.dossiers?.title ?? "Beitragsakte" }}
        title={item.title}
        meta={
          <>
            <Pill tone="brand">{CONTENT_KIND_LABELS[item.kind]} · {CHANNEL_LABELS[item.channel]}</Pill>
            <Pill>{POST_FORMAT_LABELS[item.post_format ?? ""]}</Pill>
            <StatusBadge def={labelOf(CONTENT_STATUS, item.status)} />
            {item.scheduled_at && <StatusBadge def={labelOf(CALENDAR_STATUS, cs.key)} title={cs.reasons.join(", ")} />}
            {job && ["fehlgeschlagen", "unklar", "manuell_offen", "geplant"].includes(job.status) && <StatusBadge def={labelOf(PUBLISH_JOB_STATUS, job.status)} />}
            <span className="text-xs text-muted-foreground">
              {item.dossiers?.kind === "kunde" ? item.dossiers.clients?.name : "Eigene Redaktion"}
              {item.deliverables && ` · Leistung: ${item.deliverables.title}${item.deliverables.unit_count && item.deliverables.unit_count > 1 ? ` ${item.deliverables.unit_no}/${item.deliverables.unit_count}` : ""}`}
              {item.scheduled_at && ` · Termin ${formatDateTime(item.scheduled_at)}`}
            </span>
          </>
        }
        actions={
          !published && (
            <>
              {editor && item.status !== "archiviert" && (
                <ActionButton action={() => archiveContent(contentId)} variant="ghost" confirm={{ title: "Inhalt archivieren?", description: "Der Inhalt wird aus Planung und Kalender entfernt, bleibt aber in der Akte erhalten.", confirmLabel: "Archivieren" }}>Archivieren</ActionButton>
              )}
              {editor && ["entwurf", "archiviert"].includes(item.status) && (
                <ActionButton action={() => deleteContent(contentId)} variant="ghost" confirm={{ title: "Inhalt löschen?", description: "Nur Entwürfe ohne Veröffentlichung können gelöscht werden.", confirmLabel: "Löschen", destructive: true }}>Löschen</ActionButton>
              )}
            </>
          )
        }
      />

      {cs.reasons.length > 0 && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900" role="alert">
          <strong>Blockiert:</strong> {cs.reasons.join(" · ")}
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[1fr_24rem]">
        <div className="min-w-0">
          <Section title={item.kind === "magazinartikel" ? "Magazinartikel" : `Fassung für ${CHANNEL_LABELS[item.channel]}`} description={item.kind === "social" ? "Diese Fassung ist unabhängig – Änderungen wirken sich nicht auf andere Kanäle aus." : undefined}>
            {item.kind === "magazinartikel" ? (
              <ArticleForm item={item} people={personOpts} locked={published} />
            ) : (
              <SocialForm
                item={item}
                people={personOpts}
                accounts={channelAccounts.map((a) => ({ value: a.id, label: `${a.display_name}${a.api_enabled && a.connection_status === "verbunden" ? "" : " (manuell)"}` }))}
                limits={{
                  caption: applicable.map((r) => r.caption_max_length).find((n) => n != null) ?? null,
                  hashtags: applicable.map((r) => r.hashtags_max).find((n) => n != null) ?? null,
                }}
                previewImage={assigned.find((m) => m.kind === "bild")?.url ?? null}
                locked={published}
              />
            )}
          </Section>
        </div>

        <aside className="grid content-start gap-4">
          <Section title="Prüfung & Freigaben">
            <ReviewPanel
              contentId={contentId}
              status={item.status}
              canApprove={approver}
              requiresInternal={item.requires_internal_approval}
              requiresClient={item.requires_client_approval}
              internal={approvalInfo(item.internal_approval_id)}
              client={approvalInfo(item.client_approval_id)}
              currentVersion={versions.find((v) => v.fingerprint === item.fingerprint)?.version_no ?? 0}
              invalidatedAt={item.approval_invalidated_at}
            />
            {item.requires_client_approval && item.internal_ok && !item.client_ok && (
              <p className="mt-3 text-xs">
                <Link href={`/beitraege/${id}#vorschauen`} className="text-[#b90845] underline">Kundenvorschau in der Akte senden</Link>
              </p>
            )}
          </Section>

          <Section id="planung" title="Planung & Voraussetzungen">
            <SchedulePanel
              contentId={contentId}
              channel={item.channel}
              scheduleStatus={item.schedule_status}
              scheduledAt={item.scheduled_at}
              autoPublish={item.auto_publish}
              accountId={item.platform_account_id}
              accounts={channelAccounts.map((a) => ({ value: a.id, label: a.display_name }))}
              approvalsComplete={item.approvals_complete}
              canApprove={approver}
              apiAvailable={apiAvailable}
              apiReason={apiReason}
              checks={readiness.checks}
              published={published}
            />
          </Section>

          <Section title="Medien" id="medien">
            <MediaPanel
              contentId={contentId}
              assigned={assigned}
              library={(libraryRes.data ?? []).filter((m) => !assigned.some((a) => a.id === m.id) && m.kind !== "dokument").map((m) => ({ value: m.id, label: `${m.file_name}${m.status === "final" ? " (final)" : ""}` }))}
              issues={issues}
              ruleText={applicable.flatMap(describeRule)}
            >
              {!published && (
                <>
                  <MediaUploader dossierId={id} attachTo={contentId} rules={rules} channel={item.channel} postFormat={item.post_format} label="Hochladen & zuordnen" />
                  <AddLinkDialog dossierId={id} attachTo={contentId} />
                </>
              )}
            </MediaPanel>
            {assigned.length > 0 && !published && (
              <details className="mt-3 text-xs">
                <summary className="cursor-pointer text-muted-foreground">Neue Version eines Mediums hochladen</summary>
                <div className="mt-2 grid gap-2">
                  {assigned.filter((m) => m.source === "upload").map((m) => (
                    <div key={m.id} className="flex items-center justify-between gap-2">
                      <span className="truncate">{m.file_name}</span>
                      <MediaUploader dossierId={id} attachTo={contentId} supersedesId={m.id} rules={rules} channel={item.channel} postFormat={item.post_format} label="Neue Version" variant="ghost" />
                    </div>
                  ))}
                </div>
              </details>
            )}
          </Section>

          <Section title="Veröffentlichung & Nachweis">
            <PublicationPanel
              contentId={contentId}
              channel={item.channel}
              published={published}
              publishedAt={item.published_at}
              publishedUrl={item.published_url}
              method={item.publish_method}
              metrics={item.metrics as never}
              job={job}
              nowLocal={toBerlinLocalInput(new Date())}
            />
            {job && <p className="mt-2 text-xs"><Link className="inline-flex items-center gap-1 text-[#b90845] hover:underline" href={`/veroeffentlichungen?auftrag=${job.id}`}>Auftrag & Versuche ansehen <ExternalLink className="size-3" /></Link></p>}
          </Section>

          <Section title="Aufgaben zu diesem Inhalt" action={<TaskDialog people={personOpts} context={{ dossierId: id, contentItemId: contentId }} />} bodyClassName="p-0">
            {(tasksRes.data ?? []).length === 0 ? (
              <p className="px-4 py-3 text-sm text-muted-foreground">Keine offenen Aufgaben.</p>
            ) : (
              <ul className="divide-y">
                {(tasksRes.data ?? []).map((t) => <TaskRow key={t.id} task={{ ...t, assigneeName: personName(people, t.assignee_id) }} today={berlinToday()} people={personOpts} />)}
              </ul>
            )}
          </Section>

          <Section title="Versionen">
            <VersionList versions={versionInfos} />
          </Section>
        </aside>
      </div>
    </div>
  );
}
