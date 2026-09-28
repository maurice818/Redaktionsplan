"use client";

import { Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ActionButton } from "@/components/common/action-button";
import { DialogForm } from "@/components/common/dialog-form";
import { CheckboxField, FormGrid, InputField, SelectField, TextareaField, type Option } from "@/components/common/form";
import { deleteTemplateItem, saveServiceType, saveTemplate, saveTemplateItem } from "@/actions/settings";
import { SERVICE_CATEGORY_LABELS } from "@/lib/labels";

export function TemplateDialog({ template }: { template?: { id: string; key: string; name: string; description: string | null; is_active: boolean; sort_order: number } }) {
  return (
    <DialogForm
      trigger={template ? <Button variant="ghost" size="sm"><Pencil /> Vorlage</Button> : <Button><Plus /> Neue Paketvorlage</Button>}
      title={template ? "Paketvorlage bearbeiten" : "Neue Paketvorlage"}
      description="Änderungen wirken nur auf künftige Buchungen – gebuchte Verträge behalten ihren gespeicherten Leistungsstand."
      action={saveTemplate}
    >
      {template && <input type="hidden" name="id" value={template.id} />}
      <FormGrid>
        <InputField name="name" label="Name" defaultValue={template?.name ?? ""} required />
        <InputField name="key" label="Schlüssel" defaultValue={template?.key ?? ""} required help="z. B. membership_premium" />
      </FormGrid>
      <TextareaField name="description" label="Beschreibung" defaultValue={template?.description ?? ""} rows={3} />
      <FormGrid>
        <InputField name="sort_order" type="number" label="Reihenfolge" defaultValue={template?.sort_order ?? 100} />
      </FormGrid>
      <CheckboxField name="is_active" label="Aktiv (buchbar)" defaultChecked={template?.is_active ?? true} />
    </DialogForm>
  );
}

export interface ItemData {
  id: string;
  service_type_id: string;
  label: string | null;
  quantity: number | null;
  period: string;
  per_parent_item_id: string | null;
  quantity_per_parent: number | null;
  notes: string | null;
  sort_order: number;
}

export function ItemDialog({ templateId, item, serviceTypes, siblings }: { templateId: string; item?: ItemData; serviceTypes: Option[]; siblings: Option[] }) {
  return (
    <DialogForm
      trigger={item ? <Button variant="ghost" size="icon-sm" aria-label="Position bearbeiten"><Pencil /></Button> : <Button variant="outline" size="sm"><Plus /> Position</Button>}
      title={item ? "Position bearbeiten" : "Position hinzufügen"}
      description="Ohne Stückzahl wird die Leistung als laufende Leistung (z. B. Firmenprofil) geführt – ohne automatisch erzeugte Redaktionseinheiten."
      action={saveTemplateItem}
    >
      {item && <input type="hidden" name="id" value={item.id} />}
      <input type="hidden" name="template_id" value={templateId} />
      <SelectField name="service_type_id" label="Leistungstyp" defaultValue={item?.service_type_id ?? ""} options={serviceTypes} required />
      <InputField name="label" label="Abweichende Bezeichnung (optional)" defaultValue={item?.label ?? ""} />
      <FormGrid>
        <InputField name="quantity" type="number" min={1} label="Stückzahl" defaultValue={item?.quantity ?? ""} help="Leer = ohne feste Stückzahl" />
        <SelectField name="period" label="Bezug" defaultValue={item?.period ?? "vertragsjahr"} options={[{ value: "vertragsjahr", label: "je Vertragsjahr" }, { value: "vertragslaufzeit", label: "einmal je Vertragslaufzeit" }]} />
        <SelectField name="per_parent_item_id" label="Abgeleitet aus (optional)" defaultValue={item?.per_parent_item_id ?? ""} placeholder="Nicht abgeleitet" options={siblings.filter((s) => s.value !== item?.id)} help="z. B. Social-Beitrag je Artikel" />
        <InputField name="quantity_per_parent" type="number" min={1} label="Anzahl je Eltern-Einheit" defaultValue={item?.quantity_per_parent ?? ""} />
        <InputField name="sort_order" type="number" label="Reihenfolge" defaultValue={item?.sort_order ?? 100} />
      </FormGrid>
      <TextareaField name="notes" label="Hinweis" defaultValue={item?.notes ?? ""} rows={2} />
    </DialogForm>
  );
}

export function DeleteItemButton({ id }: { id: string }) {
  return (
    <ActionButton action={() => deleteTemplateItem(id)} variant="ghost" size="icon-sm" title="Entfernen" confirm={{ title: "Position entfernen?", description: "Bereits gebuchte Verträge sind nicht betroffen.", confirmLabel: "Entfernen", destructive: true }}>
      <Trash2 />
    </ActionButton>
  );
}

export function ServiceTypeDialog({ type }: { type?: { id: string; key: string; name: string; description: string | null; category: string; content_kind: string | null; is_active: boolean; sort_order: number } }) {
  return (
    <DialogForm
      trigger={type ? <Button variant="ghost" size="icon-sm" aria-label="Leistungstyp bearbeiten"><Pencil /></Button> : <Button variant="outline" size="sm"><Plus /> Leistungstyp</Button>}
      title={type ? "Leistungstyp bearbeiten" : "Neuer Leistungstyp"}
      action={saveServiceType}
    >
      {type && <input type="hidden" name="id" value={type.id} />}
      <FormGrid>
        <InputField name="name" label="Name" defaultValue={type?.name ?? ""} required />
        <InputField name="key" label="Schlüssel" defaultValue={type?.key ?? ""} required />
        <SelectField name="category" label="Kategorie" defaultValue={type?.category ?? "sonstiges"} options={Object.entries(SERVICE_CATEGORY_LABELS).map(([value, label]) => ({ value, label }))} />
        <SelectField name="content_kind" label="Erfüllt durch" defaultValue={type?.content_kind ?? ""} placeholder="Keine Redaktionseinheit" options={[{ value: "magazinartikel", label: "Magazinartikel" }, { value: "social", label: "Social-Beitrag" }]} />
        <InputField name="sort_order" type="number" label="Reihenfolge" defaultValue={type?.sort_order ?? 100} />
      </FormGrid>
      <TextareaField name="description" label="Beschreibung" defaultValue={type?.description ?? ""} rows={2} />
      <CheckboxField name="is_active" label="Aktiv" defaultChecked={type?.is_active ?? true} />
    </DialogForm>
  );
}
