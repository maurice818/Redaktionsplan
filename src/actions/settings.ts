"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertAdmin, assertProfile } from "@/lib/auth";
import { check, runAction, type ActionResult } from "@/lib/action-result";
import { publicEnv } from "@/lib/env";
import { features } from "@/lib/env.server";
import { parseFields, type MaterialField } from "@/lib/material-form";
import { adapterFor } from "@/lib/platforms/registry";
import { decryptSecret, encryptSecret } from "@/lib/security/crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { email, formToObject, optionalDate, optionalText, optionalUuid, requiredText, uuid } from "@/lib/validation";

const refresh = () => revalidatePath("/", "layout");
const num = (min = 0) =>
  z.string().optional().transform((v) => (v === undefined || v === "" ? null : Number(v.replace(",", ".")))).refine((v) => v === null || (Number.isFinite(v) && v >= min), "Bitte eine gültige Zahl angeben.");
const bool = z.string().optional().transform((v) => v === "on");

// -----------------------------------------------------------------------------
// Profil & Team
// -----------------------------------------------------------------------------
export async function updateOwnProfile(_: ActionResult<null> | null, formData: FormData): Promise<ActionResult<null>> {
  return runAction(async () => {
    const profile = await assertProfile();
    const d = z.object({ full_name: requiredText("Name", 120), job_title: optionalText(120) }).parse(formToObject(formData));
    const supabase = await createClient();
    check(await supabase.from("profiles").update(d).eq("id", profile.id));
    refresh();
    return null;
  }, "Profil gespeichert.");
}

const ROLES = ["admin", "redaktion", "freigabe", "mitarbeit"] as const;

export async function inviteMember(_: ActionResult<null> | null, formData: FormData): Promise<ActionResult<null>> {
  return runAction(async () => {
    await assertAdmin();
    if (!features.admin()) throw new Error("SUPABASE_SECRET_KEY fehlt – Einladungen sind nur serverseitig mit dem Secret Key möglich.");
    const d = z.object({ email, full_name: requiredText("Name", 120), role: z.enum(ROLES) }).parse(formToObject(formData));
    const admin = createAdminClient();
    const { data, error } = await admin.auth.admin.inviteUserByEmail(d.email, {
      data: { full_name: d.full_name },
      redirectTo: `${publicEnv.appUrl}/auth/confirm?next=/passwort-setzen`,
    });
    if (error) throw new Error(`Einladung fehlgeschlagen: ${error.message}`);
    check(await admin.from("profiles").upsert({ id: data.user.id, email: d.email, full_name: d.full_name, role: d.role, is_active: true }));
    refresh();
    return null;
  }, "Einladung versendet.");
}

export async function updateMember(_: ActionResult<null> | null, formData: FormData): Promise<ActionResult<null>> {
  return runAction(async () => {
    await assertAdmin();
    const d = z.object({ id: uuid, full_name: requiredText("Name", 120), role: z.enum(ROLES), is_active: bool }).parse(formToObject(formData));
    const supabase = await createClient();
    const { id, ...rest } = d;
    check(await supabase.from("profiles").update(rest).eq("id", id));
    refresh();
    return null;
  }, "Teammitglied gespeichert.");
}

// -----------------------------------------------------------------------------
// Pakete & Leistungstypen
// -----------------------------------------------------------------------------
export async function saveTemplate(_: ActionResult<null> | null, formData: FormData): Promise<ActionResult<null>> {
  return runAction(async () => {
    await assertAdmin();
    const d = z
      .object({ id: optionalUuid, key: z.string().trim().regex(/^[a-z0-9_]{3,40}$/, "Schlüssel: 3–40 Zeichen, a–z, 0–9, _"), name: requiredText("Name", 150), description: optionalText(2000), is_active: bool, sort_order: num() })
      .parse(formToObject(formData));
    const supabase = await createClient();
    const { id, sort_order, ...rest } = d;
    const values = { ...rest, sort_order: sort_order ?? 100 };
    if (id) check(await supabase.from("package_templates").update(values).eq("id", id));
    else check(await supabase.from("package_templates").insert(values));
    refresh();
    return null;
  }, "Paketvorlage gespeichert. Bereits gebuchte Verträge bleiben unverändert.");
}

