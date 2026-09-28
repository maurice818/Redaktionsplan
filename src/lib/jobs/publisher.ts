import "server-only";
import { validateContent, hasBlockingIssues } from "@/lib/domain/format-validation";
import type { FormatRule } from "@/lib/domain/types";
import { sendTemplatedEmail } from "@/lib/email/send";
import { publicEnv } from "@/lib/env";
import { decryptSecret } from "@/lib/security/crypto";
import type { AdminSupabase } from "@/lib/supabase/admin";
import { adapterFor } from "@/lib/platforms/registry";
import { composeSocialText } from "@/lib/platforms/text";
import type { PublishMedia, PublishOutcome } from "@/lib/platforms/types";
import { CHANNEL_LABELS } from "@/lib/labels";

export interface PublishRunSummary {
  claimed: number;
  published: number;
  processing: number;
  failed: number;
  unclear: number;
  cancelled: number;
}

type Finish = {
  outcome: "veroeffentlicht" | "wartet_auf_plattform" | "fehlgeschlagen" | "unklar" | "abgebrochen";
  postId?: string | null;
  url?: string | null;
  publishedAt?: string | null;
  containerId?: string | null;
  nextCheckAt?: string | null;
  error?: string | null;
};

/**
 * Verarbeitet fällige API-Veröffentlichungsaufträge. Jeder Auftrag wird vorher
 * atomar reserviert (claim_due_publish_jobs), sodass parallele oder doppelte
 * Cron-Aufrufe denselben Beitrag nicht zweimal veröffentlichen.
 */
