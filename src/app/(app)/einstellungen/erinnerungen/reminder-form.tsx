"use client";

import { ActionForm, CheckboxField, FormActions, FormGrid, InputField, SubmitButton } from "@/components/common/form";
import { saveReminderRule } from "@/actions/settings";

export function ReminderForm({
  rule,
  dayLabel,
  editable,
}: {
  rule: { key: string; is_active: boolean; days: number; repeat_days: number | null; max_reminders: number; notify_customer: boolean; notify_team: boolean; customer_template_key: string | null };
  dayLabel: string;
  editable: boolean;
}) {
  return (
    <ActionForm action={saveReminderRule} className="grid gap-3">
      <input type="hidden" name="key" value={rule.key} />
      <FormGrid className="sm:grid-cols-3">
        <InputField name="days" type="number" min={0} label={dayLabel} defaultValue={rule.days} readOnly={!editable} />
        <InputField name="repeat_days" type="number" min={1} label="Wiederholen alle … Tage" defaultValue={rule.repeat_days ?? ""} help="Leer = keine Wiederholung" readOnly={!editable} />
        <InputField name="max_reminders" type="number" min={1} max={10} label="Höchstens … Erinnerungen" defaultValue={rule.max_reminders} readOnly={!editable} />
      </FormGrid>
      <div className="flex flex-wrap gap-6">
        <CheckboxField name="is_active" label="Regel aktiv" defaultChecked={rule.is_active} disabled={!editable} />
        {rule.customer_template_key && <CheckboxField name="notify_customer" label="Kunden per E-Mail erinnern" defaultChecked={rule.notify_customer} disabled={!editable} />}
        <CheckboxField name="notify_team" label="Team benachrichtigen / Aufgabe anlegen" defaultChecked={rule.notify_team} disabled={!editable} />
      </div>
      {editable && <FormActions><SubmitButton size="sm">Speichern</SubmitButton></FormActions>}
    </ActionForm>
  );
}