export async function saveTemplateItem(_: ActionResult<null> | null, formData: FormData): Promise<ActionResult<null>> {
  return runAction(async () => {
    await assertAdmin();
    const d = z
      .object({
        id: optionalUuid,
        template_id: uuid,
        service_type_id: uuid,
        label: optionalText(150),
        quantity: num(1),
        period: z.enum(["vertragsjahr", "vertragslaufzeit"]),
        per_parent_item_id: optionalUuid,
        quantity_per_parent: num(1),
        notes: optionalText(1000),
        sort_order: num(),
      })
      .refine((x) => !x.per_parent_item_id || x.quantity_per_parent, { message: "Bei abgeleiteten Leistungen die Anzahl je Eltern-Einheit angeben.", path: ["quantity_per_parent"] })
      .parse(formToObject(formData));
    const supabase = await createClient();
    const { id, sort_order, ...rest } = d;
    const values = { ...rest, quantity: rest.per_parent_item_id ? null : rest.quantity, sort_order: sort_order ?? 100 };
    if (id) check(await supabase.from("package_template_items").update(values).eq("id", id));
    else check(await supabase.from("package_template_items").insert(values));
    refresh();
    return null;
  }, "Position gespeichert.");
}

export async function deleteTemplateItem(id: string): Promise<ActionResult<null>> {
  return runAction(async () => {
    await assertAdmin();
    const supabase = await createClient();
    check(await supabase.from("package_template_items").delete().eq("id", uuid.parse(id)));
    refresh();
    return null;
  }, "Position entfernt.");
}

export async function saveServiceType(_: ActionResult<null> | null, formData: FormData): Promise<ActionResult<null>> {
  return runAction(async () => {
    await assertAdmin();
    const d = z
      .object({
        id: optionalUuid,
        key: z.string().trim().regex(/^[a-z0-9_]{3,40}$/, "Schlüssel: 3–40 Zeichen, a–z, 0–9, _"),
        name: requiredText("Name", 150),
        description: optionalText(1000),
        category: z.enum(["redaktion", "social", "profil", "community", "event", "reichweite", "vernetzung", "vorteil", "circle", "sonstiges"]),
        content_kind: z.string().optional().transform((v) => (v === "magazinartikel" || v === "social" ? v : null)),
        is_active: bool,
        sort_order: num(),
      })
      .parse(formToObject(formData));
    const supabase = await createClient();
    const { id, sort_order, ...rest } = d;
    const values = { ...rest, sort_order: sort_order ?? 100 };
    if (id) check(await supabase.from("service_types").update(values).eq("id", id));
    else check(await supabase.from("service_types").insert(values));
    refresh();
    return null;
  }, "Leistungstyp gespeichert.");
}

// -----------------------------------------------------------------------------
// Formatregeln
// -----------------------------------------------------------------------------
export async function saveFormatRule(_: ActionResult<null> | null, formData: FormData): Promise<ActionResult<null>> {
  return runAction(async () => {
    await assertAdmin();
    const raw = formToObject(formData);
    const d = z
      .object({
        id: optionalUuid,
        channel: z.enum(["instagram", "facebook", "linkedin", "magazin"]),
        post_format: z.enum(["artikel", "feed_bild", "karussell", "reel", "story", "video", "text", "link"]),
        media_kind: z.enum(["bild", "video", "keins"]),
        label: requiredText("Bezeichnung", 150),
        media_required: bool,
        allowed_mime_types: z.string().optional(),
        max_file_size_mb: num(), min_width: num(), max_width: num(), max_pixels: num(),
        recommended_width: num(), recommended_height: num(), min_aspect_ratio: num(), max_aspect_ratio: num(),
        min_duration_seconds: num(), max_duration_seconds: num(), min_items: num(), max_items: num(),
        caption_max_length: num(), hashtags_max: num(),
        api_supported: bool,
        notes: optionalText(3000),
        source_url: optionalText(500),
        verified_at: optionalDate,
        is_active: bool,
      })
      .parse(raw);
    const { id, allowed_mime_types, ...rest } = d;
    const intFields = ["min_width", "max_width", "max_pixels", "recommended_width", "recommended_height", "min_items", "max_items", "caption_max_length", "hashtags_max"] as const;
    const values: Record<string, unknown> = { ...rest, allowed_mime_types: (allowed_mime_types ?? "").split(/[\s,]+/).filter(Boolean) };
    for (const f of intFields) if (values[f] !== null) values[f] = Math.round(values[f] as number);
    const supabase = await createClient();
    if (id) check(await supabase.from("format_rules").update(values as never).eq("id", id));
    else check(await supabase.from("format_rules").insert(values as never));
    refresh();
    return null;
  }, "Formatregel gespeichert (mit Änderungsdatum).");
}

