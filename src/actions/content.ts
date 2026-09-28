"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertApprover, assertProfile } from "@/lib/auth";
import { check, runAction, type ActionResult } from "@/lib/action-result";
import { CHANNEL_LABELS } from "@/lib/labels";
import { htmlToPlainText, sanitizeArticleHtml } from "@/lib/sanitize";
import { createClient } from "@/lib/supabase/server";
import { berlinLocalToIso } from "@/lib/time";
import { formToObject, optionalDate, optionalText, optionalUrl, optionalUuid, parseHashtags, requiredText, uuid } from "@/lib/validation";

const refresh = () => revalidatePath("/", "layout");

const CHANNELS = ["magazin", "instagram", "facebook", "linkedin"] as const;
const FORMATS = ["artikel", "feed_bild", "karussell", "reel", "story", "video", "text", "link"] as const;

// -----------------------------------------------------------------------------
// Anlegen
// -----------------------------------------------------------------------------
const createSchema = z.object({
  dossier_id: uuid,
  channel: z.enum(CHANNELS),
  title: requiredText("Titel", 200),
  post_format: z.enum(FORMATS).optional(),
  parent_id: optionalUuid,
});

async function nextSocialDeliverable(supabase: Awaited<ReturnType<typeof createClient>>, dossierId: string): Promise<string | null> {
  const { data: dossier } = await supabase.from("dossiers").select("deliverable_id").eq("id", dossierId).single();
  if (!dossier?.deliverable_id) return null;
  const { data: children } = await supabase
    .from("deliverables")
    .select("id, unit_no, content_items(id)")
    .eq("parent_deliverable_id", dossier.deliverable_id)
    .in("status", ["offen", "in_arbeit"])
    .order("unit_no");
  return children?.find((c) => (c.content_items ?? []).length === 0)?.id ?? null;
}

const VISUAL_FORMATS = new Set(["feed_bild", "karussell", "reel", "story", "video"]);

/** Schritt 7 des Ablaufs: Grafikaufgabe für Formate mit Bild/Video (einmalig je Inhalt). */
async function ensureGraphicTask(
  supabase: Awaited<ReturnType<typeof createClient>>,
  item: { id: string; dossier_id: string; title: string; post_format: string; assignee_id: string | null },
) {
  if (!VISUAL_FORMATS.has(item.post_format)) return;
  await supabase.from("tasks").upsert(
    {
      auto_key: `grafik:${item.id}`,
      title: `Grafik erstellen und hinterlegen: ${item.title}`,
      task_type: "grafik",
      assignee_id: item.assignee_id,
      dossier_id: item.dossier_id,
      content_item_id: item.id,
      origin: "ablauf",
      description: "Grafik extern erstellen, dann in der Fassung hochladen oder als Drive-Link hinterlegen und als final kennzeichnen.",
    },
    { onConflict: "auto_key", ignoreDuplicates: true },
  );
}

export async function createContent(_: ActionResult<{ id: string }> | null, formData: FormData): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const profile = await assertProfile();
    const d = createSchema.parse(formToObject(formData));
    const supabase = await createClient();
    const isArticle = d.channel === "magazin";

    let deliverableId: string | null = null;
    let caption: string | null = null;
    let linkUrl: string | null = null;
    if (isArticle) {
      const { data: dossier } = await supabase.from("dossiers").select("deliverable_id").eq("id", d.dossier_id).single();
      const { data: articleWithDeliverable } = await supabase
        .from("content_items").select("id").eq("dossier_id", d.dossier_id).eq("kind", "magazinartikel").not("deliverable_id", "is", null).maybeSingle();
      deliverableId = articleWithDeliverable ? null : dossier?.deliverable_id ?? null;
    } else {
      deliverableId = await nextSocialDeliverable(supabase, d.dossier_id);
      if (d.parent_id) {
        const { data: parent } = await supabase.from("content_items").select("teaser, published_url, title").eq("id", d.parent_id).single();
        caption = parent?.teaser ?? null;
        linkUrl = parent?.published_url ?? null;
      }
    }

    const { data: account } = isArticle
      ? { data: null }
      : await supabase.from("platform_accounts").select("id").eq("platform", d.channel).order("is_default", { ascending: false }).limit(1).maybeSingle();

    const created = check(
      await supabase
        .from("content_items")
        .insert({
          dossier_id: d.dossier_id,
          kind: isArticle ? "magazinartikel" : "social",
          channel: d.channel,
          title: d.title,
          post_format: isArticle ? "artikel" : d.post_format ?? (d.channel === "linkedin" ? "text" : "feed_bild"),
          parent_id: isArticle ? null : d.parent_id,
          deliverable_id: deliverableId,
          caption,
          link_url: linkUrl,
          assignee_id: profile.id,
          platform_account_id: account?.id ?? null,
        })
        .select("id, dossier_id, title, post_format, assignee_id")
        .single(),
    );
    await ensureGraphicTask(supabase, { ...created, post_format: created.post_format ?? "" });
    refresh();
    return { id: created.id };
  }, "Inhalt angelegt.");
}

