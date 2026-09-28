import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink, FileText, ImageIcon, Inbox, Mail, Paperclip } from "lucide-react";
import { SendLinkDialog, type ContactOption, type PreviewCandidate } from "@/components/dossier/send-link-dialog";
import { CreateContentDialog, DeleteDossierButton, DeriveSocialDialog, EditDossierDialog, MaterialRequestActions, PreviewActions } from "@/components/dossier/dossier-actions";
import { WorkflowSteps } from "@/components/dossier/workflow-steps";
import { EmptyState } from "@/components/common/empty-state";
import { NoteForm } from "@/components/common/note-form";
import { PageHeader } from "@/components/common/page-header";
import { KeyValue, Section } from "@/components/common/section";
import { Pill, StatusBadge } from "@/components/common/status-badge";
import { Timeline, type AuditEntry } from "@/components/common/timeline";
import { AddLinkDialog, DeleteMediaButton, EditMediaDialog } from "@/components/media/media-dialogs";
import { MediaThumb } from "@/components/media/media-thumb";
import { MediaUploader } from "@/components/media/media-uploader";
import { TaskDialog } from "@/components/tasks/task-dialog";
import { TaskRow } from "@/components/tasks/task-row";
import { getDefaultExpiry } from "@/actions/customer";
import { requireProfile } from "@/lib/auth";
import { calendarStatus } from "@/lib/domain/calendar-status";
import { dossierWorkflow } from "@/lib/domain/workflow";
import { features } from "@/lib/env.server";
import { getCampaignsLite, getFormatRules, getPeople, peopleOptions, personName, signedUrls } from "@/lib/data/lookups";
import {
  APPROVAL_DECISION, CALENDAR_STATUS, CHANNEL_LABELS, CONTENT_KIND_LABELS, CONTENT_STATUS, DOSSIER_STATUS, EMAIL_STATUS,
  MATERIAL_STATUS, MEDIA_STATUS, OWN_CATEGORY_LABELS, POST_FORMAT_LABELS, PREVIEW_STATUS, PUBLISH_JOB_STATUS, labelOf,
} from "@/lib/labels";
import { formatBytes } from "@/lib/media";
import { canEdit } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { berlinToday, formatDate, formatDateTime } from "@/lib/time";

