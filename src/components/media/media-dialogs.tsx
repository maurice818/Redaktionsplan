"use client";

import { Link2, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ActionButton } from "@/components/common/action-button";
import { DialogForm } from "@/components/common/dialog-form";
import { CheckboxField, FormGrid, InputField, SelectField, TextareaField } from "@/components/common/form";
import { addMediaLink, deleteMedia, updateMedia } from "@/actions/media";
import { MEDIA_STATUS } from "@/lib/labels";

export function AddLinkDialog({ dossierId, attachTo }: { dossierId: string; attachTo?: string }) {
  return (
    <DialogForm
      trigger={<Button variant="outline" size="sm"><Link2 /> Drive-Link hinzufügen</Button>}
      title="Datei per Link hinzufügen"
      description="Z. B. Google-Drive-Freigabe. Für die automatische Veröffentlichung per API muss das Medium hochgeladen sein; Links eignen sich für die manuelle Veröffentlichung und Vorschau."
      action={addMediaLink}
    >
      <input type="hidden" name="dossier_id" value={dossierId} />
      {attachTo && <input type="hidden" name="attach_to" value={attachTo} />}
      <InputField name="external_url" label="Link (https://…)" required />
      <FormGrid>
        <InputField name="file_name" label="Bezeichnung" required placeholder="z. B. Hero-Bild Terrasse" />
        <SelectField name="kind" label="Art" defaultValue="bild" options={[{ value: "bild", label: "Bild" }, { value: "video", label: "Video" }, { value: "dokument", label: "Dokument" }]} />
        <InputField name="width" type="number" label="Breite (px, optional)" help="Für die Formatprüfung" />
        <InputField name="height" type="number" label="Höhe (px, optional)" />
      </FormGrid>
      <TextareaField name="alt_text" label="Alt-Text" rows={2} />
      <FormGrid>
        <InputField name="credit" label="Bildnachweis / Urheber" />
        <InputField name="rights_note" label="Nutzungsrechte" />
      </FormGrid>
      <CheckboxField name="status" value="final" label="Als finale Version kennzeichnen" />
    </DialogForm>
  );
}

export interface MediaEditData {
  id: string;
  title: string | null;
  file_name: string;
  source: string;
  alt_text: string | null;
  credit: string | null;
  rights_note: string | null;
  internal_note: string | null;
  status: string;
  width: number | null;
  height: number | null;
}

export function EditMediaDialog({ media }: { media: MediaEditData }) {
  return (
    <DialogForm
      trigger={<Button variant="ghost" size="icon-sm" aria-label={`${media.file_name} bearbeiten`}><Pencil /></Button>}
      title="Medium bearbeiten"
      description={media.file_name}
      action={updateMedia}
    >
      <input type="hidden" name="id" value={media.id} />
      <InputField name="title" label="Titel (intern)" defaultValue={media.title ?? ""} />
      <TextareaField name="alt_text" label="Alt-Text" defaultValue={media.alt_text ?? ""} rows={2} />
      <FormGrid>
        <InputField name="credit" label="Bildnachweis / Urheber" defaultValue={media.credit ?? ""} />
        <SelectField name="status" label="Status" defaultValue={media.status} options={Object.entries(MEDIA_STATUS).map(([value, d]) => ({ value, label: d.label }))} />
        {media.source === "link" && (
          <>
            <InputField name="width" type="number" label="Breite (px)" defaultValue={media.width ?? ""} />
            <InputField name="height" type="number" label="Höhe (px)" defaultValue={media.height ?? ""} />
          </>
        )}
      </FormGrid>
      <TextareaField name="rights_note" label="Angaben zu Bildrechten" defaultValue={media.rights_note ?? ""} rows={2} />
      <TextareaField name="internal_note" label="Interne Notiz" defaultValue={media.internal_note ?? ""} rows={2} />
    </DialogForm>
  );
}

export function DeleteMediaButton({ id, name }: { id: string; name: string }) {
  return (
    <ActionButton
      action={() => deleteMedia(id)}
      variant="ghost"
      size="icon-sm"
      title="Löschen"
      confirm={{ title: `„${name}“ löschen?`, description: "Die Datei wird dauerhaft aus dem Speicher entfernt. Zugeordnete Medien können nicht gelöscht werden.", confirmLabel: "Löschen", destructive: true }}
    >
      <Trash2 />
    </ActionButton>
  );
}