/** Social-Fassungen je Kanal aus einem Artikel ableiten (jede Fassung unabhängig). */
export async function deriveSocialVariants(articleId: string, channels: string[]): Promise<ActionResult<{ created: number }>> {
  return runAction(async () => {
    await assertProfile();
    const list = z.array(z.enum(["instagram", "facebook", "linkedin"])).min(1, "Bitte mindestens einen Kanal wählen.").parse(channels);
    const supabase = await createClient();
    const article = check(
      await supabase.from("content_items").select("id, dossier_id, title, teaser, body_html, published_url, assignee_id").eq("id", uuid.parse(articleId)).single(),
    );
    const { data: existing } = await supabase.from("content_items").select("channel").eq("parent_id", article.id);
    const accounts = check(await supabase.from("platform_accounts").select("id, platform, is_default"));
    let created = 0;
    for (const channel of list) {
      if ((existing ?? []).some((e) => e.channel === channel)) continue;
      const acc = accounts.find((a) => a.platform === channel && a.is_default) ?? accounts.find((a) => a.platform === channel);
      const teaser = article.teaser ?? htmlToPlainText(article.body_html).slice(0, 280);
      const variant = check(
        await supabase
          .from("content_items")
          .insert({
            dossier_id: article.dossier_id,
            kind: "social",
            channel,
            parent_id: article.id,
            deliverable_id: await nextSocialDeliverable(supabase, article.dossier_id),
            title: `${CHANNEL_LABELS[channel]}: ${article.title}`,
            caption: teaser || null,
            link_url: article.published_url,
            post_format: channel === "linkedin" ? "link" : "feed_bild",
            assignee_id: article.assignee_id,
            platform_account_id: acc?.id ?? null,
          })
          .select("id, dossier_id, title, post_format, assignee_id")
          .single(),
      );
      await ensureGraphicTask(supabase, { ...variant, post_format: variant.post_format ?? "" });
      created++;
    }
    refresh();
    return { created };
  }, "Social-Fassungen angelegt.");
}

// -----------------------------------------------------------------------------
// Bearbeiten
// -----------------------------------------------------------------------------
const articleSchema = z.object({
  id: uuid,
  title: requiredText("Titel", 250),
  teaser: optionalText(1000),
  body_html: z.string().max(400_000).optional(),
  seo_title: optionalText(120),
  meta_description: optionalText(320),
  author_name: optionalText(200),
  assignee_id: optionalUuid,
  window_start: optionalDate,
  window_end: optionalDate,
  notes: optionalText(10000),
});

export async function saveArticle(_: ActionResult<null> | null, formData: FormData): Promise<ActionResult<null>> {
  return runAction(async () => {
    await assertProfile();
    const { id, body_html, ...d } = articleSchema.parse(formToObject(formData));
    const supabase = await createClient();
    check(await supabase.from("content_items").update({ ...d, body_html: sanitizeArticleHtml(body_html) }).eq("id", id));
    refresh();
    return null;
  }, "Artikel gespeichert.");
}

const socialSchema = z.object({
  id: uuid,
  title: requiredText("Titel", 250),
  caption: optionalText(5000),
  cta: optionalText(300),
  hashtags: z.string().optional(),
  link_url: optionalUrl,
  post_format: z.enum(FORMATS),
  platform_account_id: optionalUuid,
  assignee_id: optionalUuid,
  window_start: optionalDate,
  window_end: optionalDate,
  notes: optionalText(10000),
});

