"use client";

import { useRouter } from "next/navigation";
import { FilePlus2, Pencil, Plus, Trash2, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ActionButton } from "@/components/common/action-button";
import { DialogForm } from "@/components/common/dialog-form";
import { CheckboxField, FormGrid, InputField, SelectField, TextareaField, type Option } from "@/components/common/form";
import {
  addContractYear, addDeliverable, bookMembership, correctDeliverable, deleteContact, saveContact, updateClient, updateContract,
} from "@/actions/clients";
import { createDossierFromDeliverable } from "@/actions/dossiers";
import { CLIENT_STATUS, CONTRACT_STATUS, DELIVERABLE_STATUS } from "@/lib/labels";
import type { ActionResult } from "@/lib/action-result";

const statusOptions = (map: Record<string, { label: string }>): Option[] => Object.entries(map).map(([value, d]) => ({ value, label: d.label }));

export interface ClientData {
  id: string;
  name: string;
  legal_name: string | null;
  category: string | null;
  website: string | null;
  email: string | null;
  phone: string | null;
  street: string | null;
  postal_code: string | null;
  city: string | null;
  country: string | null;
  owner_id: string | null;
  status: string;
  notes: string | null;
  links: { label: string; url: string }[];
}

export function EditClientDialog({ client, people }: { client: ClientData; people: Option[] }) {
  return (
    <DialogForm trigger={<Button variant="outline"><Pencil /> Stammdaten bearbeiten</Button>} title="Stammdaten bearbeiten" action={updateClient} wide>
      <input type="hidden" name="id" value={client.id} />
      <FormGrid>
        <InputField name="name" label="Firmenname" defaultValue={client.name} required wrapperClassName="sm:col-span-2" />
        <InputField name="legal_name" label="Rechtlicher Name" defaultValue={client.legal_name ?? ""} />
        <InputField name="category" label="Kategorie" defaultValue={client.category ?? ""} />
        <InputField name="website" label="Website" defaultValue={client.website ?? ""} placeholder="https://" />
        <InputField name="email" label="E-Mail" type="email" defaultValue={client.email ?? ""} />
        <InputField name="phone" label="Telefon" defaultValue={client.phone ?? ""} />
        <InputField name="street" label="Straße" defaultValue={client.street ?? ""} />
        <InputField name="postal_code" label="PLZ" defaultValue={client.postal_code ?? ""} />
        <InputField name="city" label="Ort" defaultValue={client.city ?? ""} />
        <InputField name="country" label="Land" defaultValue={client.country ?? ""} />
        <SelectField name="owner_id" label="Zuständige interne Person" defaultValue={client.owner_id ?? ""} placeholder="Nicht zugewiesen" options={people} />
        <SelectField name="status" label="Status" defaultValue={client.status} options={statusOptions(CLIENT_STATUS)} />
      </FormGrid>
      <TextareaField
        name="links"
        label="Relevante Links"
        help="Je Zeile: Bezeichnung | https://…"
        defaultValue={client.links.map((l) => `${l.label} | ${l.url}`).join("\n")}
        rows={3}
      />
      <TextareaField name="notes" label="Notizen" defaultValue={client.notes ?? ""} rows={4} />
    </DialogForm>
  );
}

export interface ContactData {
  id: string;
  first_name: string | null;
  last_name: string;
  position: string | null;
  email: string | null;
  phone: string | null;
  is_primary: boolean;
  can_approve: boolean;
  notes: string | null;
}

export function ContactDialog({ clientId, contact }: { clientId: string; contact?: ContactData }) {
  return (
    <DialogForm
      trigger={contact ? <Button variant="ghost" size="icon-sm" aria-label="Ansprechpartner bearbeiten"><Pencil /></Button> : <Button variant="outline" size="sm"><Plus /> Ansprechpartner</Button>}
      title={contact ? "Ansprechpartner bearbeiten" : "Ansprechpartner hinzufügen"}
      action={saveContact}
    >
      <input type="hidden" name="client_id" value={clientId} />
      {contact && <input type="hidden" name="id" value={contact.id} />}
      <FormGrid>
        <InputField name="first_name" label="Vorname" defaultValue={contact?.first_name ?? ""} />
        <InputField name="last_name" label="Nachname" defaultValue={contact?.last_name ?? ""} required />
        <InputField name="position" label="Funktion" defaultValue={contact?.position ?? ""} />
        <InputField name="email" label="E-Mail" type="email" defaultValue={contact?.email ?? ""} />
        <InputField name="phone" label="Telefon" defaultValue={contact?.phone ?? ""} />
      </FormGrid>
      <CheckboxField name="is_primary" label="Hauptansprechpartner" defaultChecked={contact?.is_primary} />
      <CheckboxField name="can_approve" label="Darf Inhalte freigeben" defaultChecked={contact?.can_approve ?? true} />
      <TextareaField name="notes" label="Notizen" defaultValue={contact?.notes ?? ""} rows={2} />
    </DialogForm>
  );
}

