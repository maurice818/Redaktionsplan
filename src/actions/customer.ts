"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertEditor } from "@/lib/auth";
import { check, runAction, type ActionResult } from "@/lib/action-result";
import { getSettings, settingNumber } from "@/lib/data/lookups";
import { renderEmail } from "@/lib/email/render";
import { sendTemplatedEmail } from "@/lib/email/send";
import { publicEnv } from "@/lib/env";
import { CHANNEL_LABELS, CONTENT_KIND_LABELS } from "@/lib/labels";
import { decryptSecret, encryptOptional, generateAccessToken } from "@/lib/security/crypto";
import { createClient } from "@/lib/supabase/server";
import { addDays, berlinToday, formatDate, formatDateTime } from "@/lib/time";
import { formToObject, optionalDate, optionalText, optionalUuid, uuid } from "@/lib/validation";

const refresh = () => revalidatePath("/", "layout");

export interface LinkResult {
  link: string;
  email: string;
  emailError?: string;
}

const recipientSchema = {
  contact_id: optionalUuid,
  recipient_name: optionalText(200),
  recipient_email: z.string().trim().toLowerCase().email("Bitte eine gültige E-Mail-Adresse angeben."),
  message: optionalText(4000),
  send_email: z.string().optional().transform((v) => v === "on"),
  subject: optionalText(300),
  body: optionalText(10000),
};

// -----------------------------------------------------------------------------
// Materialformular
// -----------------------------------------------------------------------------
const materialSchema = z.object({
  dossier_id: uuid,
  form_id: uuid,
  due_date: optionalDate,
  expiry_days: z.coerce.number().int().min(1).max(120),
  ...recipientSchema,
});

export async function sendMaterialRequest(_: ActionResult<LinkResult> | null, formData: FormData): Promise<ActionResult<LinkResult>> {
  return runAction(async () => {
    const profile = await assertEditor();
    const d = materialSchema.parse(formToObject(formData));
    const supabase = await createClient();
    const dossier = check(await supabase.from("dossiers").select("id, title, client_id, clients(name)").eq("id", d.dossier_id).single());
    const form = check(await supabase.from("material_forms").select("id, name, intro_text, fields").eq("id", d.form_id).single());

    const { token, hash } = generateAccessToken();
    const expiresAt = new Date(Date.now() + d.expiry_days * 86_400_000).toISOString();
    const request = check(
      await supabase
        .from("material_requests")
        .insert({
          dossier_id: d.dossier_id,
          client_id: dossier.client_id,
          contact_id: d.contact_id,
          form_id: form.id,
          form_snapshot: { name: form.name, intro_text: form.intro_text, fields: form.fields },
          recipient_name: d.recipient_name,
          recipient_email: d.recipient_email,
          message: d.message,
          token_hash: hash,
          token_encrypted: encryptOptional(token),
          expires_at: expiresAt,
          due_date: d.due_date,
        })
        .select("id")
        .single(),
    );
    const link = `${publicEnv.appUrl}/m/${token}`;

    // Wartet-auf-Kunde-Aufgabe
    await supabase.from("tasks").insert({
      title: `Material vom Kunden abwarten: ${dossier.title}`,
      task_type: "material_anfordern",
      status: "wartet_auf_kunde",
      assignee_id: profile.id,
      due_date: d.due_date,
      dossier_id: d.dossier_id,
      origin: "ablauf",
      auto_key: `material_warten:${request.id}`,
    });
    await supabase.from("tasks").update({ status: "erledigt" })
      .eq("dossier_id", d.dossier_id).eq("task_type", "material_anfordern").in("status", ["offen", "in_arbeit"]);

    let emailStatus = "nicht_versendet";
    let emailError: string | undefined;
    if (d.send_email) {
      const res = await sendTemplatedEmail({
        templateKey: "material_anfrage",
        to: d.recipient_email,
        toName: d.recipient_name,
        vars: {
          empfaenger_name: d.recipient_name || "Damen und Herren",
          beitrag_titel: dossier.title,
          kunde_name: dossier.clients?.name ?? "",
          nachricht: d.message ?? "",
          link,
          gueltig_bis: formatDateTime(expiresAt),
          frist_hinweis: d.due_date ? ` Bitte füllen Sie das Formular bis zum ${formatDate(d.due_date)} aus.` : "",
          absender_name: profile.full_name || "Ihr MEET GERMANY Team",
        },
        override: d.subject || d.body ? { subject: d.subject ?? undefined, body: d.body ?? undefined } : undefined,
        related: { dossier_id: d.dossier_id, client_id: dossier.client_id, material_request_id: request.id },
        triggeredBy: "manuell",
        idempotencyKey: `material:${request.id}`,
        createdBy: profile.id,
      });
      emailStatus = res.status;
      emailError = res.error;
      if (res.status === "versendet") {
        await supabase.from("material_requests").update({ status: "versendet", sent_at: new Date().toISOString() }).eq("id", request.id);
      }
    }
    refresh();
    return { link, email: emailStatus, emailError };
  });
}

