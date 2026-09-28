"use client";

import { ActionForm, FormActions, InputField, SubmitButton } from "@/components/common/form";
import { requestPasswordReset } from "@/actions/auth";

export function ResetForm() {
  return (
    <ActionForm action={requestPasswordReset} className="mt-6 grid gap-4" resetOnSuccess>
      <InputField name="email" type="email" label="E-Mail-Adresse" autoComplete="email" required />
      <FormActions>
        <SubmitButton className="w-full" pendingText="Wird gesendet …">Link senden</SubmitButton>
      </FormActions>
    </ActionForm>
  );
}
