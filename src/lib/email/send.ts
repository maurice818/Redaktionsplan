import "server-only";
import { features } from "@/lib/env.server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getEmailProvider } from "./provider";
import { renderEmail, type TemplateVars } from "./render";

export interface SendTemplatedEmailInput {
  templateKey: string;
  to: string;
  toName?: string | null;
  vars: TemplateVars;
  /** Optional abweichender Betreff/Text (z. B. vor dem Versand angepasst) */
  override?: { subject?: string; body?: string };
  related?: {
    dossier_id?: string | null;
    client_id?: string | null;
    material_request_id?: string | null;
    preview_id?: string | null;
    task_id?: string | null;
  };
  triggeredBy: "manuell" | "erinnerung" | "system";
  /** Eindeutiger Schlüssel – verhindert doppelte Protokolleinträge und Doppelversand */
  idempotencyKey: string;
  createdBy?: string | null;
}

export interface SendTemplatedEmailResult {
  status: "versendet" | "fehlgeschlagen" | "nicht_konfiguriert" | "bereits_versendet";
  eventId: string | null;
  error?: string;
}

/**
 * Rendert eine Vorlage, protokolliert den Versand in email_events (ohne den
 * Link-Token im Klartext) und versendet über den konfigurierten Provider.
 * Wirft nie: Aufrufer haben oft schon etwas angelegt (z. B. einen Kundenlink),
 * das bei einem E-Mail-Problem nicht verloren gehen darf.
 */
export async function sendTemplatedEmail(input: SendTemplatedEmailInput): Promise<SendTemplatedEmailResult> {
  if (!features.admin()) {
    return { status: "nicht_konfiguriert", eventId: null, error: "E-Mail-Versand benötigt den Supabase Secret Key (SUPABASE_SECRET_KEY)." };
  }
  try {
    return await sendAndLog(input);
  } catch (error) {
    return { status: "fehlgeschlagen", eventId: null, error: error instanceof Error ? error.message : "Unbekannter Fehler beim E-Mail-Versand." };
  }
}

async function sendAndLog(input: SendTemplatedEmailInput): Promise<SendTemplatedEmailResult> {
  const admin = createAdminClient();

  const { data: existing } = await admin
    .from("email_events")
    .select("id, status")
    .eq("idempotency_key", input.idempotencyKey)
    .maybeSingle();
  if (existing && existing.status === "versendet") {
    return { status: "bereits_versendet", eventId: existing.id };
  }

  const { data: tpl, error: tplError } = await admin
    .from("email_templates")
    .select("subject, body, is_active")
    .eq("key", input.templateKey)
    .maybeSingle();
  if (tplError || !tpl) {
    return { status: "fehlgeschlagen", eventId: null, error: `E-Mail-Vorlage „${input.templateKey}“ nicht gefunden.` };
  }
  if (!tpl.is_active) {
    return { status: "fehlgeschlagen", eventId: null, error: `E-Mail-Vorlage „${input.templateKey}“ ist deaktiviert.` };
  }

  const rendered = renderEmail(
    { subject: input.override?.subject ?? tpl.subject, body: input.override?.body ?? tpl.body },
    input.vars,
  );
  const provider = getEmailProvider();

  let eventId = existing?.id ?? null;
  if (!eventId) {
    const { data: created, error } = await admin
      .from("email_events")
      .insert({
        template_key: input.templateKey,
        to_email: input.to,
        to_name: input.toName ?? null,
        subject: rendered.subject,
        status: "ausstehend",
        provider: provider.name,
        idempotency_key: input.idempotencyKey,
        triggered_by: input.triggeredBy,
        created_by: input.createdBy ?? null,
        ...input.related,
      })
      .select("id")
      .single();
    if (error) {
      // Paralleler Versuch mit gleichem Schlüssel → nichts doppelt versenden
      if (error.code === "23505") return { status: "bereits_versendet", eventId: null };
      return { status: "fehlgeschlagen", eventId: null, error: error.message };
    }
    eventId = created.id;
  } else {
    await admin.from("email_events").update({ attempts: 2, status: "ausstehend" }).eq("id", eventId);
  }

  if (!provider.configured) {
    await admin
      .from("email_events")
      .update({ status: "nicht_konfiguriert", error: "E-Mail-Versand ist nicht eingerichtet." })
      .eq("id", eventId);
    return { status: "nicht_konfiguriert", eventId, error: "E-Mail-Versand ist nicht eingerichtet." };
  }

  const result = await provider.send({
    to: input.to,
    toName: input.toName,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
    idempotencyKey: input.idempotencyKey,
  });

  if (result.ok) {
    await admin
      .from("email_events")
      .update({ status: "versendet", provider_message_id: result.providerMessageId, sent_at: new Date().toISOString(), error: null })
      .eq("id", eventId);
    return { status: "versendet", eventId };
  }

  await admin.from("email_events").update({ status: "fehlgeschlagen", error: result.error }).eq("id", eventId);
  return { status: "fehlgeschlagen", eventId, error: result.error };
}