// -----------------------------------------------------------------------------
// E-Mail-Vorlagen, Erinnerungen, Einstellungen
// -----------------------------------------------------------------------------
export async function saveEmailTemplate(_: ActionResult<null> | null, formData: FormData): Promise<ActionResult<null>> {
  return runAction(async () => {
    await assertAdmin();
    const d = z.object({ key: z.string().min(1).max(80), subject: requiredText("Betreff", 300), body: requiredText("Text", 20000), is_active: bool }).parse(formToObject(formData));
    const supabase = await createClient();
    const { key, ...rest } = d;
    check(await supabase.from("email_templates").update(rest).eq("key", key));
    refresh();
    return null;
  }, "E-Mail-Vorlage gespeichert.");
}

export async function saveReminderRule(_: ActionResult<null> | null, formData: FormData): Promise<ActionResult<null>> {
  return runAction(async () => {
    await assertAdmin();
    const d = z
      .object({
        key: z.string().min(1).max(80),
        is_active: bool,
        days: z.coerce.number().int().min(0).max(365),
        repeat_days: z.string().optional().transform((v) => (v ? Number(v) : null)).refine((v) => v === null || (Number.isInteger(v) && v > 0 && v <= 365), "Ungültige Wiederholung."),
        max_reminders: z.coerce.number().int().min(1).max(10),
        notify_customer: bool,
        notify_team: bool,
      })
      .parse(formToObject(formData));
    const supabase = await createClient();
    const { key, ...rest } = d;
    check(await supabase.from("reminder_rules").update(rest).eq("key", key));
    refresh();
    return null;
  }, "Erinnerungsregel gespeichert.");
}

export async function saveAppSettings(_: ActionResult<null> | null, formData: FormData): Promise<ActionResult<null>> {
  return runAction(async () => {
    await assertAdmin();
    const raw = formToObject(formData);
    const supabase = await createClient();
    const { data: existing } = await supabase.from("app_settings").select("key, value");
    for (const row of existing ?? []) {
      const incoming = raw[`s:${row.key}`];
      if (typeof incoming !== "string") continue;
      const value = typeof row.value === "number" ? Number(incoming) : incoming;
      if (typeof row.value === "number" && !Number.isFinite(value as number)) throw new Error(`Ungültiger Wert für ${row.key}.`);
      check(await supabase.from("app_settings").update({ value: value as never }).eq("key", row.key));
    }
    refresh();
    return null;
  }, "Einstellungen gespeichert.");
}

// -----------------------------------------------------------------------------
// Materialformulare
// -----------------------------------------------------------------------------
const fieldSchema = z.object({
  key: z.string().regex(/^[a-z0-9_]{2,40}$/, "Feldschlüssel: a–z, 0–9, _"),
  label: z.string().trim().min(1).max(200),
  type: z.enum(["text", "textarea", "url", "date", "list", "files", "checkbox", "heading"]),
  required: z.boolean().optional(),
  help: z.string().max(500).optional(),
  count: z.number().int().min(1).max(10).optional(),
  prefill: z.enum(["client_name", "recipient_name"]).optional(),
});