export async function markMaterialSent(id: string): Promise<ActionResult<null>> {
  return runAction(async () => {
    await assertEditor();
    const supabase = await createClient();
    check(await supabase.from("material_requests").update({ status: "versendet", sent_at: new Date().toISOString() }).eq("id", uuid.parse(id)).in("status", ["erstellt"]));
    refresh();
    return null;
  }, "Als versendet markiert (z. B. Link persönlich weitergegeben).");
}

export async function getMaterialLink(id: string): Promise<ActionResult<{ link: string }>> {
  return runAction(async () => {
    await assertEditor();
    const supabase = await createClient();
    const r = check(await supabase.from("material_requests").select("token_encrypted").eq("id", uuid.parse(id)).single());
    if (!r.token_encrypted) throw new Error("Der Link wurde nicht gespeichert (APP_ENCRYPTION_KEY fehlte beim Erstellen). Bitte eine neue Anfrage senden.");
    return { link: `${publicEnv.appUrl}/m/${decryptSecret(r.token_encrypted)}` };
  });
}

export async function resendMaterialRequest(id: string): Promise<ActionResult<null>> {
  return runAction(async () => {
    const profile = await assertEditor();
    const supabase = await createClient();
    const r = check(
      await supabase
        .from("material_requests")
        .select("id, dossier_id, client_id, recipient_name, recipient_email, message, token_encrypted, expires_at, due_date, revoked_at, dossiers(title), clients(name)")
        .eq("id", uuid.parse(id))
        .single(),
    );
    if (r.revoked_at) throw new Error("Der Link wurde widerrufen.");
    if (!r.token_encrypted || !r.recipient_email) throw new Error("Link oder Empfänger nicht gespeichert – bitte eine neue Anfrage senden.");
    const res = await sendTemplatedEmail({
      templateKey: "material_erinnerung",
      to: r.recipient_email,
      toName: r.recipient_name,
      vars: {
        empfaenger_name: r.recipient_name || "Damen und Herren",
        beitrag_titel: r.dossiers?.title ?? "",
        kunde_name: r.clients?.name ?? "",
        link: `${publicEnv.appUrl}/m/${decryptSecret(r.token_encrypted)}`,
        gueltig_bis: formatDateTime(r.expires_at),
      },
      related: { dossier_id: r.dossier_id, client_id: r.client_id, material_request_id: r.id },
      triggeredBy: "manuell",
      idempotencyKey: `material-resend:${r.id}:${Date.now()}`,
      createdBy: profile.id,
    });
    if (res.status !== "versendet") throw new Error(res.error ?? "E-Mail wurde nicht versendet.");
    await supabase.from("material_requests").update({ sent_at: new Date().toISOString(), status: "versendet" }).eq("id", r.id).in("status", ["erstellt"]);
    refresh();
    return null;
  }, "Erinnerung versendet.");
}

export async function revokeMaterialRequest(id: string): Promise<ActionResult<null>> {
  return runAction(async () => {
    await assertEditor();
    const supabase = await createClient();
    check(await supabase.rpc("revoke_material_request", { p_request_id: uuid.parse(id) }));
    refresh();
    return null;
  }, "Link widerrufen.");
}

