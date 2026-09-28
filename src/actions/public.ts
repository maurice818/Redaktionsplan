"use server";

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { fail, ok, toErrorMessage, type ActionResult } from "@/lib/action-result";
import { publicEnv } from "@/lib/env";
import { sendTemplatedEmail } from "@/lib/email/send";
import { features } from "@/lib/env.server";
import { answersSchema, parseFields } from "@/lib/material-form";
import { ALLOWED_UPLOAD_TYPES, MAX_UPLOAD_BYTES } from "@/lib/media";
import { createAdminClient } from "@/lib/supabase/admin";
import { createAnonClient } from "@/lib/supabase/anon";

/**
 * Aktionen für Kunden ohne Konto. Jede Aktion prüft den Token erneut in der
 * Datenbank (public_*-Funktionen). Fehlermeldungen verraten keine internen Details.
 */
const token = z.string().min(20).max(200).regex(/^[A-Za-z0-9_-]+$/);

const ERRORS: Record<string, string> = {
  ungueltig: "Dieser Link ist ungültig, abgelaufen oder wurde widerrufen.",
  bereits_eingereicht: "Das Formular wurde bereits abgeschickt. Bei Änderungen melden Sie sich bitte bei der Redaktion.",
  pflichtfelder: "Bitte füllen Sie alle Pflichtfelder aus.",
  identitaet_fehlt: "Bitte geben Sie Ihren Namen und eine gültige E-Mail-Adresse an.",
  zu_gross: "Ihre Angaben sind zu umfangreich.",
  zu_viele_dateien: "Es können höchstens 40 Dateien hochgeladen werden.",
  ungueltiger_pfad: "Die Datei konnte nicht zugeordnet werden.",
  in_verwendung: "Die Datei wird bereits verwendet und kann nicht mehr entfernt werden.",
  keine_entscheidung: "Bitte treffen Sie mindestens eine Entscheidung.",
  bestaetigung_fehlt: "Bitte bestätigen Sie, dass Sie zur Freigabe berechtigt sind.",
  kommentar_fehlt: "Bitte beschreiben Sie Ihren Änderungswunsch.",
  unbekannter_inhalt: "Ein Inhalt gehört nicht zu dieser Vorschau.",
  ungueltige_entscheidung: "Ungültige Entscheidung.",
};

function rpcError(result: unknown): string | null {
  const r = result as { error?: string; missing?: string[] } | null;
  if (!r?.error) return null;
  const base = ERRORS[r.error] ?? "Die Aktion konnte nicht ausgeführt werden.";
  return r.missing?.length ? `${base} Fehlend: ${r.missing.join(", ")}` : base;
}

// -----------------------------------------------------------------------------
// Materialformular
// -----------------------------------------------------------------------------
export async function saveMaterial(input: {
  token: string;
  answers: Record<string, unknown>;
  submit: boolean;
  name?: string;
  email?: string;
}): Promise<ActionResult<{ submitted: boolean }>> {
  try {
    const t = token.parse(input.token);
    const supabase = createAnonClient();
    const { data: current, error: loadError } = await supabase.rpc("public_get_material_request", { p_token: t });
    if (loadError) throw loadError;
    const err = rpcError(current);
    if (err) return fail(err);
    const fields = parseFields((current as { request: { fields: unknown } }).request.fields);
    const parsed = answersSchema(fields, input.submit).safeParse(input.answers ?? {});
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Bitte prüfen Sie Ihre Angaben.");
    if (input.submit) {
      const identity = z.object({ name: z.string().trim().min(2).max(200), email: z.string().trim().email() }).safeParse({ name: input.name, email: input.email });
      if (!identity.success) return fail(ERRORS.identitaet_fehlt);
    }
    const { data, error } = await supabase.rpc("public_save_material_response", {
      p_token: t,
      p_answers: parsed.data as never,
      p_submit: input.submit,
      p_name: input.name ?? "",
      p_email: input.email ?? "",
    });
    if (error) throw error;
    const e2 = rpcError(data);
    if (e2) return fail(e2);

    if (input.submit && features.admin()) {
      await notifyTeamAboutMaterial(t).catch(() => undefined);
    }
    return ok({ submitted: input.submit }, input.submit ? "Vielen Dank! Ihre Angaben wurden übermittelt." : "Zwischengespeichert.");
  } catch (error) {
    return fail(error instanceof z.ZodError ? ERRORS.ungueltig : toErrorMessage(error));
  }
}