export function DeleteContactButton({ id, name }: { id: string; name: string }) {
  return (
    <ActionButton
      action={() => deleteContact(id)}
      variant="ghost"
      size="icon-sm"
      title="Ansprechpartner entfernen"
      confirm={{ title: `${name} entfernen?`, description: "Der Ansprechpartner wird aus der Kundenakte entfernt.", confirmLabel: "Entfernen", destructive: true }}
    >
      <Trash2 />
    </ActionButton>
  );
}

export function BookMembershipDialog({ clientId, templates, people, today, defaultEnd }: { clientId: string; templates: Option[]; people: Option[]; today: string; defaultEnd: string }) {
  return (
    <DialogForm
      trigger={<Button size="sm"><Plus /> Paket buchen</Button>}
      title="Membership buchen"
      description="Der aktuelle Stand der Paketvorlage wird im Vertrag gespeichert und erzeugt je Vertragsjahr die zugesagten Leistungen."
      action={bookMembership}
      submitLabel="Buchen & Leistungen erzeugen"
    >
      <input type="hidden" name="client_id" value={clientId} />
      <SelectField name="template_id" label="Paket" options={templates} required />
      <FormGrid>
        <InputField name="start_date" type="date" label="Vertragsbeginn" defaultValue={today} required />
        <InputField name="end_date" type="date" label="Vertragsende" defaultValue={defaultEnd} required />
        <InputField name="renewal_date" type="date" label="Verlängerung / Kündigungsfrist" />
        <SelectField name="owner_id" label="Zuständig" placeholder="Wie beim Kunden" options={people} />
      </FormGrid>
      <CheckboxField name="auto_renew" label="Verlängert sich automatisch" />
      <TextareaField name="notes" label="Notizen zum Vertrag" rows={2} />
    </DialogForm>
  );
}

export function ContractDialog({ contract, people }: { contract: { id: string; status: string; renewal_date: string | null; owner_id: string | null; auto_renew: boolean; notes: string | null }; people: Option[] }) {
  return (
    <DialogForm trigger={<Button variant="ghost" size="sm"><Pencil /> Vertrag</Button>} title="Vertrag bearbeiten" action={updateContract}>
      <input type="hidden" name="id" value={contract.id} />
      <FormGrid>
        <SelectField name="status" label="Status" defaultValue={contract.status} options={statusOptions(CONTRACT_STATUS)} />
        <InputField name="renewal_date" type="date" label="Verlängerung / Kündigungsfrist" defaultValue={contract.renewal_date ?? ""} />
        <SelectField name="owner_id" label="Zuständig" defaultValue={contract.owner_id ?? ""} placeholder="Nicht zugewiesen" options={people} />
      </FormGrid>
      <CheckboxField name="auto_renew" label="Verlängert sich automatisch" defaultChecked={contract.auto_renew} />
      <TextareaField name="notes" label="Notizen" defaultValue={contract.notes ?? ""} rows={3} />
      <p className="text-xs text-muted-foreground">Der gebuchte Leistungsumfang ist unveränderlich. Zusatzleistungen und Korrekturen erfassen Sie in der Leistungsübersicht.</p>
    </DialogForm>
  );
}

export function AddYearButton({ contractId }: { contractId: string }) {
  return (
    <ActionButton
      action={() => addContractYear(contractId)}
      variant="ghost"
      size="sm"
      confirm={{
        title: "Weiteres Vertragsjahr anlegen?",
        description: "Das Vertragsende wird um ein Jahr verlängert. Die Leistungen werden nach dem gebuchten Stand dieses Vertrags erzeugt – nicht nach der aktuellen Vorlage.",
        confirmLabel: "Vertragsjahr anlegen",
      }}
    >
      <Plus /> Vertragsjahr
    </ActionButton>
  );
}