export async function reviewMaterial(_: ActionResult<null> | null, formData: FormData): Promise<ActionResult<null>> {
  return runAction(async () => {
    const profile = await assertEditor();
    const d = z.object({ id: uuid, outcome: z.enum(["geprueft", "rueckfrage"]), note: optionalText(4000), notify: z.string().optional() }).parse(formToObject(formData));
    const supabase = await createClient();
    check(await supabase.rpc("review_material_request", { p_request_id: d.id, p_outcome: d.outcome, p_note: d.note }));
    if (d.outcome === "rueckfrage" && d.notify === "on") {
      const r = check(await supabase.from("material_requests").select("id, dossier_id, client_id, recipient_name, recipient_email, token_encrypted, expires_at, dossiers(title)").eq("id", d.id).single());
      if (r.token_encrypted && r.recipient_email) {
        await sendTemplatedEmail({
          templateKey: "material_anfrage",
          to: r.recipient_email,
          toName: r.recipient_name,
          vars: {
            empfaenger_name: r.recipient_name || "Damen und Herren",
            beitrag_titel: r.dossiers?.title ?? "",
            nachricht: `Rückfrage der Redaktion: ${d.note ?? ""}`,
            link: `${publicEnv.appUrl}/m/${decryptSecret(r.token_encrypted)}`,
            gueltig_bis: formatDateTime(r.expires_at),
            frist_hinweis: "",
            absender_name: profile.full_name || "Ihr MEET GERMANY Team",
          },
          override: { subject: "Rückfrage zu Ihrem Beitrag „{{beitrag_titel}}“" },
          related: { dossier_id: r.dossier_id, client_id: r.client_id, material_request_id: r.id },
          triggeredBy: "manuell",
          idempotencyKey: `material-rueckfrage:${r.id}:${Date.now()}`,
          createdBy: profile.id,
        });
      }
    }
    refresh();
    return null;
  }, "Prüfung gespeichert.");
}

// -----------------------------------------------------------------------------
// Kundenvorschau
// -----------------------------------------------------------------------------
const previewSchema = z.object({
  dossier_id: uuid,
  content_ids: z.array(uuid).min(1, "Bitte mindestens einen Inhalt auswählen."),
  response_due_date: optionalDate,
  expiry_days: z.coerce.number().int().min(1).max(120),
  ...recipientSchema,
});

export async function sendPreview(_: ActionResult<LinkResult> | null, formData: FormData): Promise<ActionResult<LinkResult>> {
  return runAction(async () => {
    const profile = await assertEditor();
    const raw = formToObject(formData);
    const ids = formData.getAll("content_ids").map(String);
    const d = previewSchema.parse({ ...raw, content_ids: ids });
    const supabase = await createClient();
    const dossier = check(await supabase.from("dossiers").select("id, title, client_id, clients(name)").eq("id", d.dossier_id).single());
    const items = check(await supabase.from("content_items").select("id, title, channel, kind").in("id", d.content_ids));

    const { token, hash } = generateAccessToken();
    const expiresAt = new Date(Date.now() + d.expiry_days * 86_400_000).toISOString();
    const previewId = check(
      await supabase.rpc("create_preview", {
        p_dossier_id: d.dossier_id,
        p_content_ids: d.content_ids,
        p_recipient_name: d.recipient_name,
        p_recipient_email: d.recipient_email,
        p_contact_id: d.contact_id,
        p_message: d.message,
        p_token_hash: hash,
        p_token_encrypted: encryptOptional(token),
        p_expires_at: expiresAt,
        p_response_due_date: d.response_due_date,
      }),
    );
    const link = `${publicEnv.appUrl}/v/${token}`;

    let emailStatus = "nicht_versendet";
    let emailError: string | undefined;
    if (d.send_email) {
      const res = await sendTemplatedEmail({
        templateKey: "vorschau",
        to: d.recipient_email,
        toName: d.recipient_name,
        vars: {
          empfaenger_name: d.recipient_name || "Damen und Herren",
          beitrag_titel: dossier.title,
          kunde_name: dossier.clients?.name ?? "",
          nachricht: d.message ?? "",
          link,
          inhalte: items.map((i) => `${CONTENT_KIND_LABELS[i.kind]} (${CHANNEL_LABELS[i.channel]})`).join(", "),
          gueltig_bis: formatDateTime(expiresAt),
          frist_hinweis: d.response_due_date ? `Bitte geben Sie uns bis zum ${formatDate(d.response_due_date)} Rückmeldung.` : "",
          absender_name: profile.full_name || "Ihr MEET GERMANY Team",
        },
        override: d.subject || d.body ? { subject: d.subject ?? undefined, body: d.body ?? undefined } : undefined,
        related: { dossier_id: d.dossier_id, client_id: dossier.client_id, preview_id: previewId },
        triggeredBy: "manuell",
        idempotencyKey: `vorschau:${previewId}`,
        createdBy: profile.id,
      });
      emailStatus = res.status;
      emailError = res.error;
      if (res.status === "versendet") {
        await supabase.from("previews").update({ status: "versendet", sent_at: new Date().toISOString() }).eq("id", previewId);
      }
    }
    refresh();
    return { link, email: emailStatus, emailError };
  });
}

