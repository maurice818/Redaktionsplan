"use client";

import { ActionForm, FormActions, InputField, SubmitButton } from "@/components/common/form";
import { saveAppSettings } from "@/actions/settings";

export function SettingsForm({ settings }: { settings: { key: string; value: string | number; label: string | null; description: string | null }[] }) {
  return (
    <ActionForm action={saveAppSettings} className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        {settings.map((s) => (
          <InputField
            key={s.key}
            name={`s:${s.key}`}
            label={s.label ?? s.key}
            help={s.description}
            type={typeof s.value === "number" ? "number" : "text"}
            defaultValue={String(s.value ?? "")}
          />
        ))}
      </div>
      <FormActions><SubmitButton>Speichern</SubmitButton></FormActions>
    </ActionForm>
  );
}