async function notifyTeamAboutMaterial(t: string) {
  // Team-E-Mail an die zuständige Person (In-App-Benachrichtigung und Prüfaufgabe entstehen in der Datenbank).
  const admin = createAdminClient();
  const { createHash } = await import("node:crypto");
  const hash = createHash("sha256").update(t, "utf8").digest("hex");
  const { data: req } = await admin
    .from("material_requests")
    .select("id, dossier_id, client_id, clients(name), dossiers(title, owner_id)")
    .eq("token_hash", hash)
    .single();
  if (!req?.dossiers?.owner_id) return;
  const { data: owner } = await admin.from("profiles").select("email, full_name").eq("id", req.dossiers.owner_id).single();
  if (!owner?.email) return;
  await sendTemplatedEmail({
    templateKey: "team_material_eingegangen",
    to: owner.email,
    toName: owner.full_name,
    vars: {
      empfaenger_name: owner.full_name || owner.email,
      beitrag_titel: req.dossiers.title,
      kunde_name: req.clients?.name ?? "Der Kunde",
      link: `${publicEnv.appUrl}/beitraege/${req.dossier_id}#material`,
    },
    related: { dossier_id: req.dossier_id, client_id: req.client_id, material_request_id: req.id },
    triggeredBy: "system",
    idempotencyKey: `team-material:${req.id}:${new Date().toISOString().slice(0, 16)}`,
  });
}

export async function materialUploadTarget(input: { token: string; fileName: string; mimeType: string; size: number }): Promise<ActionResult<{ path: string; uploadToken: string }>> {
  try {
    const d = z
      .object({ token, fileName: z.string().min(1).max(255), mimeType: z.string(), size: z.number().int().positive() })
      .parse(input);
    if (!ALLOWED_UPLOAD_TYPES.includes(d.mimeType)) return fail("Dieser Dateityp ist nicht erlaubt (JPG, PNG, WebP, GIF, TIFF, BMP, MP4, MOV, PDF).");
    if (d.size > MAX_UPLOAD_BYTES) return fail("Die Datei ist zu groß. Bitte nutzen Sie für große Dateien einen Link (z. B. Google Drive).");
    if (!features.admin()) return fail("Uploads sind derzeit nicht verfügbar. Bitte nutzen Sie einen Link (z. B. Google Drive).");
    const supabase = createAnonClient();
    const { data, error } = await supabase.rpc("public_material_upload_target", { p_token: d.token });
    if (error) throw error;
    const err = rpcError(data);
    if (err) return fail(err);
    const prefix = (data as { prefix: string }).prefix;
    const safe = d.fileName.normalize("NFKD").replace(/[^\w.\-]+/g, "-").replace(/-+/g, "-").slice(-120) || "datei";
    const path = `${prefix}${randomUUID()}-${safe}`;
    const admin = createAdminClient();
    const { data: signed, error: signError } = await admin.storage.from("media").createSignedUploadUrl(path);
    if (signError || !signed) throw signError ?? new Error("Upload nicht möglich.");
    return ok({ path: signed.path, uploadToken: signed.token });
  } catch (error) {
    return fail(error instanceof z.ZodError ? ERRORS.ungueltig : toErrorMessage(error));
  }
}

export async function registerMaterialFile(input: {
  token: string;
  path: string;
  fileName: string;
  mimeType: string;
  size: number;
  width: number | null;
  height: number | null;
  credit?: string;
  rights?: string;
}): Promise<ActionResult<{ id: string }>> {
  try {
    const d = z
      .object({
        token, path: z.string().min(10).max(400), fileName: z.string().min(1).max(255), mimeType: z.string().max(100), size: z.number().int().nonnegative(),
        width: z.number().int().positive().nullable(), height: z.number().int().positive().nullable(),
        credit: z.string().max(500).optional(), rights: z.string().max(2000).optional(),
      })
      .parse(input);
    const supabase = createAnonClient();
    const { data, error } = await supabase.rpc("public_register_material_file", {
      p_token: d.token, p_storage_path: d.path, p_file_name: d.fileName, p_mime_type: d.mimeType, p_size_bytes: d.size,
      p_width: d.width, p_height: d.height, p_credit: d.credit ?? null, p_rights_note: d.rights ?? null,
    });
    if (error) throw error;
    // Bewusst KEIN Löschen bei Fehlern: Token und Pfad stammen vom Aufrufer. Ein Löschen
    // hier würde es erlauben, mit einem ungültigen Link beliebige Dateien zu entfernen.
    // Nicht registrierte Uploads bleiben im Ordner material/<Anfrage>/ und sind unsichtbar.
    const err = rpcError(data);
    if (err) return fail(err);
    return ok({ id: (data as { id: string }).id }, "Datei hochgeladen.");
  } catch (error) {
    return fail(error instanceof z.ZodError ? ERRORS.ungueltig : toErrorMessage(error));
  }
}

