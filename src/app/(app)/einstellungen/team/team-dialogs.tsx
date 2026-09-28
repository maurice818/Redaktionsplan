"use client";

import { Pencil, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DialogForm } from "@/components/common/dialog-form";
import { CheckboxField, InputField, SelectField } from "@/components/common/form";
import { inviteMember, updateMember } from "@/actions/settings";
import { ROLE_LABELS } from "@/lib/labels";

const roleOptions = Object.entries(ROLE_LABELS).map(([value, label]) => ({ value, label }));

export function InviteDialog({ disabled }: { disabled: boolean }) {
  if (disabled) return <Button disabled><UserPlus /> Einladen</Button>;
  return (
    <DialogForm trigger={<Button><UserPlus /> Einladen</Button>} title="Teammitglied einladen" description="Supabase versendet eine Einladung; die Person legt danach ihr Passwort fest." action={inviteMember} submitLabel="Einladung senden">
      <InputField name="full_name" label="Name" required />
      <InputField name="email" type="email" label="E-Mail" required />
      <SelectField name="role" label="Rolle" defaultValue="redaktion" options={roleOptions} />
    </DialogForm>
  );
}

export function EditMemberDialog({ member }: { member: { id: string; full_name: string; role: string; is_active: boolean } }) {
  return (
    <DialogForm trigger={<Button variant="ghost" size="icon-sm" aria-label={`${member.full_name} bearbeiten`}><Pencil /></Button>} title="Teammitglied bearbeiten" action={updateMember}>
      <input type="hidden" name="id" value={member.id} />
      <InputField name="full_name" label="Name" defaultValue={member.full_name} required />
      <SelectField name="role" label="Rolle" defaultValue={member.role} options={roleOptions} />
      <CheckboxField name="is_active" label="Zugang aktiv" defaultChecked={member.is_active} help="Inaktive Konten sehen keine Daten mehr. Der letzte Admin kann nicht deaktiviert werden." />
    </DialogForm>
  );
}
