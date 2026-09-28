"use client";

import { Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DialogForm } from "@/components/common/dialog-form";
import { CheckboxField, FormGrid, InputField, SelectField, TextareaField } from "@/components/common/form";
import { saveFormatRule } from "@/actions/settings";
import type { FormatRule } from "@/lib/domain/types";
import { CHANNEL_LABELS, POST_FORMAT_LABELS } from "@/lib/labels";

export function FormatDialog({ rule, disabled }: { rule?: FormatRule; disabled?: boolean }) {
  if (disabled) return null;
  const n = (v: number | null | undefined) => (v === null || v === undefined ? "" : String(v));
  return (
    <DialogForm
      trigger={rule ? <Button variant="ghost" size="icon-sm" aria-label={`${rule.label} bearbeiten`}><Pencil /></Button> : <Button variant="outline" size="sm"><Plus /> Regel</Button>}
      title={rule ? "Formatregel bearbeiten" : "Neue Formatregel"}
      description="Harte Grenzen führen zu Fehlern, Empfehlungen zu Warnungen. Bitte Quelle und Prüfdatum aktuell halten – Plattformvorgaben ändern sich."
      action={saveFormatRule}
      wide
    >
      {rule && <input type="hidden" name="id" value={rule.id} />}
      <FormGrid className="sm:grid-cols-3">
        <SelectField name="channel" label="Kanal" defaultValue={rule?.channel ?? "instagram"} options={Object.entries(CHANNEL_LABELS).map(([value, label]) => ({ value, label }))} />
        <SelectField name="post_format" label="Format" defaultValue={rule?.post_format ?? "feed_bild"} options={Object.entries(POST_FORMAT_LABELS).map(([value, label]) => ({ value, label }))} />
        <SelectField name="media_kind" label="Medienart" defaultValue={rule?.media_kind ?? "bild"} options={[{ value: "bild", label: "Bild" }, { value: "video", label: "Video" }, { value: "keins", label: "Kein Medium" }]} />
      </FormGrid>
      <InputField name="label" label="Bezeichnung" defaultValue={rule?.label ?? ""} required />
      <InputField name="allowed_mime_types" label="Erlaubte Dateitypen (MIME, kommagetrennt)" defaultValue={rule?.allowed_mime_types.join(", ") ?? ""} placeholder="image/jpeg, image/png" />
      <FormGrid className="sm:grid-cols-4">
        <InputField name="max_file_size_mb" label="Max. MB" defaultValue={n(rule?.max_file_size_mb)} inputMode="decimal" />
        <InputField name="min_width" label="Min. Breite px" defaultValue={n(rule?.min_width)} inputMode="numeric" />
        <InputField name="max_width" label="Max. Breite px" defaultValue={n(rule?.max_width)} inputMode="numeric" />
        <InputField name="max_pixels" label="Max. Pixel" defaultValue={n(rule?.max_pixels)} inputMode="numeric" />
        <InputField name="recommended_width" label="Empf. Breite" defaultValue={n(rule?.recommended_width)} inputMode="numeric" />
        <InputField name="recommended_height" label="Empf. Höhe" defaultValue={n(rule?.recommended_height)} inputMode="numeric" />
        <InputField name="min_aspect_ratio" label="Min. Seitenverh. (B/H)" defaultValue={n(rule?.min_aspect_ratio)} inputMode="decimal" />
        <InputField name="max_aspect_ratio" label="Max. Seitenverh. (B/H)" defaultValue={n(rule?.max_aspect_ratio)} inputMode="decimal" />
        <InputField name="min_duration_seconds" label="Min. Sek." defaultValue={n(rule?.min_duration_seconds)} inputMode="decimal" />
        <InputField name="max_duration_seconds" label="Max. Sek." defaultValue={n(rule?.max_duration_seconds)} inputMode="decimal" />
        <InputField name="min_items" label="Min. Medien" defaultValue={n(rule?.min_items)} inputMode="numeric" />
        <InputField name="max_items" label="Max. Medien" defaultValue={n(rule?.max_items)} inputMode="numeric" />
        <InputField name="caption_max_length" label="Max. Zeichen" defaultValue={n(rule?.caption_max_length)} inputMode="numeric" />
        <InputField name="hashtags_max" label="Max. Hashtags" defaultValue={n(rule?.hashtags_max)} inputMode="numeric" />
      </FormGrid>
      <FormGrid>
        <InputField name="source_url" label="Quelle (offizielle Doku)" defaultValue={rule?.source_url ?? ""} />
        <InputField name="verified_at" type="date" label="Geprüft am" defaultValue={rule?.verified_at ?? ""} />
      </FormGrid>
      <TextareaField name="notes" label="Hinweise" defaultValue={rule?.notes ?? ""} rows={3} />
      <CheckboxField name="media_required" label="Medium erforderlich" defaultChecked={rule?.media_required ?? true} />
      <CheckboxField name="api_supported" label="Per Schnittstelle veröffentlichbar" defaultChecked={rule?.api_supported ?? false} help="Nur aktivieren, wenn Adapter und Plattform dieses Format unterstützen." />
      <CheckboxField name="is_active" label="Aktiv" defaultChecked={rule?.is_active ?? true} />
    </DialogForm>
  );
}
