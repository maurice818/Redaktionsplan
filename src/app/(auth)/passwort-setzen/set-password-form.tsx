"use client";

import { ActionForm, FormActions, InputField, SubmitButton } from "@/components/common/form";
import { setPassword } from "@/actions/auth";

export function SetPasswordForm({ needsName }: { needsName: boolean }) {
  return (
    <ActionForm action={setPassword} className="mt-6 grid gap-4" successToast={false}>
      {needsName && <InputField name="full_name" label="Ihr Name" autoComplete="name" required />}
      <InputField name="password" type="password" label="Neues Passwort" autoComplete="new-password" required />
      <InputField name="confirm" type="password" label="Passwort wiederholen" autoComplete="new-password" required />
      <FormActions>
        <SubmitButton className="w-full" pendingText="Wird gespeichert …">Passwort speichern</SubmitButton>
      </FormActions>
    </ActionForm>
  );
}