export async function processPublishing(admin: AdminSupabase, runId: string, limit = 5): Promise<PublishRunSummary> {
  const summary: PublishRunSummary = { claimed: 0, published: 0, processing: 0, failed: 0, unclear: 0, cancelled: 0 };
  const { data: jobs, error } = await admin.rpc("claim_due_publish_jobs", { p_run_id: runId, p_limit: limit });
  if (error) throw new Error(`Aufträge konnten nicht reserviert werden: ${error.message}`);
  summary.claimed = jobs?.length ?? 0;

  const { data: rules } = await admin.from("format_rules").select("*").eq("is_active", true);

  for (const job of jobs ?? []) {
    const finish = async (f: Finish) => {
      const { error: finishError } = await admin.rpc("finish_publish_job", {
        p_job_id: job.id,
        p_run_id: runId,
        p_outcome: f.outcome,
        p_external_post_id: f.postId ?? null,
        p_published_url: f.url ?? null,
        p_published_at: f.publishedAt ?? null,
        p_container_id: f.containerId ?? null,
        p_next_check_at: f.nextCheckAt ?? null,
        p_error: f.error ?? null,
      });
      if (finishError) throw new Error(finishError.message);
      if (f.outcome === "veroeffentlicht") summary.published++;
      else if (f.outcome === "wartet_auf_plattform") summary.processing++;
      else if (f.outcome === "fehlgeschlagen") summary.failed++;
      else if (f.outcome === "unklar") summary.unclear++;
      else summary.cancelled++;
      if (f.outcome === "fehlgeschlagen" || f.outcome === "unklar") {
        await notifyFailure(admin, job.id, f.error ?? "");
      }
    };

    const log = async (entry: {
      step: string; outcome: "erfolg" | "fehler" | "unklar" | "laufend"; httpStatus?: number | null;
      request?: Record<string, unknown>; response?: unknown; error?: string | null;
    }) => {
      await admin.rpc("record_publish_attempt", {
        p_job_id: job.id,
        p_run_id: runId,
        p_step: entry.step,
        p_outcome: entry.outcome,
        p_http_status: entry.httpStatus ?? null,
        p_request_summary: (entry.request ?? null) as never,
        p_response: (entry.response ?? null) as never,
        p_error: entry.error ?? null,
      });
    };

    // Erst ab dem Aufruf der Plattform ist unklar, ob etwas erschienen ist.
    let sending = false;
    try {
      // 1. Aktuellen Stand laden und Voraussetzungen erneut prüfen
      const { data: item } = await admin.from("content_items").select("*").eq("id", job.content_item_id).single();
      if (!item) {
        await finish({ outcome: "abgebrochen", error: "Inhalt nicht mehr vorhanden." });
        continue;
      }
      if (item.status === "veroeffentlicht") {
        await finish({ outcome: "abgebrochen", error: "Inhalt ist bereits als veröffentlicht erfasst." });
        continue;
      }
      if (!item.approvals_complete || item.schedule_status !== "verbindlich" || !item.auto_publish) {
        await finish({ outcome: "abgebrochen", error: "Freigaben, verbindliche Planung oder Aktivierung liegen nicht mehr vor." });
        continue;
      }
      if (job.content_version_id) {
        const { data: version } = await admin.from("content_versions").select("fingerprint").eq("id", job.content_version_id).single();
        if (version && version.fingerprint !== item.fingerprint) {
          await finish({ outcome: "abgebrochen", error: "Der Inhalt wurde nach der Planung geändert – die geplante Fassung entspricht nicht mehr der aktuellen." });
          continue;
        }
      }

      const adapter = adapterFor(item.channel);
      if (!adapter || !adapter.supportedFormats.includes(item.post_format ?? "")) {
        await finish({ outcome: "fehlgeschlagen", error: "Dieses Format wird per API nicht unterstützt – bitte manuell veröffentlichen." });
        continue;
      }

      const { data: account } = await admin.from("platform_accounts").select("*").eq("id", item.platform_account_id ?? "").maybeSingle();
      if (!account || !account.api_enabled || account.connection_status !== "verbunden" || !account.external_id) {
        await finish({ outcome: "fehlgeschlagen", error: "Zielkonto ist nicht verbunden oder die API-Veröffentlichung ist nicht aktiviert." });
        continue;
      }
      const { data: cred } = await admin.from("platform_credentials").select("*").eq("account_id", account.id).maybeSingle();
      if (!cred) {
        await finish({ outcome: "fehlgeschlagen", error: "Für das Zielkonto sind keine Zugangsdaten hinterlegt." });
        continue;
      }
      if (cred.expires_at && new Date(cred.expires_at).getTime() < Date.now()) {
        await admin.from("platform_accounts").update({ connection_status: "abgelaufen" }).eq("id", account.id);
        await finish({ outcome: "fehlgeschlagen", error: "Die Autorisierung des Zielkontos ist abgelaufen – bitte neu verbinden." });
        continue;
      }

      // 2. Medien laden und prüfen
      const { data: links } = await admin
        .from("content_media")
        .select("position, media_assets(*)")
        .eq("content_item_id", item.id)
        .order("position");
      const assets = (links ?? []).map((l) => l.media_assets).filter((m): m is NonNullable<typeof m> => Boolean(m));
      const issues = validateContent(item, assets, (rules ?? []) as FormatRule[]);
      if (hasBlockingIssues(issues)) {
        await finish({ outcome: "fehlgeschlagen", error: `Vor dem Versand geprüft: ${issues.filter((i) => i.level === "error").map((i) => i.message).join(" ")}` });
        continue;
      }
      const visual = assets.filter((m) => m.kind === "bild" || m.kind === "video");
      if (visual.some((m) => m.source !== "upload" || !m.storage_path)) {
        await finish({ outcome: "fehlgeschlagen", error: "Für die API-Veröffentlichung müssen Medien im Speicher hochgeladen sein – Drive-Links sind keine direkt abrufbaren Dateien." });
        continue;
      }
      const media: PublishMedia[] = [];
      for (const m of visual) {
        const { data: signed, error: signError } = await admin.storage.from("media").createSignedUrl(m.storage_path!, 60 * 60);
        if (signError || !signed) throw new Error(`Signierte URL fehlgeschlagen: ${signError?.message}`);
        media.push({ kind: m.kind as "bild" | "video", url: signed.signedUrl, mimeType: m.mime_type, altText: m.alt_text, width: m.width, height: m.height });
      }

      // 3. Veröffentlichen
      const accessToken = decryptSecret(cred.access_token_enc);
      sending = true;
      const outcome: PublishOutcome = await adapter.publish(
        {
          jobId: job.id,
          containerId: job.external_container_id,
          attempt: job.attempt_count,
          account: { externalId: account.external_id, displayName: account.display_name },
          accessToken,
          content: {
            title: item.title,
            text: composeSocialText(item),
            linkUrl: item.link_url,
            postFormat: item.post_format ?? "",
            teaser: item.teaser,
          },
          media,
        },
        log,
      );

      if (outcome.status === "published") {
        await finish({ outcome: "veroeffentlicht", postId: outcome.postId, url: outcome.url, publishedAt: outcome.publishedAt ?? null });
      } else if (outcome.status === "processing") {
        await finish({
          outcome: "wartet_auf_plattform",
          containerId: outcome.containerId,
          nextCheckAt: new Date(Date.now() + outcome.nextCheckSeconds * 1000).toISOString(),
        });
      } else if (outcome.status === "failed") {
        await finish({ outcome: "fehlgeschlagen", error: outcome.error });
      } else {
        await finish({ outcome: "unklar", error: outcome.error });
      }
    } catch (err) {
      const message = (err as Error).message;
      if (!sending) {
        // Fehler vor dem Versand (z. B. signierte URL, Entschlüsselung): sicher nichts veröffentlicht
        await log({ step: "vorbereitung", outcome: "fehler", error: message }).catch(() => undefined);
        await finish({ outcome: "fehlgeschlagen", error: `Vor dem Versand fehlgeschlagen: ${message}` }).catch(() => undefined);
      } else {
        // Fehler während des Versands: Ergebnis nicht sicher bekannt → nie automatisch wiederholen
        await log({ step: "ausnahme", outcome: "unklar", error: message }).catch(() => undefined);
        await finish({ outcome: "unklar", error: `Unerwarteter Fehler: ${message}` }).catch(() => undefined);
      }
    }
  }
  return summary;
}

async function notifyFailure(admin: AdminSupabase, jobId: string, error: string) {
  const { data: job } = await admin
    .from("publish_jobs")
    .select("id, channel, dossier_id, content_items(title, assignee_id), dossiers(owner_id)")
    .eq("id", jobId)
    .single();
  if (!job) return;
  const recipientId = job.content_items?.assignee_id ?? job.dossiers?.owner_id;
  if (!recipientId) return;
  const { data: profile } = await admin.from("profiles").select("email, full_name").eq("id", recipientId).single();
  if (!profile?.email) return;
  await sendTemplatedEmail({
    templateKey: "team_veroeffentlichung_fehlgeschlagen",
    to: profile.email,
    toName: profile.full_name,
    vars: {
      empfaenger_name: profile.full_name || profile.email,
      beitrag_titel: job.content_items?.title ?? "",
      kanal: CHANNEL_LABELS[job.channel] ?? job.channel,
      text: error.slice(0, 500),
      link: `${publicEnv.appUrl}/veroeffentlichungen?auftrag=${job.id}`,
    },
    related: { dossier_id: job.dossier_id },
    triggeredBy: "system",
    idempotencyKey: `publish-fail:${job.id}:${error.slice(0, 40)}`,
  });
}