export async function removeMaterialFile(input: { token: string; mediaId: string }): Promise<ActionResult<null>> {
  try {
    const d = z.object({ token, mediaId: z.string().uuid() }).parse(input);
    const supabase = createAnonClient();
    const { data, error } = await supabase.rpc("public_remove_material_file", { p_token: d.token, p_media_id: d.mediaId });
    if (error) throw error;
    const err = rpcError(data);
    if (err) return fail(err);
    const path = (data as { storage_path?: string }).storage_path;
    if (path && features.admin()) await createAdminClient().storage.from("media").remove([path]);
    return ok(null, "Datei entfernt.");
  } catch (error) {
    return fail(error instanceof z.ZodError ? ERRORS.ungueltig : toErrorMessage(error));
  }
}

// -----------------------------------------------------------------------------
// Vorschau & Freigabe
// -----------------------------------------------------------------------------
const decisionSchema = z.object({
  token,
  decisions: z
    .array(z.object({ item_id: z.string().uuid(), decision: z.enum(["freigegeben", "aenderung_gewuenscht"]), comment: z.string().trim().max(5000).optional() }))
    .min(1, ERRORS.keine_entscheidung)
    .max(50),
  name: z.string().trim().min(2, ERRORS.identitaet_fehlt).max(200),
  email: z.string().trim().email(ERRORS.identitaet_fehlt),
  position: z.string().trim().max(200).optional(),
  confirmed: z.boolean(),
});

export async function submitDecisions(input: z.input<typeof decisionSchema>): Promise<ActionResult<{ decided: number; open: number }>> {
  try {
    const parsed = decisionSchema.safeParse(input);
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Bitte prüfen Sie Ihre Angaben.");
    const d = parsed.data;
    if (d.decisions.some((x) => x.decision === "aenderung_gewuenscht" && !x.comment)) return fail(ERRORS.kommentar_fehlt);
    if (d.decisions.some((x) => x.decision === "freigegeben") && !d.confirmed) return fail(ERRORS.bestaetigung_fehlt);
    const supabase = createAnonClient();
    const { data, error } = await supabase.rpc("public_submit_preview_decisions", {
      p_token: d.token,
      p_decisions: d.decisions as never,
      p_name: d.name,
      p_email: d.email,
      p_position: d.position ?? null,
      p_confirmed: d.confirmed,
    });
    if (error) throw error;
    const err = rpcError(data);
    if (err) return fail(err);
    const res = data as { decided: number; open: number };
    if (features.admin()) await notifyTeamAboutDecision(d.token, d.name, d.decisions).catch(() => undefined);
    return ok(res, "Vielen Dank – Ihre Rückmeldung wurde gespeichert.");
  } catch (error) {
    return fail(toErrorMessage(error));
  }
}

async function notifyTeamAboutDecision(t: string, name: string, decisions: { decision: string }[]) {
  const admin = createAdminClient();
  const { createHash } = await import("node:crypto");
  const hash = createHash("sha256").update(t, "utf8").digest("hex");
  const { data: p } = await admin.from("previews").select("id, dossier_id, client_id, clients(name), dossiers(title, owner_id)").eq("token_hash", hash).single();
  if (!p?.dossiers?.owner_id) return;
  const { data: owner } = await admin.from("profiles").select("email, full_name").eq("id", p.dossiers.owner_id).single();
  if (!owner?.email) return;
  const approved = decisions.filter((x) => x.decision === "freigegeben").length;
  const changes = decisions.length - approved;
  await sendTemplatedEmail({
    templateKey: "team_kundenantwort",
    to: owner.email,
    toName: owner.full_name,
    vars: {
      empfaenger_name: owner.full_name || owner.email,
      beitrag_titel: p.dossiers.title,
      kunde_name: `${name} (${p.clients?.name ?? "Kunde"})`,
      text: [approved ? `${approved} Inhalt(e) freigegeben` : "", changes ? `${changes} Änderungswunsch/-wünsche` : ""].filter(Boolean).join(", "),
      link: `${publicEnv.appUrl}/beitraege/${p.dossier_id}#vorschauen`,
    },
    related: { dossier_id: p.dossier_id, client_id: p.client_id, preview_id: p.id },
    triggeredBy: "system",
    idempotencyKey: `team-antwort:${p.id}:${new Date().toISOString().slice(0, 16)}`,
  });
}