export async function saveMaterialForm(input: {
  id?: string;
  name: string;
  description?: string;
  intro_text?: string;
  fields: MaterialField[];
  is_default: boolean;
  is_active: boolean;
}): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    await assertAdmin();
    const fields = z.array(fieldSchema).min(1, "Mindestens ein Feld.").max(40).parse(parseFields(input.fields));
    const keys = new Set<string>();
    for (const f of fields) {
      if (keys.has(f.key)) throw new Error(`Feldschlüssel „${f.key}“ ist doppelt.`);
      keys.add(f.key);
    }
    const d = z.object({ name: requiredText("Name", 150), description: optionalText(1000), intro_text: optionalText(2000) }).parse(input);
    const supabase = await createClient();
    if (input.is_default) {
      check(await supabase.from("material_forms").update({ is_default: false }).eq("is_default", true).neq("id", input.id ?? "00000000-0000-0000-0000-000000000000"));
    }
    const values = { ...d, fields, is_default: input.is_default, is_active: input.is_active };
    if (input.id) {
      check(await supabase.from("material_forms").update(values).eq("id", uuid.parse(input.id)));
      refresh();
      return { id: input.id };
    }
    const created = check(await supabase.from("material_forms").insert(values).select("id").single());
    refresh();
    return { id: created.id };
  }, "Formular gespeichert. Bereits versendete Anfragen behalten ihren Formularstand.");
}

// -----------------------------------------------------------------------------
// Plattformkonten
// -----------------------------------------------------------------------------
export async function saveManualAccount(_: ActionResult<null> | null, formData: FormData): Promise<ActionResult<null>> {
  return runAction(async () => {
    const profile = await assertAdmin();
    const d = z
      .object({
        id: optionalUuid,
        platform: z.enum(["instagram", "facebook", "linkedin"]),
        display_name: requiredText("Bezeichnung", 150),
        external_id: optionalText(100),
        access_token: optionalText(4000),
        token_expires_at: optionalDate,
        notes: optionalText(2000),
      })
      .parse(formToObject(formData));
    const supabase = await createClient();
    const values = {
      platform: d.platform,
      display_name: d.display_name,
      external_id: d.external_id,
      notes: d.notes,
      auth_type: d.access_token ? ("manuell" as const) : undefined,
      token_expires_at: d.token_expires_at ? new Date(`${d.token_expires_at}T00:00:00Z`).toISOString() : undefined,
    };
    let accountId = d.id;
    if (accountId) check(await supabase.from("platform_accounts").update(values).eq("id", accountId));
    else accountId = check(await supabase.from("platform_accounts").insert(values).select("id").single()).id;

    if (d.access_token) {
      if (!features.admin() || !features.encryption()) throw new Error("Zum Speichern von Zugangsdaten werden SUPABASE_SECRET_KEY und APP_ENCRYPTION_KEY benötigt.");
      const admin = createAdminClient();
      check(await admin.from("platform_credentials").upsert({
        account_id: accountId!,
        access_token_enc: encryptSecret(d.access_token),
        expires_at: values.token_expires_at ?? null,
        updated_at: new Date().toISOString(),
      }));
      check(await admin.from("platform_accounts").update({ connected_by: profile.id, connected_at: new Date().toISOString(), connection_status: "nicht_verbunden", last_error: "Bitte „Verbindung prüfen“ ausführen." }).eq("id", accountId!));
    }
    refresh();
    return null;
  }, "Konto gespeichert.");
}