export function AddDeliverableDialog({
  clientId,
  contracts,
  serviceTypes,
  people,
}: {
  clientId: string;
  contracts: { id: string; label: string; years: { id: string; label: string }[] }[];
  serviceTypes: Option[];
  people: Option[];
}) {
  const yearOptions: Option[] = contracts.flatMap((c) => c.years.map((y) => ({ value: `${c.id}|${y.id}`, label: `${c.label} – ${y.label}` })));
  return (
    <DialogForm
      trigger={<Button variant="outline" size="sm"><Plus /> Zusatzleistung / Korrektur</Button>}
      title="Leistung erfassen"
      description="Zusatzbuchungen und Korrekturen werden mit Begründung im Änderungsprotokoll gespeichert."
      action={async (prev: ActionResult<null> | null, formData: FormData) => {
        const target = String(formData.get("target") ?? "");
        const [contractId, yearId] = target.split("|");
        formData.set("contract_id", contractId ?? "");
        formData.set("contract_year_id", yearId ?? "");
        return addDeliverable(prev, formData);
      }}
    >
      <input type="hidden" name="client_id" value={clientId} />
      <SelectField name="target" label="Vertrag / Vertragsjahr" placeholder="Ohne Vertragszuordnung" options={yearOptions} />
      <SelectField name="service_type_id" label="Leistungstyp" options={serviceTypes} required />
      <InputField name="title" label="Bezeichnung" required placeholder="z. B. Zusätzlicher Newsletter-Beitrag" />
      <FormGrid>
        <InputField name="quantity" type="number" min={1} max={50} label="Stückzahl" help="Leer lassen = ohne feste Stückzahl" />
        <SelectField name="source" label="Art" defaultValue="zusatzbuchung" options={[
          { value: "zusatzbuchung", label: "Zusatzbuchung" },
          { value: "korrektur", label: "Korrektur (z. B. Kulanz)" },
          { value: "manuell", label: "Manuell erfasst" },
        ]} />
        <InputField name="due_date" type="date" label="Fälligkeit" />
        <SelectField name="owner_id" label="Verantwortlich" placeholder="Nicht zugewiesen" options={people} />
      </FormGrid>
      <TextareaField name="reason" label="Begründung" required rows={2} />
      <TextareaField name="description" label="Beschreibung" rows={2} />
    </DialogForm>
  );
}

export function CorrectDeliverableDialog({
  unit,
  people,
}: {
  unit: { id: string; title: string; status: string; ownerId: string | null; dueDate: string | null; evidenceUrl: string | null; fulfillmentNote: string | null; cancelReason: string | null };
  people: Option[];
}) {
  return (
    <DialogForm
      trigger={<Button variant="ghost" size="icon-sm" aria-label={`Leistung „${unit.title}“ bearbeiten`}><Wrench /></Button>}
      title="Leistung bearbeiten"
      description="Jede Änderung wird mit Begründung protokolliert. Veröffentlichte Inhalte markieren Leistungen automatisch als erbracht."
      action={correctDeliverable}
    >
      <input type="hidden" name="id" value={unit.id} />
      <InputField name="title" label="Bezeichnung" defaultValue={unit.title} />
      <FormGrid>
        <SelectField name="status" label="Status" defaultValue={unit.status} options={statusOptions(DELIVERABLE_STATUS)} />
        <SelectField name="owner_id" label="Verantwortlich" defaultValue={unit.ownerId ?? ""} placeholder="Nicht zugewiesen" options={people} />
        <InputField name="due_date" type="date" label="Fälligkeit" defaultValue={unit.dueDate ?? ""} />
        <InputField name="evidence_url" label="Erfüllungsnachweis (Link)" defaultValue={unit.evidenceUrl ?? ""} placeholder="https://" />
      </FormGrid>
      <TextareaField name="fulfillment_note" label="Notiz zum Nachweis" defaultValue={unit.fulfillmentNote ?? ""} rows={2} />
      <TextareaField name="cancel_reason" label="Grund, falls die Leistung entfällt" defaultValue={unit.cancelReason ?? ""} rows={2} />
      <TextareaField name="reason" label="Begründung der Änderung" required rows={2} />
    </DialogForm>
  );
}

export function CreateDossierButton({ deliverableId, existingDossierId }: { deliverableId: string; existingDossierId?: string }) {
  const router = useRouter();
  if (existingDossierId) {
    return <Button variant="ghost" size="sm" onClick={() => router.push(`/beitraege/${existingDossierId}`)}>Zur Akte</Button>;
  }
  return (
    <ActionButton action={() => createDossierFromDeliverable(deliverableId)} variant="outline" size="sm" onDone={(d) => router.push(`/beitraege/${d.dossierId}`)}>
      <FilePlus2 /> Akte anlegen
    </ActionButton>
  );
}