export async function saveSocial(_: ActionResult<null> | null, formData: FormData): Promise<ActionResult<null>> {
  return runAction(async () => {
    await assertProfile();
    const { id, hashtags, ...d } = socialSchema.parse(formToObject(formData));
    const supabase = await createClient();
    // Nur diese Fassung wird geändert – andere Kanäle bleiben unberührt.
    check(await supabase.from("content_items").update({ ...d, hashtags: parseHashtags(hashtags) }).eq("id", id).eq("kind", "social"));
    refresh();
    return null;
  }, "Fassung gespeichert.");
}

export async function archiveContent(id: string): Promise<ActionResult<null>> {
  return runAction(async () => {
    await assertProfile();
    const supabase = await createClient();
    check(await supabase.from("content_items").update({ status: "archiviert", schedule_status: "ohne_termin", auto_publish: false }).eq("id", uuid.parse(id)).neq("status", "veroeffentlicht"));
    refresh();
    return null;
  }, "Inhalt archiviert.");
}

export async function deleteContent(id: string): Promise<ActionResult<null>> {
  return runAction(async () => {
    await assertProfile();
    const supabase = await createClient();
    const { data, error } = await supabase.from("content_items").delete().eq("id", uuid.parse(id)).select("id");
    if (error) throw error;
    if (!data?.length) throw new Error("Nur Entwürfe ohne Veröffentlichung können gelöscht werden (Admins ausgenommen).");
    refresh();
    return null;
  }, "Inhalt gelöscht.");
}

// -----------------------------------------------------------------------------
// Versionen & interne Prüfung
// -----------------------------------------------------------------------------
export async function saveVersion(id: string): Promise<ActionResult<null>> {
  return runAction(async () => {
    await assertProfile();
    const supabase = await createClient();
    check(await supabase.rpc("create_content_version", { p_content_id: uuid.parse(id), p_reason: "manuell" }));
    refresh();
    return null;
  }, "Version gespeichert.");
}

export async function requestReview(id: string, note?: string): Promise<ActionResult<null>> {
  return runAction(async () => {
    await assertProfile();
    const supabase = await createClient();
    check(await supabase.rpc("request_internal_review", { p_content_id: uuid.parse(id), p_note: note?.trim() || null }));
    refresh();
    return null;
  }, "Zur internen Prüfung gegeben.");
}

export async function decideReview(_: ActionResult<null> | null, formData: FormData): Promise<ActionResult<null>> {
  return runAction(async () => {
    await assertApprover();
    const d = z
      .object({ id: uuid, decision: z.enum(["freigegeben", "aenderung_gewuenscht"]), comment: optionalText(4000) })
      .parse(formToObject(formData));
    const supabase = await createClient();
    check(await supabase.rpc("decide_internal_review", { p_content_id: d.id, p_decision: d.decision, p_comment: d.comment }));
    refresh();
    return null;
  }, "Entscheidung gespeichert.");
}

// -----------------------------------------------------------------------------
// Planung
// -----------------------------------------------------------------------------
const scheduleSchema = z
  .object({
    id: uuid,
    mode: z.enum(["ohne_termin", "vorlaeufig", "verbindlich"]),
    scheduled_local: z.string().optional(),
    auto_publish: z.string().optional().transform((v) => v === "on"),
    platform_account_id: optionalUuid,
    window_start: optionalDate,
    window_end: optionalDate,
  })
  .refine((d) => d.mode === "ohne_termin" || d.scheduled_local, { message: "Bitte Datum und Uhrzeit angeben.", path: ["scheduled_local"] });

export async function scheduleContent(_: ActionResult<{ method?: string; reason?: string | null }> | null, formData: FormData): Promise<ActionResult<{ method?: string; reason?: string | null }>> {
  return runAction(async () => {
    await assertProfile();
    const d = scheduleSchema.parse(formToObject(formData));
    const supabase = await createClient();
    const res = check(
      await supabase.rpc("schedule_content", {
        p_content_id: d.id,
        p_mode: d.mode,
        p_scheduled_at: d.mode === "ohne_termin" ? null : berlinLocalToIso(d.scheduled_local!),
        p_auto_publish: d.auto_publish,
        p_platform_account_id: d.platform_account_id,
        p_window_start: d.window_start,
        p_window_end: d.window_end,
      }),
    ) as { method?: string; manual_reason?: string | null };
    refresh();
    return { method: res.method, reason: res.manual_reason };
  }, "Planung gespeichert.");
}

