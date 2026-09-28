"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertEditor, assertProfile } from "@/lib/auth";
import { check, runAction, type ActionResult } from "@/lib/action-result";
import { ownPostSchema, type OwnPostInput } from "@/lib/schemas";
import { createClient } from "@/lib/supabase/server";
import { berlinLocalToIso, berlinToday, addDays } from "@/lib/time";
import { CHANNEL_LABELS } from "@/lib/labels";
import { formToObject, optionalDate, optionalText, optionalUuid, requiredText, uuid } from "@/lib/validation";

const refresh = () => revalidatePath("/", "layout");

/** Schritt 1: Aus einer gebuchten Leistung eine Beitragsakte anlegen. */
export async function createDossierFromDeliverable(deliverableId: string): Promise<ActionResult<{ dossierId: string }>> {
  return runAction(async () => {
    const profile = await assertEditor();
    const supabase = await createClient();
    const d = check(
      await supabase
        .from("deliverables")
        .select("id, client_id, contract_id, title, unit_no, unit_count, content_kind, owner_id, due_date, clients(name, contacts(id, is_primary))")
        .eq("id", uuid.parse(deliverableId))
        .single(),
    );
    const findExisting = async () => (await supabase.from("dossiers").select("id").eq("deliverable_id", d.id).maybeSingle()).data;
    const existing = await findExisting();
    if (existing) return { dossierId: existing.id };

    const contact = d.clients?.contacts?.find((c) => c.is_primary) ?? d.clients?.contacts?.[0];
    const unit = d.unit_count && d.unit_count > 1 ? ` ${d.unit_no}/${d.unit_count}` : "";
    const inserted = await supabase
      .from("dossiers")
      .insert({
        title: `${d.clients?.name ?? "Kunde"} – ${d.title}${unit}`,
        kind: "kunde",
        client_id: d.client_id,
        contract_id: d.contract_id,
        deliverable_id: d.id,
        contact_id: contact?.id ?? null,
        owner_id: d.owner_id ?? profile.id,
        period_end: d.due_date,
      })
      .select("id, title")
      .single();
    if (inserted.error?.code === "23505") {
      // Gleichzeitig angelegt (Doppelklick) – je Leistung gibt es nur eine Akte
      const winner = await findExisting();
      if (winner) return { dossierId: winner.id };
    }
    const dossier = check(inserted);

    if (d.content_kind === "magazinartikel") {
      check(
        await supabase.from("content_items").insert({
          dossier_id: dossier.id, kind: "magazinartikel", channel: "magazin", deliverable_id: d.id,
          title: dossier.title, assignee_id: d.owner_id ?? profile.id,
        }),
      );
    }
    check(
      await supabase.from("tasks").insert({
        title: `Thema festlegen & Kundenmaterial anfordern: ${dossier.title}`,
        task_type: "material_anfordern",
        assignee_id: d.owner_id ?? profile.id,
        due_date: addDays(berlinToday(), 3),
        dossier_id: dossier.id,
        origin: "ablauf",
      }),
    );
    refresh();
    return { dossierId: dossier.id };
  }, "Beitragsakte angelegt.");
}

const dossierSchema = z.object({
  id: optionalUuid,
  title: requiredText("Titel", 200),
  kind: z.enum(["kunde", "eigen"]),
  client_id: optionalUuid,
  contract_id: optionalUuid,
  deliverable_id: optionalUuid,
  campaign_id: optionalUuid,
  contact_id: optionalUuid,
  own_category: z.string().optional().transform((v) => (v ? v : null)),
  topic: optionalText(300),
  goal: optionalText(2000),
  target_audience: optionalText(1000),
  key_message: optionalText(2000),
  owner_id: optionalUuid,
  period_start: optionalDate,
  period_end: optionalDate,
  status: z.enum(["aktiv", "pausiert", "abgeschlossen", "abgebrochen"]).default("aktiv"),
  notes: optionalText(10000),
})
  .refine((d) => d.kind === "eigen" || d.client_id, { message: "Bitte einen Kunden wählen.", path: ["client_id"] })
  .refine((d) => !d.period_start || !d.period_end || d.period_end >= d.period_start, { message: "Das Ende liegt vor dem Beginn.", path: ["period_end"] });

export async function saveDossier(_: ActionResult<{ id: string }> | null, formData: FormData): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    await assertProfile();
    const { id, ...d } = dossierSchema.parse(formToObject(formData));
    const supabase = await createClient();
    const values = { ...d, own_category: d.kind === "eigen" ? (d.own_category as "summit" | null) ?? "sonstiges" : null };
    if (id) {
      // Art, Kunde, Vertrag und Leistung stehen nach dem Anlegen fest (Leistungsnachweis, Zugriffsrechte)
      const editable: Partial<typeof values> = { ...values };
      for (const key of ["kind", "client_id", "contract_id", "deliverable_id"] as const) delete editable[key];
      check(await supabase.from("dossiers").update(editable).eq("id", id));
      refresh();
      return { id };
    }
    await assertEditor();
    const created = check(await supabase.from("dossiers").insert(values).select("id").single());
    refresh();
    return { id: created.id };
  }, "Beitragsakte gespeichert.");
}

