"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertEditor, assertProfile } from "@/lib/auth";
import { check, runAction, type ActionResult } from "@/lib/action-result";
import { mediaKindForMime } from "@/lib/domain/format-validation";
import { ALLOWED_UPLOAD_TYPES, MAX_UPLOAD_BYTES } from "@/lib/media";
import { createClient } from "@/lib/supabase/server";
import { formToObject, optionalText, optionalUuid, requiredText, uuid } from "@/lib/validation";

const refresh = () => revalidatePath("/", "layout");


function safeFileName(name: string): string {
  const cleaned = name.normalize("NFKD").replace(/[^\w.\-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  return (cleaned || "datei").slice(-120);
}

/** Signierte Upload-URL in den privaten Speicher (RLS prüft den Zugriff auf die Akte). */
export async function createUploadTarget(input: { dossierId: string; fileName: string; mimeType: string; size: number }): Promise<ActionResult<{ path: string; token: string }>> {
  return runAction(async () => {
    await assertProfile();
    const d = z
      .object({
        dossierId: uuid,
        fileName: z.string().min(1).max(255),
        mimeType: z.string().refine((m) => ALLOWED_UPLOAD_TYPES.includes(m), "Dieser Dateityp ist nicht erlaubt (JPG, PNG, WebP, GIF, TIFF, BMP, MP4, MOV, PDF)."),
        size: z.number().int().positive().max(MAX_UPLOAD_BYTES, "Die Datei ist zu groß (max. 500 MB; das Projektlimit in Supabase kann niedriger sein)."),
      })
      .parse(input);
    const supabase = await createClient();
    const path = `dossiers/${d.dossierId}/${randomUUID()}-${safeFileName(d.fileName)}`;
    const res = check(await supabase.storage.from("media").createSignedUploadUrl(path));
    return { path: res.path, token: res.token };
  });
}

const registerSchema = z.object({
  dossier_id: uuid,
  storage_path: z.string().min(10).max(400),
  file_name: requiredText("Dateiname", 255),
  mime_type: z.string().max(100),
  size_bytes: z.number().int().nonnegative(),
  width: z.number().int().positive().nullable().optional(),
  height: z.number().int().positive().nullable().optional(),
  duration_seconds: z.number().nonnegative().nullable().optional(),
  alt_text: z.string().max(1000).optional(),
  credit: z.string().max(500).optional(),
  status: z.enum(["entwurf", "final"]).default("entwurf"),
  supersedes_id: z.string().uuid().nullable().optional(),
  attach_to: z.string().uuid().nullable().optional(),
  role: z.enum(["medium", "titelbild", "cover"]).default("medium"),
});

export async function registerUpload(input: z.input<typeof registerSchema>): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    await assertProfile();
    const d = registerSchema.parse(input);
    if (!d.storage_path.startsWith(`dossiers/${d.dossier_id}/`)) throw new Error("Ungültiger Speicherpfad.");
    const supabase = await createClient();
    const { data: dossier } = await supabase.from("dossiers").select("client_id").eq("id", d.dossier_id).single();
    const created = check(
      await supabase
        .from("media_assets")
        .insert({
          dossier_id: d.dossier_id,
          client_id: dossier?.client_id ?? null,
          kind: mediaKindForMime(d.mime_type),
          source: "upload",
          storage_bucket: "media",
          storage_path: d.storage_path,
          file_name: d.file_name,
          mime_type: d.mime_type,
          size_bytes: d.size_bytes,
          width: d.width ?? null,
          height: d.height ?? null,
          duration_seconds: d.duration_seconds ?? null,
          alt_text: d.alt_text || null,
          credit: d.credit || null,
          status: d.status,
          supersedes_id: d.supersedes_id ?? null,
        })
        .select("id")
        .single(),
    );
    if (d.attach_to) {
      const { data: existing } = await supabase.from("content_media").select("position").eq("content_item_id", d.attach_to).order("position", { ascending: false }).limit(1);
      if (d.supersedes_id) {
        // Neue Version ersetzt die alte Zuordnung an derselben Position
        const { data: old } = await supabase.from("content_media").select("id, position, role").eq("content_item_id", d.attach_to).eq("media_asset_id", d.supersedes_id).maybeSingle();
        if (old) {
          check(await supabase.from("content_media").delete().eq("id", old.id));
          check(await supabase.from("content_media").insert({ content_item_id: d.attach_to, media_asset_id: created.id, position: old.position, role: old.role }));
        } else {
          check(await supabase.from("content_media").insert({ content_item_id: d.attach_to, media_asset_id: created.id, position: (existing?.[0]?.position ?? -1) + 1, role: d.role }));
        }
      } else {
        check(await supabase.from("content_media").insert({ content_item_id: d.attach_to, media_asset_id: created.id, position: (existing?.[0]?.position ?? -1) + 1, role: d.role }));
      }
    }
    refresh();
    return { id: created.id };
  }, "Datei hochgeladen.");
}

