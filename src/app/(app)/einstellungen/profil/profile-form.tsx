"use client";

import Link from "next/link";
import { ActionForm, FormActions, FormGrid, InputField, SubmitButton } from "@/components/common/form";
import { updateOwnProfile } from "@/actions/settings";

export function ProfileForm({ fullName, jobTitle }: { fullName: string; jobTitle: string }) {
  return (
    <ActionForm action={updateOwnProfile} className="grid gap-4">
      <FormGrid>
        <InputField name="full_name" label="Name" defaultValue={fullName} required />
        <InputField name="job_title" label="Funktion" defaultValue={jobTitle} />
      </FormGrid>
      <FormActions>
        <Link href="/passwort-setzen" className="mr-auto text-sm text-muted-foreground underline-offset-4 hover:underline">Passwort ändern</Link>
        <SubmitButton>Speichern</SubmitButton>
      </FormActions>
    </ActionForm>
  );
}
