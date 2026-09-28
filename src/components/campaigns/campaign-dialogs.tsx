"use client";

import { useRouter } from "next/navigation";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ActionButton } from "@/components/common/action-button";
import { DialogForm } from "@/components/common/dialog-form";
import { CheckboxField, FormGrid, InputField, SelectField, TextareaField, type Option } from "@/components/common/form";
import { deleteCampaign, deleteIdea, saveCampaign, saveIdea } from "@/actions/campaigns";
import { CAMPAIGN_STATUS, IDEA_STATUS } from "@/lib/labels";

export interface CampaignData {
  id: string;
  name: string;
  goal: string | null;
  description: string | null;
  start_date: string | null;
  end_date: string | null;
  owner_id: string | null;
  status: string;
  topics: string[];
}

export function CampaignDialog({ campaign, people }: { campaign?: CampaignData; people: Option[] }) {
  const router = useRouter();
  return (
    <DialogForm
      trigger={campaign ? <Button variant="outline"><Pencil /> Bearbeiten</Button> : <Button><Plus /> Neue Kampagne</Button>}
      title={campaign ? "Kampagne bearbeiten" : "Neue Kampagne"}
      action={saveCampaign}
      wide
      onSuccess={(d) => !campaign && router.push(`/kampagnen/${d.id}`)}
    >
      {campaign && <input type="hidden" name="id" value={campaign.id} />}
      <InputField name="name" label="Name" defaultValue={campaign?.name ?? ""} required placeholder="z. B. MEET GERMANY SUMMIT 2027" />
      <TextareaField name="goal" label="Ziel" defaultValue={campaign?.goal ?? ""} rows={2} />
      <FormGrid>
        <InputField name="start_date" type="date" label="Beginn" defaultValue={campaign?.start_date ?? ""} />
        <InputField name="end_date" type="date" label="Ende" defaultValue={campaign?.end_date ?? ""} />
        <SelectField name="owner_id" label="Verantwortlich" defaultValue={campaign?.owner_id ?? ""} placeholder="Nicht zugewiesen" options={people} />
        <SelectField name="status" label="Status" defaultValue={campaign?.status ?? "planung"} options={Object.entries(CAMPAIGN_STATUS).map(([value, d]) => ({ value, label: d.label }))} />
      </FormGrid>
      <InputField name="topics" label="Themen" defaultValue={campaign?.topics.join(", ") ?? ""} help="Mit Komma trennen, z. B. Speaker, Aussteller, Programm" />
      <TextareaField name="description" label="Beschreibung" defaultValue={campaign?.description ?? ""} rows={3} />
    </DialogForm>
  );
}

export function DeleteCampaignButton({ id }: { id: string }) {
  const router = useRouter();
  return (
    <ActionButton action={() => deleteCampaign(id)} variant="ghost" onDone={() => router.push("/kampagnen")} confirm={{ title: "Kampagne löschen?", description: "Zugeordnete Beitragsakten bleiben erhalten und verlieren nur die Kampagnenzuordnung.", confirmLabel: "Löschen", destructive: true }}>
      <Trash2 /> Löschen
    </ActionButton>
  );
}

export interface IdeaData {
  id: string;
  title: string;
  description: string | null;
  tags: string[];
  campaign_id: string | null;
  client_id: string | null;
  status: string;
  is_reusable: boolean;
}

export function IdeaDialog({ idea, campaigns, clients, defaultCampaign }: { idea?: IdeaData; campaigns: Option[]; clients: Option[]; defaultCampaign?: string }) {
  return (
    <DialogForm
      trigger={idea ? <Button variant="ghost" size="icon-sm" aria-label="Idee bearbeiten"><Pencil /></Button> : <Button variant="outline" size="sm"><Plus /> Idee</Button>}
      title={idea ? "Idee bearbeiten" : "Neue Themenidee"}
      action={saveIdea}
    >
      {idea && <input type="hidden" name="id" value={idea.id} />}
      <InputField name="title" label="Titel" defaultValue={idea?.title ?? ""} required />
      <TextareaField name="description" label="Beschreibung" defaultValue={idea?.description ?? ""} rows={3} />
      <InputField name="tags" label="Schlagworte" defaultValue={idea?.tags.join(", ") ?? ""} help="Mit Komma trennen" />
      <FormGrid>
        <SelectField name="campaign_id" label="Kampagne" defaultValue={idea?.campaign_id ?? defaultCampaign ?? ""} placeholder="Keine" options={campaigns} />
        <SelectField name="client_id" label="Kunde (optional)" defaultValue={idea?.client_id ?? ""} placeholder="Kein Kunde" options={clients} />
        <SelectField name="status" label="Status" defaultValue={idea?.status ?? "neu"} options={Object.entries(IDEA_STATUS).map(([value, d]) => ({ value, label: d.label }))} />
      </FormGrid>
      <CheckboxField name="is_reusable" label="Wiederverwendbare Themenidee" help="Bleibt nach der Umsetzung im Ideenspeicher verfügbar (z. B. wiederkehrende Formate)." defaultChecked={idea?.is_reusable} />
    </DialogForm>
  );
}

export function DeleteIdeaButton({ id }: { id: string }) {
  return (
    <ActionButton action={() => deleteIdea(id)} variant="ghost" size="icon-sm" title="Idee löschen" confirm={{ title: "Idee löschen?", confirmLabel: "Löschen", destructive: true }}>
      <Trash2 />
    </ActionButton>
  );
}
