"use client";

import { Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DialogForm } from "@/components/common/dialog-form";
import { FormGrid, InputField, SelectField, TextareaField, type Option } from "@/components/common/form";
import { saveTask } from "@/actions/tasks";
import { TASK_PRIORITY, TASK_STATUS, TASK_TYPE_LABELS } from "@/lib/labels";

export interface TaskFormData {
  id?: string;
  title?: string;
  description?: string | null;
  task_type?: string;
  status?: string;
  priority?: string;
  assignee_id?: string | null;
  due_date?: string | null;
  dossier_id?: string | null;
  content_item_id?: string | null;
  client_id?: string | null;
  campaign_id?: string | null;
}

export function TaskDialog({
  task,
  people,
  trigger,
  context,
}: {
  task?: TaskFormData;
  people: Option[];
  trigger?: React.ReactNode;
  context?: { dossierId?: string; contentItemId?: string; clientId?: string; campaignId?: string };
}) {
  const t = task ?? {};
  return (
    <DialogForm
      trigger={
        trigger ??
        (task?.id ? (
          <Button variant="ghost" size="icon-sm" aria-label="Aufgabe bearbeiten"><Pencil /></Button>
        ) : (
          <Button size="sm"><Plus /> Aufgabe</Button>
        ))
      }
      title={task?.id ? "Aufgabe bearbeiten" : "Neue Aufgabe"}
      action={saveTask}
      wide
    >
      {t.id && <input type="hidden" name="id" value={t.id} />}
      <input type="hidden" name="dossier_id" value={t.dossier_id ?? context?.dossierId ?? ""} />
      <input type="hidden" name="content_item_id" value={t.content_item_id ?? context?.contentItemId ?? ""} />
      <input type="hidden" name="client_id" value={t.client_id ?? context?.clientId ?? ""} />
      <input type="hidden" name="campaign_id" value={t.campaign_id ?? context?.campaignId ?? ""} />
      <InputField name="title" label="Titel" defaultValue={t.title ?? ""} required autoFocus />
      <TextareaField name="description" label="Beschreibung" defaultValue={t.description ?? ""} rows={3} />
      <FormGrid>
        <SelectField name="assignee_id" label="Verantwortlich" defaultValue={t.assignee_id ?? ""} placeholder="Mir zuweisen" options={people} />
        <InputField name="due_date" type="date" label="Fällig am" defaultValue={t.due_date ?? ""} />
        <SelectField name="priority" label="Priorität" defaultValue={t.priority ?? "normal"} options={Object.entries(TASK_PRIORITY).map(([value, d]) => ({ value, label: d.label }))} />
        <SelectField name="status" label="Status" defaultValue={t.status ?? "offen"} options={Object.entries(TASK_STATUS).map(([value, d]) => ({ value, label: d.label }))} help="„Wartet auf Kunde“ zählt nicht als intern überfällig." />
        <SelectField name="task_type" label="Art" defaultValue={t.task_type ?? "allgemein"} options={Object.entries(TASK_TYPE_LABELS).map(([value, label]) => ({ value, label }))} />
      </FormGrid>
    </DialogForm>
  );
}
