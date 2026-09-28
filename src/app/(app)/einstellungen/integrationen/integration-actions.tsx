"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pencil, Plus, ShieldCheck, Star, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { ActionButton } from "@/components/common/action-button";
import { DialogForm } from "@/components/common/dialog-form";
import { FormGrid, InputField, SelectField, TextareaField } from "@/components/common/form";
import { deleteAccount, saveManualAccount, setApiEnabled, setDefaultAccount, verifyAccount } from "@/actions/settings";
import { CHANNEL_LABELS } from "@/lib/labels";

export function AccountDialog({ account }: { account?: { id: string; platform: string; display_name: string; external_id: string | null; notes: string | null } }) {
  return (
    <DialogForm
      trigger={account ? <Button variant="ghost" size="icon-sm" aria-label="Konto bearbeiten"><Pencil /></Button> : <Button variant="outline" size="sm"><Plus /> Konto manuell anlegen</Button>}
      title={account ? "Konto bearbeiten" : "Konto manuell anlegen"}
      description="Für manuelle Veröffentlichung genügt Name und Kanal. Für die Schnittstelle zusätzlich ID und ein gültiges Token (wird verschlüsselt gespeichert, nie wieder angezeigt)."
      action={saveManualAccount}
    >
      {account && <input type="hidden" name="id" value={account.id} />}
      <FormGrid>
        <SelectField name="platform" label="Kanal" defaultValue={account?.platform ?? "instagram"} options={["instagram", "facebook", "linkedin"].map((p) => ({ value: p, label: CHANNEL_LABELS[p] }))} />
        <InputField name="display_name" label="Bezeichnung" defaultValue={account?.display_name ?? ""} required placeholder="z. B. @meetgermany" />
        <InputField name="external_id" label="Konto-/Seiten-/Organisations-ID" defaultValue={account?.external_id ?? ""} help="IG-User-ID, Facebook-Page-ID bzw. LinkedIn-Organisations-ID" />
        <InputField name="token_expires_at" type="date" label="Token gültig bis (optional)" />
      </FormGrid>
      <TextareaField name="access_token" label="Access Token (optional)" rows={2} help="Leer lassen, um ein vorhandenes Token zu behalten." autoComplete="off" />
      <TextareaField name="notes" label="Notizen" defaultValue={account?.notes ?? ""} rows={2} />
    </DialogForm>
  );
}

export function ApiSwitch({ id, enabled, connected }: { id: string; enabled: boolean; connected: boolean }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  return (
    <label className="flex items-center gap-2 text-xs">
      <Switch
        checked={enabled}
        disabled={pending || (!enabled && !connected)}
        onCheckedChange={(v) =>
          startTransition(async () => {
            const res = await setApiEnabled(id, v);
            if (res.ok) {
              toast.success(res.message ?? "Gespeichert.");
              router.refresh();
            } else toast.error(res.error);
          })
        }
        aria-label="API-Veröffentlichung aktivieren"
      />
      API-Veröffentlichung
    </label>
  );
}

export function AccountButtons({ id, isDefault }: { id: string; isDefault: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      <ActionButton action={() => verifyAccount(id)} size="sm" variant="outline"><ShieldCheck /> Verbindung prüfen</ActionButton>
      {!isDefault && <ActionButton action={() => setDefaultAccount(id)} size="sm" variant="ghost"><Star /> Als Standard</ActionButton>}
      <ActionButton action={() => deleteAccount(id)} size="icon-sm" variant="ghost" title="Konto entfernen" confirm={{ title: "Konto entfernen?", description: "Zugangsdaten werden gelöscht. Inhalte verlieren die Kontozuordnung.", confirmLabel: "Entfernen", destructive: true }}>
        <Trash2 />
      </ActionButton>
    </div>
  );
}