export default async function DossierPage({ params }: PageProps<"/beitraege/[id]">) {
  const { id } = await params;
  const profile = await requireProfile();
  const editor = canEdit(profile.role);
  const supabase = await createClient();
  const today = berlinToday();

  const { data: dossier } = await supabase
    .from("dossiers")
    .select("*, clients(id, name, contacts(id, first_name, last_name, email, can_approve, is_primary)), campaigns(id, name), deliverables(id, title, unit_no, unit_count, status, content_kind)")
    .eq("id", id)
    .maybeSingle();
  if (!dossier) notFound();

  const [contentsRes, materialRes, previewsRes, tasksRes, mediaRes, emailsRes, auditRes, templatesRes, formsRes, childDelRes, people, campaigns, rules] =
    await Promise.all([
      supabase
        .from("content_items")
        .select("*, content_media(position, media_assets(id, status, kind, storage_path, source)), publish_jobs(id, status, method, last_error)")
        .eq("dossier_id", id)
        .order("kind")
        .order("created_at"),
      supabase.from("material_requests").select("*, material_responses(*)").eq("dossier_id", id).order("created_at", { ascending: false }),
      supabase
        .from("previews")
        .select("*, preview_items(id, decision, decision_comment, decided_at, content_items(title, channel, kind), content_versions(version_no), approvals(approver_name, approver_email, approver_position))")
        .eq("dossier_id", id)
        .order("round", { ascending: false }),
      supabase.from("tasks").select("*").eq("dossier_id", id).order("status").order("due_date", { nullsFirst: false }),
      supabase.from("media_assets").select("*").eq("dossier_id", id).order("created_at", { ascending: false }),
      supabase.from("email_events").select("*").eq("dossier_id", id).order("created_at", { ascending: false }).limit(50),
      supabase.from("audit_log").select("id, occurred_at, actor_label, action, entity_type, entity_id, summary, changes, reason").eq("dossier_id", id).order("occurred_at", { ascending: false }).limit(100),
      supabase.from("email_templates").select("key, subject, body").in("key", ["material_anfrage", "vorschau"]),
      supabase.from("material_forms").select("id, name, is_default").eq("is_active", true).order("is_default", { ascending: false }),
      dossier.deliverable_id
        ? supabase.from("deliverables").select("id, status").eq("parent_deliverable_id", dossier.deliverable_id)
        : Promise.resolve({ data: [] as { id: string; status: string }[] }),
      getPeople(),
      getCampaignsLite(),
      getFormatRules(),
    ]);

  const contents = contentsRes.data ?? [];
  const materials = materialRes.data ?? [];
  const previews = previewsRes.data ?? [];
  const tasks = tasksRes.data ?? [];
  const media = mediaRes.data ?? [];
  const templates = Object.fromEntries((templatesRes.data ?? []).map((t) => [t.key, t]));
  const urls = await signedUrls(supabase, media.filter((m) => m.storage_path && m.kind !== "dokument").map((m) => m.storage_path!));
  const [materialDefaults, previewDefaults] = await Promise.all([getDefaultExpiry("material"), getDefaultExpiry("vorschau")]);
  const personOpts = peopleOptions(people);
  const article = contents.find((c) => c.kind === "magazinartikel");

  const needsMedia = (c: (typeof contents)[number]) => rules.some((r) => r.is_active && r.channel === c.channel && r.post_format === c.post_format && r.media_required);
  const steps = dossierWorkflow({
    kind: dossier.kind as "kunde" | "eigen",
    ownerId: dossier.owner_id,
    periodStart: dossier.period_start,
    periodEnd: dossier.period_end,
    materialRequests: materials,
    contents: contents.map((c) => ({
      ...c,
      mediaCount: c.content_media.length,
      finalMediaCount: c.content_media.filter((m) => m.media_assets?.status === "final").length,
      needsMedia: needsMedia(c),
    })),
    graphicTasksOpen: tasks.filter((t) => t.task_type === "grafik" && ["offen", "in_arbeit"].includes(t.status)).length,
    previews,
    deliverables: [...(dossier.deliverables ? [dossier.deliverables] : []), ...(childDelRes.data ?? [])],
  });

  const contacts: ContactOption[] = (dossier.clients?.contacts ?? []).map((c) => ({
    id: c.id, name: [c.first_name, c.last_name].filter(Boolean).join(" "), email: c.email, canApprove: c.can_approve,
  }));
  const candidates: PreviewCandidate[] = contents
    .filter((c) => !["veroeffentlicht", "archiviert"].includes(c.status))
    .map((c) => ({
      id: c.id,
      label: `${CONTENT_KIND_LABELS[c.kind]} – ${CHANNEL_LABELS[c.channel]}: ${c.title}`,
      eligible: (!c.requires_internal_approval || c.internal_ok) && c.requires_client_approval,
      reason: !c.requires_client_approval ? "Keine Kundenfreigabe erforderlich" : c.requires_internal_approval && !c.internal_ok ? "Zuerst intern freigeben" : undefined,
      preselect: c.status === "intern_freigegeben" || c.status === "aenderung_gewuenscht" || c.status === "beim_kunden",
    }));

  const openTasks = tasks.filter((t) => !["erledigt", "abgebrochen"].includes(t.status));
  const doneTasks = tasks.filter((t) => ["erledigt", "abgebrochen"].includes(t.status));
  const toRow = (t: (typeof tasks)[number]) => ({ ...t, assigneeName: personName(people, t.assignee_id), contextLabel: t.content_item_id ? contents.find((c) => c.id === t.content_item_id)?.title : null, contextHref: t.content_item_id ? `/beitraege/${id}/inhalte/${t.content_item_id}` : null });

  return (
    <div>
      <PageHeader
        back={{ href: "/beitraege", label: "Beiträge & Magazin" }}
        title={dossier.title}
        meta={
          <>
            {dossier.kind === "kunde" ? (
              <Link href={`/kunden/${dossier.client_id}`}><Pill tone="info">{dossier.clients?.name}</Pill></Link>
            ) : (
              <Pill tone="brand">Eigene Redaktion · {OWN_CATEGORY_LABELS[dossier.own_category ?? "sonstiges"]}</Pill>
            )}
            {dossier.campaigns && <Link href={`/kampagnen/${dossier.campaigns.id}`}><Pill>{dossier.campaigns.name}</Pill></Link>}
            <StatusBadge def={labelOf(DOSSIER_STATUS, dossier.status)} />
            {dossier.is_demo && <Pill tone="warning">DEMO</Pill>}
            <span className="text-xs text-muted-foreground">
              Verantwortlich: {personName(people, dossier.owner_id)}
              {(dossier.period_start || dossier.period_end) && ` · Zeitraum ${formatDate(dossier.period_start)} – ${formatDate(dossier.period_end)}`}
              {dossier.deliverables && ` · Leistung: ${dossier.deliverables.title}${dossier.deliverables.unit_count && dossier.deliverables.unit_count > 1 ? ` ${dossier.deliverables.unit_no}/${dossier.deliverables.unit_count}` : ""}`}
            </span>
          </>
        }
        actions={
          <>
            {editor && (
              <EditDossierDialog
                dossier={dossier}
                people={personOpts}
                campaigns={campaigns.map((c) => ({ value: c.id, label: c.name }))}
                contacts={contacts.map((c) => ({ value: c.id, label: c.name }))}
              />
            )}
            {editor && <DeleteDossierButton id={id} />}
          </>
        }
      />

      <div className="grid gap-4 xl:grid-cols-[1fr_22rem]">
        <div className="grid min-w-0 content-start gap-4">
          <Section title="Ablauf">
            <WorkflowSteps steps={steps} />
          </Section>

          <Section
            title="Inhalte"
            description="Magazinartikel und Social-Fassungen je Kanal – jeweils mit eigenem Status, eigener Freigabe und eigenem Termin."
            action={
              editor && (
                <>
                  {article && <DeriveSocialDialog articleId={article.id} existing={contents.filter((c) => c.parent_id === article.id).map((c) => c.channel)} />}
                  <CreateContentDialog dossierId={id} articleId={article?.id ?? null} defaultTitle={dossier.title} hasArticle={Boolean(article)} />
                </>
              )
            }
          >
            {contents.length === 0 ? (
              <EmptyState compact icon={FileText} title="Noch keine Inhalte">Legen Sie den Magazinartikel oder einen Social-Beitrag an.</EmptyState>
            ) : (
              <ul className="grid gap-2">
                {contents.map((c) => {
                  const job = c.publish_jobs.find((j) => j.status !== "abgebrochen");
                  const cs = calendarStatus(c, job?.status);
                  return (
                    <li key={c.id}>
                      <Link href={`/beitraege/${id}/inhalte/${c.id}`} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border border-border px-3 py-2.5 hover:border-stone-400">
                        <span className="w-24 shrink-0 text-sm font-medium">{CHANNEL_LABELS[c.channel]}</span>
                        <span className="min-w-40 flex-1 text-sm">
                          {c.title}
                          <span className="ml-2 text-xs text-muted-foreground">{POST_FORMAT_LABELS[c.post_format ?? ""]} · V{c.current_version_no || "–"}</span>
                        </span>
                        <StatusBadge def={labelOf(CONTENT_STATUS, c.status)} />
                        {c.scheduled_at && <StatusBadge def={labelOf(CALENDAR_STATUS, cs.key)} title={cs.reasons.join(", ")} />}
                        <span className="w-36 text-right text-xs text-muted-foreground">
                          {c.published_at ? `veröffentlicht ${formatDate(c.published_at)}` : c.scheduled_at ? formatDateTime(c.scheduled_at) : "ohne Termin"}
                        </span>
                        {job && ["fehlgeschlagen", "unklar"].includes(job.status) && <StatusBadge def={labelOf(PUBLISH_JOB_STATUS, job.status)} />}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </Section>

          {dossier.kind === "kunde" && (
            <Section
              id="material"
              title="Kundenmaterial"
              description="Persönlicher Link zum Materialformular – der Kunde kann zwischenspeichern und abschicken."
              action={
                editor && (
                  <SendLinkDialog
                    kind="material"
                    dossierId={id}
                    dossierTitle={dossier.title}
                    clientName={dossier.clients?.name ?? ""}
                    senderName={profile.full_name}
                    contacts={contacts}
                    forms={(formsRes.data ?? []).map((f) => ({ value: f.id, label: f.name }))}
                    template={templates.material_anfrage ?? { subject: "", body: "" }}
                    defaults={materialDefaults}
                    emailConfigured={features.email()}
                  />
                )
              }
            >
              {materials.length === 0 ? (
                <EmptyState compact icon={Inbox} title="Noch kein Material angefordert" />
              ) : (
                <ul className="grid gap-3">
                  {materials.map((m) => {
                    const response = Array.isArray(m.material_responses) ? m.material_responses[0] : m.material_responses;
                    const fields = ((m.form_snapshot as { fields?: { key: string; label: string; type: string }[] })?.fields ?? []);
                    const answers = (response?.answers ?? {}) as Record<string, unknown>;
                    const files = media.filter((f) => f.material_request_id === m.id);
                    const expired = new Date(m.expires_at) < new Date();
                    const active = !m.revoked_at && !expired;
                    return (
                      <li key={m.id} className="rounded-lg border border-border">
                        <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2">
                          <StatusBadge def={labelOf(MATERIAL_STATUS, m.status)} />
                          <span className="text-sm">{m.recipient_name ?? m.recipient_email}</span>
                          <span className="text-xs text-muted-foreground">
                            {m.sent_at ? `versendet ${formatDate(m.sent_at)}` : "nicht versendet"}
                            {m.due_date && ` · Frist ${formatDate(m.due_date)}`}
                            {` · Link ${m.revoked_at ? "widerrufen" : expired ? "abgelaufen" : `gültig bis ${formatDate(m.expires_at)}`}`}
                          </span>
                          <span className="ml-auto">{editor && <MaterialRequestActions id={m.id} status={m.status} active={active} />}</span>
                        </div>
                        {response && (
                          <div className="px-3 py-3">
                            <p className="mb-2 text-xs text-muted-foreground">
                              {response.submitted_at ? `Eingereicht am ${formatDateTime(response.submitted_at)}` : `Zwischengespeichert am ${formatDateTime(response.updated_at)}`}
                              {response.submitted_by_name && ` von ${response.submitted_by_name} (${response.submitted_by_email})`} · Revision {response.revision}
                            </p>
                            <dl className="grid gap-x-6 sm:grid-cols-2">
                              {fields.filter((f) => f.type !== "files" && answers[f.key] != null && String(answers[f.key]).trim() !== "").map((f) => (
                                <KeyValue key={f.key} label={f.label}>
                                  <span className="whitespace-pre-line">{Array.isArray(answers[f.key]) ? (answers[f.key] as string[]).filter(Boolean).map((x, i) => `${i + 1}. ${x}`).join("\n") : String(answers[f.key])}</span>
                                </KeyValue>
                              ))}
                            </dl>
                            {m.review_note && <p className="mt-2 rounded bg-amber-50 p-2 text-xs text-amber-900">Rückfrage/Notiz: {m.review_note}</p>}
                          </div>
                        )}
                        {files.length > 0 && (
                          <div className="border-t px-3 py-2">
                            <p className="mb-1 flex items-center gap-1 text-xs font-medium text-muted-foreground"><Paperclip className="size-3" /> Vom Kunden hochgeladen</p>
                            <ul className="flex flex-wrap gap-2 text-xs">
                              {files.map((f) => <li key={f.id} className="rounded bg-muted px-2 py-1">{f.file_name} · {formatBytes(f.size_bytes)}{f.credit && ` · ${f.credit}`}</li>)}
                            </ul>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </Section>
          )}

          <Section
            id="vorschauen"
            title="Kundenvorschau & Freigaben"
            description="Der Kunde sieht nur die zugesandten Fassungen. Jede Entscheidung gilt für genau diese Version."
            action={
              editor && dossier.kind === "kunde" && (
                <SendLinkDialog
                  kind="vorschau"
                  dossierId={id}
                  dossierTitle={dossier.title}
                  clientName={dossier.clients?.name ?? ""}
                  senderName={profile.full_name}
                  contacts={contacts}
                  candidates={candidates}
                  template={templates.vorschau ?? { subject: "", body: "" }}
                  defaults={previewDefaults}
                  emailConfigured={features.email()}
                />
              )
            }
          >
            {dossier.kind === "eigen" && <p className="mb-2 text-sm text-muted-foreground">Eigene Beiträge benötigen keine Kundenfreigabe – nur die interne Freigabe.</p>}
            {previews.length === 0 ? (
              dossier.kind === "kunde" && <EmptyState compact icon={Mail} title="Noch keine Vorschau versendet">Inhalte zuerst intern freigeben, dann hier versenden.</EmptyState>
            ) : (
              <ul className="grid gap-3">
                {previews.map((p) => {
                  const expired = new Date(p.expires_at) < new Date();
                  const active = !p.revoked_at && !expired && p.status !== "ersetzt";
                  return (
                    <li key={p.id} className="rounded-lg border border-border">
                      <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2">
                        <span className="text-sm font-medium">Runde {p.round}</span>
                        <StatusBadge def={labelOf(PREVIEW_STATUS, p.status)} />
                        <span className="text-xs text-muted-foreground">
                          an {p.recipient_name ?? p.recipient_email}
                          {p.sent_at && ` · versendet ${formatDate(p.sent_at)}`}
                          {p.first_viewed_at && ` · geöffnet ${formatDate(p.first_viewed_at)}`}
                          {p.response_due_date && ` · Antwort bis ${formatDate(p.response_due_date)}`}
                        </span>
                        <span className="ml-auto">{editor && <PreviewActions id={p.id} status={p.status} active={active} />}</span>
                      </div>
                      <ul className="divide-y">
                        {p.preview_items.map((pi) => {
                          const approval = Array.isArray(pi.approvals) ? pi.approvals[0] : pi.approvals;
                          return (
                            <li key={pi.id} className="flex flex-wrap items-start gap-2 px-3 py-2 text-sm">
                              <span className="flex-1">
                                {CONTENT_KIND_LABELS[pi.content_items?.kind ?? ""]} ({CHANNEL_LABELS[pi.content_items?.channel ?? ""]}) · Version {pi.content_versions?.version_no}
                                {pi.decision_comment && <span className="mt-1 block rounded bg-muted/60 p-2 text-xs">„{pi.decision_comment}“</span>}
                              </span>
                              {pi.decision ? (
                                <span className="text-right text-xs">
                                  <StatusBadge def={labelOf(APPROVAL_DECISION, pi.decision)} />
                                  <span className="mt-1 block text-muted-foreground">
                                    {formatDateTime(pi.decided_at)}
                                    {approval && ` · ${approval.approver_name}${approval.approver_position ? `, ${approval.approver_position}` : ""} <${approval.approver_email}>`}
                                  </span>
                                </span>
                              ) : (
                                <span className="text-xs text-muted-foreground">offen</span>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    </li>
                  );
                })}
              </ul>
            )}
          </Section>

          <Section id="medien" title="Dateien & Medien" description="Uploads im geschützten Speicher oder Links (z. B. Google Drive). Grafiken werden extern erstellt und hier hinterlegt." action={<><AddLinkDialog dossierId={id} /><MediaUploader dossierId={id} /></>}>
            {media.length === 0 ? (
              <EmptyState compact icon={ImageIcon} title="Noch keine Dateien" />
            ) : (
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {media.map((m) => (
                  <li key={m.id} className="rounded-lg border border-border p-2">
                    <MediaThumb url={m.storage_path ? urls[m.storage_path] : null} kind={m.kind} source={m.source} alt={m.alt_text} />
                    <div className="mt-2 flex items-start gap-1">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium" title={m.file_name}>{m.title || m.file_name}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {m.width && m.height ? `${m.width}×${m.height}` : m.source === "link" ? "Link" : ""}
                          {m.size_bytes ? ` · ${formatBytes(m.size_bytes)}` : ""}
                          {m.uploaded_via === "kunde" ? " · vom Kunden" : ""}
                        </p>
                        <div className="mt-1 flex flex-wrap items-center gap-1">
                          <StatusBadge def={labelOf(MEDIA_STATUS, m.status)} />
                          {m.external_url && <a href={m.external_url} target="_blank" rel="noreferrer" className="text-[11px] text-[#b90845] hover:underline">öffnen <ExternalLink className="inline size-3" /></a>}
                        </div>
                      </div>
                      <div className="flex flex-col">
                        <EditMediaDialog media={m} />
                        {editor && <DeleteMediaButton id={m.id} name={m.file_name} />}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section id="historie" title="Historie" description="Chronologisch: Änderungen, Freigaben, Versand, Veröffentlichungen, Notizen.">
            <NoteForm dossierId={id} />
            <div className="mt-4">
              <Timeline entries={(auditRes.data ?? []) as AuditEntry[]} />
            </div>
          </Section>
        </div>

        <aside className="grid content-start gap-4">
          <Section title="Aufgaben" action={<TaskDialog people={personOpts} context={{ dossierId: id, clientId: dossier.client_id ?? undefined }} />} bodyClassName="p-0">
            {openTasks.length === 0 ? (
              <p className="px-4 py-4 text-sm text-muted-foreground">Keine offenen Aufgaben.</p>
            ) : (
              <ul className="divide-y">{openTasks.map((t) => <TaskRow key={t.id} task={toRow(t)} today={today} people={personOpts} />)}</ul>
            )}
            {doneTasks.length > 0 && (
              <details className="border-t px-4 py-2 text-sm">
                <summary className="cursor-pointer text-xs text-muted-foreground">{doneTasks.length} erledigt/abgebrochen</summary>
                <ul className="-mx-4 mt-2 divide-y">{doneTasks.map((t) => <TaskRow key={t.id} task={toRow(t)} today={today} people={personOpts} />)}</ul>
              </details>
            )}
          </Section>

          <Section title="Angaben">
            <dl>
              <KeyValue label="Thema">{dossier.topic}</KeyValue>
              <KeyValue label="Ziel">{dossier.goal}</KeyValue>
              <KeyValue label="Zielgruppe">{dossier.target_audience}</KeyValue>
              <KeyValue label="Kernaussage">{dossier.key_message}</KeyValue>
              {dossier.kind === "kunde" && (
                <KeyValue label="Ansprechpartner">{contacts.find((c) => c.id === dossier.contact_id)?.name ?? "–"}</KeyValue>
              )}
            </dl>
            {dossier.notes && <p className="mt-2 whitespace-pre-line rounded-lg bg-muted/50 p-2 text-sm">{dossier.notes}</p>}
          </Section>

          <Section id="emails" title="E-Mails" bodyClassName="p-0">
            {(emailsRes.data ?? []).length === 0 ? (
              <p className="px-4 py-4 text-sm text-muted-foreground">Noch keine E-Mails.</p>
            ) : (
              <ul className="divide-y">
                {(emailsRes.data ?? []).map((e) => (
                  <li key={e.id} className="px-4 py-2.5 text-xs">
                    <p className="font-medium">{e.subject}</p>
                    <p className="text-muted-foreground">an {e.to_email} · {formatDateTime(e.created_at)} · {e.triggered_by === "erinnerung" ? "Erinnerung" : e.triggered_by}</p>
                    <div className="mt-1"><StatusBadge def={labelOf(EMAIL_STATUS, e.status)} /></div>
                    {e.error && <p className="mt-1 text-red-700">{e.error}</p>}
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </aside>
      </div>
    </div>
  );
}
