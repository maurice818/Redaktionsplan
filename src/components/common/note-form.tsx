"use client";

import { ActionForm, SubmitButton, TextareaField } from "./form";
import { addNote } from "@/actions/dossiers";

export function NoteForm({ dossierId, clientId }: { dossierId?: string; clientId?: string }) {
  return (
    <ActionForm action={addNote} resetOnSuccess className="grid gap-2">
      {dossierId && <input type="hidden" name="dossier_id" value={dossierId} />}
      {clientId && <input type="hidden" name="client_id" value={clientId} />}
      <TextareaField name="text" label="Notiz hinzufügen" rows={2} placeholder="z. B. Telefonat mit Kundin – Wunschtermin Mitte Oktober" />
      <div className="flex justify-end">
        <SubmitButton size="sm" variant="outline">Notiz speichern</SubmitButton>
      </div>
    </ActionForm>
  );
}