export async function verifyAccount(id: string): Promise<ActionResult<{ detail: string }>> {
  return runAction(async () => {
    await assertAdmin();
    if (!features.admin() || !features.encryption()) throw new Error("SUPABASE_SECRET_KEY und APP_ENCRYPTION_KEY werden benötigt.");
    const admin = createAdminClient();
    const account = check(await admin.from("platform_accounts").select("*").eq("id", uuid.parse(id)).single());
    const { data: cred } = await admin.from("platform_credentials").select("*").eq("account_id", id).maybeSingle();
    if (!cred) throw new Error("Für dieses Konto sind keine Zugangsdaten hinterlegt – bitte verbinden oder Token eintragen.");
    if (!account.external_id) throw new Error("Bitte die Konto-/Seiten-/Organisations-ID eintragen.");
    const adapter = adapterFor(account.platform)!;
    const result = await adapter.verify(decryptSecret(cred.access_token_enc), account.external_id);
    check(await admin.from("platform_accounts").update({
      connection_status: result.ok ? "verbunden" : "fehler",
      last_checked_at: new Date().toISOString(),
      last_error: result.ok ? null : result.detail,
      token_expires_at: result.expiresAt ?? cred.expires_at ?? null,
      scopes: result.scopes ?? account.scopes,
    }).eq("id", id));
    refresh();
    if (!result.ok) throw new Error(`Verbindung fehlgeschlagen: ${result.detail}`);
    return { detail: result.detail };
  }, "Verbindung erfolgreich geprüft.");
}

export async function setApiEnabled(id: string, enabled: boolean): Promise<ActionResult<null>> {
  return runAction(async () => {
    await assertAdmin();
    const supabase = await createClient();
    const account = check(await supabase.from("platform_accounts").select("connection_status").eq("id", uuid.parse(id)).single());
    if (enabled && account.connection_status !== "verbunden") throw new Error("Bitte zuerst die Verbindung erfolgreich prüfen.");
    check(await supabase.from("platform_accounts").update({ api_enabled: enabled }).eq("id", id));
    if (!enabled) {
      // Bereits verbindlich geplante API-Aufträge werden sofort zu manuellen Aufträgen mit Aufgabe
      // (Trigger content_items_after_update); laufende Versuche stellt der Hintergrundprozess um.
      check(await supabase.from("content_items").update({ auto_publish: false }).eq("platform_account_id", id).eq("auto_publish", true));
    }
    refresh();
    return null;
  }, enabled ? "API-Veröffentlichung aktiviert." : "API-Veröffentlichung deaktiviert.");
}

export async function setDefaultAccount(id: string): Promise<ActionResult<null>> {
  return runAction(async () => {
    await assertAdmin();
    const supabase = await createClient();
    const account = check(await supabase.from("platform_accounts").select("platform").eq("id", uuid.parse(id)).single());
    check(await supabase.from("platform_accounts").update({ is_default: false }).eq("platform", account.platform).eq("is_default", true));
    check(await supabase.from("platform_accounts").update({ is_default: true }).eq("id", id));
    refresh();
    return null;
  }, "Standardkonto gesetzt.");
}

export async function deleteAccount(id: string): Promise<ActionResult<null>> {
  return runAction(async () => {
    await assertAdmin();
    const supabase = await createClient();
    check(await supabase.from("platform_accounts").delete().eq("id", uuid.parse(id)));
    refresh();
    return null;
  }, "Konto entfernt (Zugangsdaten gelöscht).");
}

// -----------------------------------------------------------------------------
// Demo-Daten
// -----------------------------------------------------------------------------
export async function loadDemoData(): Promise<ActionResult<null>> {
  return runAction(async () => {
    await assertAdmin();
    const supabase = await createClient();
    check(await supabase.rpc("admin_load_demo_data"));
    refresh();
    return null;
  }, "Demo-Daten geladen (gekennzeichnet mit [DEMO]).");
}

export async function removeDemoData(): Promise<ActionResult<null>> {
  return runAction(async () => {
    await assertAdmin();
    const supabase = await createClient();
    const { data: paths } = await supabase.from("media_assets").select("storage_path, dossiers!inner(is_demo)").eq("dossiers.is_demo", true).not("storage_path", "is", null);
    check(await supabase.rpc("admin_remove_demo_data"));
    const files = (paths ?? []).map((p) => p.storage_path!).filter(Boolean);
    if (files.length) await supabase.storage.from("media").remove(files);
    refresh();
    return null;
  }, "Demo-Daten entfernt.");
}