export async function markPreviewSent(id: string): Promise<ActionResult<null>> {
  return runAction(async () => {
    await assertEditor();
    const supabase = await createClient();
    check(await supabase.from("previews").update({ status: "versendet", sent_at: new Date().toISOString() }).eq("id", uuid.parse(id)).eq("status", "erstellt"));
    refresh();
    return null;
  }, "Als versendet markiert.");
}

export async function getPreviewLink(id: string): Promise<ActionResult<{ link: string }>> {
  return runAction(async () => {
    await assertEditor();
    const supabase = await createClient();
    const r = check(await supabase.from("previews").select("token_encrypted").eq("id", uuid.parse(id)).single());
    if (!r.token_encrypted) throw new Error("Der Link wurde nicht gespeichert (APP_ENCRYPTION_KEY fehlte beim Erstellen). Bitte eine neue Vorschau senden.");
    return { link: `${publicEnv.appUrl}/v/${decryptSecret(r.token_encrypted)}` };
  });
}

export async function resendPreview(id: string): Promise<ActionResult<null>> {
  return runAction(async () => {
    const profile = await assertEditor();
    const supabase = await createClient();
    const p = check(
      await supabase
        .from("previews")
        .select("id, dossier_id, client_id, recipient_name, recipient_email, token_encrypted, expires_at, revoked_at, status, dossiers(title), clients(name)")
        .eq("id", uuid.parse(id))
        .single(),
    );
    if (p.revoked_at || p.status === "ersetzt") throw new Error("Diese Vorschau ist nicht mehr aktiv.");
    if (!p.token_encrypted || !p.recipient_email) throw new Error("Link oder Empfänger nicht gespeichert – bitte neue Vorschau senden.");
    const res = await sendTemplatedEmail({
      templateKey: "vorschau_erinnerung",
      to: p.recipient_email,
      toName: p.recipient_name,
      vars: {
        empfaenger_name: p.recipient_name || "Damen und Herren",
        beitrag_titel: p.dossiers?.title ?? "",
        kunde_name: p.clients?.name ?? "",
        link: `${publicEnv.appUrl}/v/${decryptSecret(p.token_encrypted)}`,
        gueltig_bis: formatDateTime(p.expires_at),
      },
      related: { dossier_id: p.dossier_id, client_id: p.client_id, preview_id: p.id },
      triggeredBy: "manuell",
      idempotencyKey: `vorschau-resend:${p.id}:${Date.now()}`,
      createdBy: profile.id,
    });
    if (res.status !== "versendet") throw new Error(res.error ?? "E-Mail wurde nicht versendet.");
    await supabase.from("previews").update({ status: "versendet", sent_at: new Date().toISOString() }).eq("id", p.id).eq("status", "erstellt");
    refresh();
    return null;
  }, "Erinnerung versendet.");
}

export async function revokePreview(id: string): Promise<ActionResult<null>> {
  return runAction(async () => {
    await assertEditor();
    const supabase = await createClient();
    check(await supabase.rpc("revoke_preview", { p_preview_id: uuid.parse(id) }));
    refresh();
    return null;
  }, "Vorschau-Link widerrufen.");
}

/** E-Mail vor dem Versand prüfen: gerendert mit Beispiel- bzw. echten Werten. */
export async function previewEmailAction(input: { templateKey: string; vars: Record<string, string>; subject?: string; body?: string }): Promise<ActionResult<{ subject: string; text: string; html: string }>> {
  return runAction(async () => {
    await assertEditor();
    const supabase = await createClient();
    const tpl = check(await supabase.from("email_templates").select("subject, body").eq("key", z.string().max(80).parse(input.templateKey)).single());
    return renderEmail({ subject: input.subject || tpl.subject, body: input.body || tpl.body }, input.vars);
  });
}

export async function getDefaultExpiry(kind: "material" | "vorschau"): Promise<{ expiryDays: number; responseDue: string }> {
  const settings = await getSettings();
  const expiryDays = settingNumber(settings, kind === "material" ? "links.material_expiry_days" : "links.preview_expiry_days", kind === "material" ? 30 : 21);
  const responseDays = settingNumber(settings, kind === "material" ? "material.response_days" : "preview.response_days", kind === "material" ? 10 : 5);
  return { expiryDays, responseDue: addDays(berlinToday(), responseDays) };
}
