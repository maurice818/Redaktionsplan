"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  AlertTriangle, ArrowDown, ArrowUp, CheckCircle2, Circle, Eye, History, Info, Link2Off, Plus, Save, Send, ShieldCheck, XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { ActionButton } from "@/components/common/action-button";
import { ActionForm, FieldShell, FormActions, InputField, NativeSelect, SubmitButton, TextareaField, type Option } from "@/components/common/form";
import { StatusBadge } from "@/components/common/status-badge";
import { attachMedia, decideReview, detachMedia, moveMedia, requestReview, saveMetrics, saveVersion, scheduleContent } from "@/actions/content";
import { confirmManualPublication } from "@/actions/publishing";
import type { Issue } from "@/lib/domain/types";
import type { ReadinessCheck } from "@/lib/domain/readiness";
import { CHANNEL_LABELS, MEDIA_STATUS, PUBLISH_JOB_STATUS, labelOf } from "@/lib/labels";
import { formatDateTime, toBerlinLocalInput } from "@/lib/time";
import { cn } from "@/lib/utils";
import { MediaThumb } from "@/components/media/media-thumb";

// -----------------------------------------------------------------------------
// Prüfung & Freigaben
// -----------------------------------------------------------------------------
export function ReviewPanel({
  contentId,
  status,
  canApprove,
  requiresInternal,
  requiresClient,
  internal,
  client,
  currentVersion,
  invalidatedAt,
}: {
  contentId: string;
  status: string;
  canApprove: boolean;
  requiresInternal: boolean;
  requiresClient: boolean;
  internal: { ok: boolean; versionNo: number | null; by: string | null; at: string | null } | null;
  client: { ok: boolean; versionNo: number | null; by: string | null; at: string | null } | null;
  currentVersion: number;
  invalidatedAt: string | null;
}) {
  const [note, setNote] = useState("");
  const canRequest = ["entwurf", "aenderung_gewuenscht"].includes(status) && requiresInternal;
  const approvalLine = (label: string, required: boolean, a: typeof internal) => {
    if (!required) return <li className="flex gap-2 text-muted-foreground"><Circle className="mt-0.5 size-4" /> {label}: nicht erforderlich</li>;
    if (a?.ok) return <li className="flex gap-2 text-emerald-800"><CheckCircle2 className="mt-0.5 size-4" /> <span>{label}: gültig für die aktuelle Fassung (Version {a.versionNo}) · {a.by} · {formatDateTime(a.at)}</span></li>;
    if (a?.versionNo) return <li className="flex gap-2 text-orange-800"><AlertTriangle className="mt-0.5 size-4" /> <span>{label}: liegt für Version {a.versionNo} vor – die aktuelle Fassung weicht ab und ist <strong>nicht</strong> freigegeben.</span></li>;
    return <li className="flex gap-2"><Circle className="mt-0.5 size-4 text-muted-foreground" /> {label}: ausstehend</li>;
  };
  return (
    <div className="grid gap-3 text-sm">
      <ul className="grid gap-1.5">
        {approvalLine("Interne Freigabe", requiresInternal, internal)}
        {approvalLine("Kundenfreigabe", requiresClient, client)}
      </ul>
      {invalidatedAt && !(internal?.ok && (!requiresClient || client?.ok)) && (
        <p className="rounded-md bg-orange-50 p-2 text-xs text-orange-900">
          Am {formatDateTime(invalidatedAt)} wurde der Inhalt nach einer Prüfung/Freigabe geändert. Die Freigabe gilt nicht stillschweigend weiter – bitte erneut prüfen lassen.
        </p>
      )}
      <p className="text-xs text-muted-foreground">Aktuelle Fassung: Version {currentVersion || "noch nicht gespeichert"}. Versionen entstehen bei Prüfung, Kundenvorschau und Veröffentlichung.</p>
      {canRequest && (
        <div className="grid gap-2">
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Hinweis für die Prüfung (optional)" className="rounded-lg border border-input px-3 py-2 text-sm" aria-label="Hinweis für die Prüfung" />
          <ActionButton action={() => requestReview(contentId, note)} size="sm"><Send /> Zur internen Prüfung geben</ActionButton>
        </div>
      )}
      {canApprove && ["entwurf", "interne_pruefung", "aenderung_gewuenscht"].includes(status) && requiresInternal && (
        <ActionForm action={decideReview} className="grid gap-2 rounded-lg border border-[#e3cfdc] bg-[#fbf5f8] p-3">
          <input type="hidden" name="id" value={contentId} />
          <p className="flex items-center gap-1.5 text-sm font-medium"><ShieldCheck className="size-4 text-[#6f2659]" /> Interne Prüfung (Freigabe/Leitung)</p>
          <TextareaField name="comment" label="Kommentar" rows={2} help="Bei Änderungswünschen Pflicht." />
          <div className="flex flex-wrap gap-2">
            <SubmitButton size="sm" name="decision" value="freigegeben"><CheckCircle2 /> Intern freigeben</SubmitButton>
            <SubmitButton size="sm" variant="outline" name="decision" value="aenderung_gewuenscht"><XCircle /> Änderungen anfordern</SubmitButton>
          </div>
        </ActionForm>
      )}
      <ActionButton action={() => saveVersion(contentId)} size="sm" variant="ghost"><Save /> Aktuellen Stand als Version sichern</ActionButton>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Planung
// -----------------------------------------------------------------------------
export function SchedulePanel({
  contentId,
  channel,
  scheduleStatus,
  scheduledAt,
  autoPublish,
  accountId,
  accounts,
  approvalsComplete,
  canApprove,
  apiAvailable,
  apiReason,
  checks,
  published,
}: {
  contentId: string;
  channel: string;
  scheduleStatus: string;
  scheduledAt: string | null;
  autoPublish: boolean;
  accountId: string | null;
  accounts: Option[];
  approvalsComplete: boolean;
  canApprove: boolean;
  apiAvailable: boolean;
  apiReason: string | null;
  checks: ReadinessCheck[];
  published: boolean;
}) {
  const [mode, setMode] = useState(scheduleStatus === "ohne_termin" ? "vorlaeufig" : scheduleStatus);
  const bindingAllowed = approvalsComplete && canApprove;
  return (
    <div className="grid gap-3">
      <ul className="grid gap-1 text-xs">
        {checks.map((c) => (
          <li key={c.key} className={cn("flex items-start gap-1.5", c.ok ? "text-emerald-800" : c.optional ? "text-muted-foreground" : "text-foreground")}>
            {c.ok ? <CheckCircle2 className="mt-0.5 size-3.5 shrink-0" /> : c.optional ? <Info className="mt-0.5 size-3.5 shrink-0" /> : <XCircle className="mt-0.5 size-3.5 shrink-0 text-red-600" />}
            <span>{c.label}{c.apiOnly && " (nur automatisch)"}{c.detail && <span className="block text-muted-foreground">{c.detail}</span>}</span>
          </li>
        ))}
      </ul>
      {published ? (
        <p className="text-sm text-muted-foreground">Bereits veröffentlicht.</p>
      ) : (
        <ActionForm action={scheduleContent} className="grid gap-3">
          <input type="hidden" name="id" value={contentId} />
          <fieldset className="grid gap-1.5">
            <legend className="mb-1 text-sm font-medium">Planungsstatus</legend>
            {[
              { value: "vorlaeufig", label: "Vorläufiger Termin", hint: "Jederzeit möglich – wird nicht veröffentlicht." },
              { value: "verbindlich", label: "Verbindlich einplanen", hint: bindingAllowed ? "Termin ist autorisiert; Veröffentlichung automatisch oder als Aufgabe." : !approvalsComplete ? "Erst möglich, wenn alle erforderlichen Freigaben für die aktuelle Fassung vorliegen." : "Nur Freigabe/Leitung oder Admin." },
              { value: "ohne_termin", label: "Ohne Termin", hint: "Termin entfernen." },
            ].map((o) => (
              <label key={o.value} className={cn("flex items-start gap-2 rounded-lg border px-3 py-2 text-sm", mode === o.value && "border-[#b90845] bg-[#fbf5f8]", o.value === "verbindlich" && !bindingAllowed && "opacity-60")}>
                <input type="radio" name="mode" value={o.value} checked={mode === o.value} disabled={o.value === "verbindlich" && !bindingAllowed} onChange={() => setMode(o.value)} className="mt-0.5 accent-[#b90845]" />
                <span>{o.label}<span className="block text-xs text-muted-foreground">{o.hint}</span></span>
              </label>
            ))}
          </fieldset>
          {mode !== "ohne_termin" && (
            <InputField name="scheduled_local" type="datetime-local" label="Termin (Europe/Berlin)" defaultValue={toBerlinLocalInput(scheduledAt)} required />
          )}
          {channel !== "magazin" && (
            <FieldShell label="Zielkonto" htmlFor={`acc-${contentId}`}>
              <NativeSelect id={`acc-${contentId}`} name="platform_account_id" defaultValue={accountId ?? ""}>
                <option value="">Nicht zugeordnet</option>
                {accounts.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
              </NativeSelect>
            </FieldShell>
          )}
          {mode === "verbindlich" && channel !== "magazin" && (
            <label className={cn("flex items-start gap-2 text-sm", !apiAvailable && "opacity-60")}>
              <input type="checkbox" name="auto_publish" defaultChecked={autoPublish && apiAvailable} disabled={!apiAvailable} className="mt-0.5 size-4 accent-[#b90845]" />
              <span>
                Automatisch per Schnittstelle veröffentlichen
                <span className="block text-xs text-muted-foreground">
                  {apiAvailable ? "Der Hintergrundprozess veröffentlicht zum Termin, sofern alle Voraussetzungen erfüllt sind." : `Nicht verfügbar: ${apiReason ?? "Schnittstelle nicht eingerichtet"}. Es wird eine Aufgabe zur manuellen Veröffentlichung angelegt.`}
                </span>
              </span>
            </label>
          )}
          {channel === "magazin" && mode === "verbindlich" && (
            <p className="rounded-md bg-sky-50 p-2 text-xs text-sky-900">Für das MICE Magazin ist keine Schnittstelle eingerichtet. Zum Termin entsteht eine Aufgabe „Manuell veröffentlichen“ mit anschließender URL-Erfassung.</p>
          )}
          <FormActions>
            <SubmitButton size="sm">Planung speichern</SubmitButton>
          </FormActions>
        </ActionForm>
      )}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Medien
// -----------------------------------------------------------------------------
export interface AssignedMedia {
  id: string;
  file_name: string;
  kind: string;
  source: string;
  status: string;
  url: string | null;
  width: number | null;
  height: number | null;
  alt_text: string | null;
  credit: string | null;
  role: string;
}

export function MediaPanel({
  contentId,
  assigned,
  library,
  issues,
  ruleText,
  children,
}: {
  contentId: string;
  assigned: AssignedMedia[];
  library: Option[];
  issues: Issue[];
  ruleText: string[];
  children?: React.ReactNode;
}) {
  const [pick, setPick] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) toast.error(res.error ?? "Fehler");
      router.refresh();
    });

  return (
    <div className="grid gap-3">
      {ruleText.length > 0 && (
        <div className="rounded-md bg-muted/60 p-2.5 text-xs">
          <p className="mb-1 font-medium">Formatvorgaben</p>
          <ul className="list-disc space-y-0.5 pl-4 text-muted-foreground">{ruleText.map((t) => <li key={t}>{t}</li>)}</ul>
        </div>
      )}
      {issues.length > 0 && (
        <ul className="grid gap-1">
          {issues.map((i) => (
            <li key={i.code + i.message} className={cn("flex gap-1.5 rounded-md px-2 py-1.5 text-xs", i.level === "error" ? "bg-red-50 text-red-800" : i.level === "warning" ? "bg-amber-50 text-amber-900" : "bg-sky-50 text-sky-900")}>
              {i.level === "info" ? <Info className="mt-0.5 size-3.5 shrink-0" /> : <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />} {i.message}
            </li>
          ))}
        </ul>
      )}
      {assigned.length === 0 ? (
        <p className="text-sm text-muted-foreground">Noch kein Medium zugeordnet.</p>
      ) : (
        <ul className="grid grid-cols-2 gap-2">
          {assigned.map((m, index) => (
            <li key={m.id} className="rounded-lg border border-border p-1.5">
              <MediaThumb url={m.url} kind={m.kind} source={m.source} alt={m.alt_text} />
              <p className="mt-1 truncate text-[11px] font-medium" title={m.file_name}>{index + 1}. {m.file_name}</p>
              <p className="text-[11px] text-muted-foreground">{m.width && m.height ? `${m.width}×${m.height}` : m.source === "link" ? "Link" : ""}</p>
              <div className="mt-1 flex items-center justify-between">
                <StatusBadge def={labelOf(MEDIA_STATUS, m.status)} />
                <span className="flex">
                  <button type="button" disabled={pending || index === 0} onClick={() => run(() => moveMedia(contentId, m.id, -1))} className="rounded p-1 hover:bg-muted disabled:opacity-30" aria-label="Nach vorne"><ArrowUp className="size-3.5" /></button>
                  <button type="button" disabled={pending || index === assigned.length - 1} onClick={() => run(() => moveMedia(contentId, m.id, 1))} className="rounded p-1 hover:bg-muted disabled:opacity-30" aria-label="Nach hinten"><ArrowDown className="size-3.5" /></button>
                  <button type="button" disabled={pending} onClick={() => run(() => detachMedia(contentId, m.id))} className="rounded p-1 hover:bg-muted hover:text-destructive" aria-label="Zuordnung entfernen"><Link2Off className="size-3.5" /></button>
                </span>
              </div>
              {!m.alt_text && m.kind === "bild" && <p className="mt-1 text-[10px] text-amber-800">Alt-Text fehlt</p>}
            </li>
          ))}
        </ul>
      )}
      {library.length > 0 && (
        <div className="flex gap-2">
          <NativeSelect value={pick} onChange={(e) => setPick(e.target.value)} aria-label="Medium aus der Akte zuordnen" className="flex-1">
            <option value="">Aus der Akte zuordnen …</option>
            {library.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
          </NativeSelect>
          <Button size="sm" variant="outline" disabled={!pick || pending} onClick={() => run(async () => { const r = await attachMedia(contentId, pick); setPick(""); return r; })}>
            <Plus /> Zuordnen
          </Button>
        </div>
      )}
      <div className="flex flex-wrap gap-2">{children}</div>
      <p className="text-[11px] text-muted-foreground">Hinweis: Änderungen an der Medienzuordnung gelten als inhaltliche Änderung und erfordern eine erneute Freigabe.</p>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Versionen
// -----------------------------------------------------------------------------
export interface VersionInfo {
  id: string;
  version_no: number;
  reason: string | null;
  created_at: string;
  author: string;
  isCurrent: boolean;
  approvals: { kind: string; decision: string; who: string; at: string }[];
  snapshot: { title?: string; teaser?: string; body_html?: string; caption?: string; cta?: string; hashtags?: string[]; post_format?: string; media?: { file_name: string }[] };
}

const REASONS: Record<string, string> = {
  interne_pruefung: "Interne Prüfung",
  kundenvorschau: "Kundenvorschau",
  veroeffentlichung: "Veröffentlichung",
  manuell: "Manuell gesichert",
};

export function VersionList({ versions }: { versions: VersionInfo[] }) {
  if (versions.length === 0) return <p className="text-sm text-muted-foreground">Noch keine Versionen.</p>;
  return (
    <ul className="grid gap-2 text-sm">
      {versions.map((v) => (
        <li key={v.id} className="rounded-lg border border-border px-3 py-2">
          <div className="flex items-center gap-2">
            <History className="size-4 text-muted-foreground" />
            <span className="font-medium">Version {v.version_no}</span>
            {v.isCurrent && <span className="rounded bg-[#f4ecf1] px-1.5 text-[11px] text-[#6f2659]">entspricht aktueller Fassung</span>}
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="ghost" size="icon-sm" className="ml-auto" aria-label={`Version ${v.version_no} ansehen`}><Eye /></Button>
              </DialogTrigger>
              <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Version {v.version_no}</DialogTitle>
                  <DialogDescription>{REASONS[v.reason ?? ""] ?? v.reason} · {formatDateTime(v.created_at)} · {v.author}</DialogDescription>
                </DialogHeader>
                <div className="grid gap-2 text-sm">
                  {v.snapshot.title && <p className="text-lg font-semibold">{v.snapshot.title}</p>}
                  {v.snapshot.teaser && <p className="text-muted-foreground">{v.snapshot.teaser}</p>}
                  {v.snapshot.body_html && <div className="prose-mg rounded-lg border p-3" dangerouslySetInnerHTML={{ __html: v.snapshot.body_html }} />}
                  {v.snapshot.caption && <p className="whitespace-pre-line rounded-lg border p-3">{v.snapshot.caption}{v.snapshot.cta ? `\n\n${v.snapshot.cta}` : ""}{v.snapshot.hashtags?.length ? `\n\n${v.snapshot.hashtags.join(" ")}` : ""}</p>}
                  {v.snapshot.media && v.snapshot.media.length > 0 && <p className="text-xs text-muted-foreground">Medien: {v.snapshot.media.map((m) => m.file_name).join(", ")}</p>}
                </div>
              </DialogContent>
            </Dialog>
          </div>
          <p className="text-xs text-muted-foreground">{REASONS[v.reason ?? ""] ?? v.reason} · {formatDateTime(v.created_at)} · {v.author}</p>
          {v.approvals.map((a) => (
            <p key={a.at + a.kind} className={cn("mt-1 text-xs", a.decision === "freigegeben" ? "text-emerald-800" : "text-orange-800")}>
              {a.kind === "kunde" ? "Kunde" : "Intern"}: {a.decision === "freigegeben" ? "freigegeben" : "Änderung gewünscht"} · {a.who} · {formatDateTime(a.at)}
            </p>
          ))}
        </li>
      ))}
    </ul>
  );
}

// -----------------------------------------------------------------------------
// Veröffentlichung & Nachweis
// -----------------------------------------------------------------------------
export function PublicationPanel({
  contentId,
  channel,
  published,
  publishedAt,
  publishedUrl,
  method,
  metrics,
  job,
  nowLocal,
}: {
  contentId: string;
  channel: string;
  published: boolean;
  publishedAt: string | null;
  publishedUrl: string | null;
  method: string | null;
  metrics: { reach?: number; impressions?: number; clicks?: number; source?: string; note?: string } | null;
  job: { status: string; last_error: string | null; manual_reason: string | null } | null;
  nowLocal: string;
}) {
  if (published) {
    return (
      <div className="grid gap-3 text-sm">
        <p className="flex items-start gap-2 text-emerald-800"><CheckCircle2 className="mt-0.5 size-4" /> Veröffentlicht am {formatDateTime(publishedAt)} ({method === "api" ? "per Schnittstelle" : "manuell bestätigt"})</p>
        {publishedUrl && <a href={publishedUrl} target="_blank" rel="noreferrer" className="break-all text-[#b90845] underline">{publishedUrl}</a>}
        <ActionForm action={saveMetrics} className="grid gap-2 rounded-lg border border-border p-3">
          <input type="hidden" name="id" value={contentId} />
          <p className="text-xs font-medium">Kennzahlen (optional, nur echte Werte)</p>
          <div className="grid grid-cols-3 gap-2">
            <InputField name="reach" label="Reichweite" inputMode="numeric" defaultValue={metrics?.reach ?? ""} />
            <InputField name="impressions" label="Impressionen" inputMode="numeric" defaultValue={metrics?.impressions ?? ""} />
            <InputField name="clicks" label="Klicks" inputMode="numeric" defaultValue={metrics?.clicks ?? ""} />
          </div>
          <InputField name="note" label="Quelle/Stand" placeholder="z. B. Instagram Insights, Stand 01.10." defaultValue={metrics?.note ?? ""} />
          <FormActions><SubmitButton size="sm" variant="outline">Kennzahlen speichern</SubmitButton></FormActions>
          <p className="text-[11px] text-muted-foreground">Werte werden als „manuell eingetragen“ gekennzeichnet. Leere Felder entfernen die Kennzahlen.</p>
        </ActionForm>
      </div>
    );
  }
  return (
    <div className="grid gap-3 text-sm">
      {job && (
        <p className="text-xs text-muted-foreground">
          Auftrag: {job.status === "manuell_offen" ? "manuell zu veröffentlichen" : labelOf(PUBLISH_JOB_STATUS, job.status).label}{job.manual_reason ? ` – ${job.manual_reason}` : ""}
          {job.last_error && <span className="mt-1 block text-red-700">{job.last_error}</span>}
        </p>
      )}
      <ActionForm action={confirmManualPublication} className="grid gap-2 rounded-lg border border-border p-3">
        <input type="hidden" name="content_id" value={contentId} />
        <p className="text-xs font-medium">Manuell auf {CHANNEL_LABELS[channel]} veröffentlicht? Nachweis eintragen:</p>
        <InputField name="url" label="Link zur Veröffentlichung" placeholder="https://" required />
        <InputField name="published_local" type="datetime-local" label="Tatsächlich veröffentlicht am" defaultValue={nowLocal} required />
        <TextareaField name="note" label="Notiz" rows={2} />
        <FormActions><SubmitButton size="sm">Veröffentlichung bestätigen</SubmitButton></FormActions>
        <p className="text-[11px] text-muted-foreground">Erst mit Link und Zeitpunkt gilt der Inhalt als veröffentlicht; die zugehörige Leistung wird automatisch als erbracht markiert.</p>
      </ActionForm>
    </div>
  );
}