const linkSchema = z.object({
  dossier_id: uuid,
  external_url: z.string().trim().regex(/^https:\/\/\S+$/i, "Bitte einen vollständigen https-Link angeben."),
  file_name: requiredText("Bezeichnung", 255),
  kind: z.enum(["bild", "video", "dokument"]),
  width: z.string().optional().transform((v) => (v ? Number(v) : null)),
  height: z.string().optional().transform((v) => (v ? Number(v) : null)),
  alt_text: optionalText(1000),
  credit: optionalText(500),
  rights_note: optionalText(2000),
  status: z.enum(["entwurf", "final"]).default("entwurf"),
  attach_to: optionalUuid,
});

export async function addMediaLink(_: ActionResult<null> | null, formData: FormData): Promise<ActionResult<null>> {
  return runAction(async () => {
    await assertProfile();
    const d = linkSchema.parse(formToObject(formData));
    const supabase = await createClient();
    const { data: dossier } = await supabase.from("dossiers").select("client_id").eq("id", d.dossier_id).single();
    const created = check(
      await supabase
        .from("media_assets")
        .insert({
          dossier_id: d.dossier_id, client_id: dossier?.client_id ?? null, kind: d.kind, source: "link", external_url: d.external_url,
          file_name: d.file_name, width: d.width, height: d.height, alt_text: d.alt_text, credit: d.credit, rights_note: d.rights_note, status: d.status,
        })
        .select("id")
        .single(),
    );
    if (d.attach_to) {
      check(await supabase.from("content_media").insert({ content_item_id: d.attach_to, media_asset_id: created.id }));
    }
    refresh();
    return null;
  }, "Link gespeichert.");
}

const updateSchema = z.object({
  id: uuid,
  title: optionalText(200),
  alt_text: optionalText(1000),
  credit: optionalText(500),
  rights_note: optionalText(2000),
  internal_note: optionalText(2000),
  status: z.enum(["entwurf", "final", "veraltet"]),
  width: z.string().optional().transform((v) => (v ? Number(v) : null)),
  height: z.string().optional().transform((v) => (v ? Number(v) : null)),
});

export async function updateMedia(_: ActionResult<null> | null, formData: FormData): Promise<ActionResult<null>> {
  return runAction(async () => {
    await assertProfile();
    const { id, ...d } = updateSchema.parse(formToObject(formData));
    const supabase = await createClient();
    const current = check(await supabase.from("media_assets").select("source, width, height").eq("id", id).single());
    // Maße eines Uploads stammen aus der Datei – nur bei Links manuell pflegbar
    const dims = current.source === "link" ? { width: d.width, height: d.height } : {};
    check(await supabase.from("media_assets").update({ ...d, ...dims, width: dims.width ?? current.width, height: dims.height ?? current.height }).eq("id", id));
    refresh();
    return null;
  }, "Medium gespeichert.");
}

export async function deleteMedia(id: string): Promise<ActionResult<null>> {
  return runAction(async () => {
    await assertEditor();
    const supabase = await createClient();
    const { count } = await supabase.from("content_media").select("id", { count: "exact", head: true }).eq("media_asset_id", uuid.parse(id));
    if (count) throw new Error("Das Medium ist noch Inhalten zugeordnet. Bitte zuerst die Zuordnung entfernen oder als „veraltet“ kennzeichnen.");
    const asset = check(await supabase.from("media_assets").select("storage_path").eq("id", id).single());
    check(await supabase.from("media_assets").delete().eq("id", id));
    if (asset.storage_path) await supabase.storage.from("media").remove([asset.storage_path]);
    refresh();
    return null;
  }, "Medium gelöscht.");
}

export async function getMediaUrl(id: string): Promise<ActionResult<{ url: string }>> {
  return runAction(async () => {
    await assertProfile();
    const supabase = await createClient();
    const asset = check(await supabase.from("media_assets").select("storage_path, external_url, file_name").eq("id", uuid.parse(id)).single());
    if (asset.external_url) return { url: asset.external_url };
    const signed = check(await supabase.storage.from("media").createSignedUrl(asset.storage_path!, 600, { download: asset.file_name }));
    return { url: signed.signedUrl };
  });
}