/** Kalender: Termin verschieben (behält Planungsstatus; verbindliche Termine nur für Freigabe/Leitung). */
export async function moveContent(id: string, scheduledLocal: string): Promise<ActionResult<null>> {
  return runAction(async () => {
    await assertProfile();
    const supabase = await createClient();
    const item = check(await supabase.from("content_items").select("schedule_status, auto_publish, platform_account_id").eq("id", uuid.parse(id)).single());
    check(
      await supabase.rpc("schedule_content", {
        p_content_id: id,
        p_mode: item.schedule_status === "ohne_termin" ? "vorlaeufig" : item.schedule_status,
        p_scheduled_at: berlinLocalToIso(scheduledLocal),
        p_auto_publish: item.auto_publish,
        p_platform_account_id: item.platform_account_id,
      }),
    );
    refresh();
    return null;
  }, "Termin verschoben.");
}

// -----------------------------------------------------------------------------
// Medienzuordnung
// -----------------------------------------------------------------------------
export async function attachMedia(contentId: string, mediaId: string, role: "medium" | "titelbild" | "cover" = "medium"): Promise<ActionResult<null>> {
  return runAction(async () => {
    await assertProfile();
    const supabase = await createClient();
    const { data: existing } = await supabase.from("content_media").select("position").eq("content_item_id", uuid.parse(contentId)).order("position", { ascending: false }).limit(1);
    check(
      await supabase.from("content_media").insert({
        content_item_id: contentId, media_asset_id: uuid.parse(mediaId), role, position: (existing?.[0]?.position ?? -1) + 1,
      }),
    );
    refresh();
    return null;
  }, "Medium zugeordnet.");
}

export async function detachMedia(contentId: string, mediaId: string): Promise<ActionResult<null>> {
  return runAction(async () => {
    await assertProfile();
    const supabase = await createClient();
    check(await supabase.from("content_media").delete().eq("content_item_id", uuid.parse(contentId)).eq("media_asset_id", uuid.parse(mediaId)));
    refresh();
    return null;
  }, "Zuordnung entfernt.");
}

export async function moveMedia(contentId: string, mediaId: string, direction: -1 | 1): Promise<ActionResult<null>> {
  return runAction(async () => {
    await assertProfile();
    const supabase = await createClient();
    const links = check(await supabase.from("content_media").select("id, media_asset_id, position").eq("content_item_id", uuid.parse(contentId)).order("position"));
    const index = links.findIndex((l) => l.media_asset_id === mediaId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= links.length) return null;
    const reordered = [...links];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    for (const [i, l] of reordered.entries()) {
      if (l.position !== i) check(await supabase.from("content_media").update({ position: i }).eq("id", l.id));
    }
    refresh();
    return null;
  });
}

// -----------------------------------------------------------------------------
// Kennzahlen (nur echte oder ausdrücklich manuell eingetragene Werte)
// -----------------------------------------------------------------------------
const metricNumber = z
  .string()
  .optional()
  .transform((v) => (v ? Number(v.replace(/\./g, "")) : null))
  .refine((v) => v === null || (Number.isInteger(v) && v >= 0), "Bitte eine ganze Zahl ≥ 0 eingeben.");

export async function saveMetrics(_: ActionResult<null> | null, formData: FormData): Promise<ActionResult<null>> {
  return runAction(async () => {
    await assertProfile();
    const d = z.object({ id: uuid, reach: metricNumber, impressions: metricNumber, clicks: metricNumber, note: optionalText(500) }).parse(formToObject(formData));
    const supabase = await createClient();
    check(await supabase.rpc("record_content_metrics", { p_content_id: d.id, p_reach: d.reach, p_impressions: d.impressions, p_clicks: d.clicks, p_note: d.note }));
    refresh();
    return null;
  }, "Kennzahlen gespeichert (Herkunft: manuell).");
}