export async function deleteDossier(id: string): Promise<ActionResult<null>> {
  return runAction(async () => {
    await assertEditor();
    const supabase = await createClient();
    const { count } = await supabase.from("content_items").select("id", { count: "exact", head: true }).eq("dossier_id", id).eq("status", "veroeffentlicht");
    if (count) throw new Error("Die Akte enthält veröffentlichte Inhalte und dient als Nachweis. Bitte stattdessen abschließen.");
    check(await supabase.from("dossiers").delete().eq("id", uuid.parse(id)));
    refresh();
    return null;
  }, "Beitragsakte gelöscht.");
}

export async function addNote(_: ActionResult<null> | null, formData: FormData): Promise<ActionResult<null>> {
  return runAction(async () => {
    await assertProfile();
    const d = z.object({ dossier_id: optionalUuid, client_id: optionalUuid, text: requiredText("Notiz", 4000) }).parse(formToObject(formData));
    const supabase = await createClient();
    check(await supabase.rpc("add_note", { p_dossier_id: d.dossier_id, p_client_id: d.client_id, p_text: d.text }));
    refresh();
    return null;
  }, "Notiz gespeichert.");
}

/**
 * Schnellweg: Eigenen Beitrag anlegen → Aufgabe zuweisen → terminieren.
 * Legt Akte, je Kanal einen Inhalt, optional eine Aufgabe und einen
 * vorläufigen Termin an. Verbindlich wird der Termin erst nach Freigabe.
 */
export async function createOwnPost(input: OwnPostInput): Promise<ActionResult<{ dossierId: string }>> {
  return runAction(async () => {
    const profile = await assertEditor();
    const d = ownPostSchema.parse(input);
    const supabase = await createClient();
    const scheduledAt = d.scheduled_local ? berlinLocalToIso(d.scheduled_local) : null;

    const dossier = check(
      await supabase
        .from("dossiers")
        .insert({
          title: d.title, kind: "eigen", own_category: d.own_category, campaign_id: d.campaign_id, idea_id: d.idea_id,
          topic: d.topic, goal: d.goal, owner_id: d.owner_id ?? profile.id,
          period_start: d.scheduled_local ? d.scheduled_local.slice(0, 10) : null,
        })
        .select("id")
        .single(),
    );

    const articleChannel = d.channels.includes("magazin");
    let articleId: string | null = null;
    if (articleChannel) {
      const a = check(
        await supabase
          .from("content_items")
          .insert({ dossier_id: dossier.id, kind: "magazinartikel", channel: "magazin", title: d.title, assignee_id: d.task_assignee_id ?? d.owner_id ?? profile.id })
          .select("id")
          .single(),
      );
      articleId = a.id;
    }
    const accounts = check(await supabase.from("platform_accounts").select("id, platform, is_default"));
    for (const channel of d.channels.filter((c) => c !== "magazin")) {
      const acc = accounts.find((a) => a.platform === channel && a.is_default) ?? accounts.find((a) => a.platform === channel);
      check(
        await supabase.from("content_items").insert({
          dossier_id: dossier.id, kind: "social", channel, parent_id: articleId,
          title: `${CHANNEL_LABELS[channel]}: ${d.title}`,
          post_format: channel === "linkedin" ? "text" : "feed_bild",
          assignee_id: d.task_assignee_id ?? d.owner_id ?? profile.id,
          platform_account_id: acc?.id ?? null,
          schedule_status: scheduledAt ? "vorlaeufig" : "ohne_termin",
          scheduled_at: scheduledAt,
        }),
      );
    }
    if (articleId && scheduledAt) {
      check(await supabase.from("content_items").update({ schedule_status: "vorlaeufig", scheduled_at: scheduledAt }).eq("id", articleId));
    }
    if (d.task_title) {
      check(
        await supabase.from("tasks").insert({
          title: d.task_title, task_type: "entwurf", assignee_id: d.task_assignee_id, dossier_id: dossier.id,
          due_date: d.task_due_date, origin: "manuell", priority: "normal",
        }),
      );
    }
    if (d.idea_id) {
      const idea = await supabase.from("ideas").select("is_reusable, use_count").eq("id", d.idea_id).single();
      if (idea.data) {
        await supabase.from("ideas").update({
          use_count: idea.data.use_count + 1,
          status: idea.data.is_reusable ? "vorgemerkt" : "umgesetzt",
        }).eq("id", d.idea_id);
      }
    }
    refresh();
    return { dossierId: dossier.id };
  }, "Eigener Beitrag angelegt.");
}
