"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ClipboardCheck, Copy, Layers, MailPlus, MessageSquareWarning, Pencil, Plus, Send, Trash2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ActionButton } from "@/components/common/action-button";
import { DialogForm } from "@/components/common/dialog-form";
import { CheckboxField, FormGrid, InputField, SelectField, TextareaField, type Option } from "@/components/common/form";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { deriveSocialVariants, createContent } from "@/actions/content";
import {
  getMaterialLink, getPreviewLink, markMaterialSent, markPreviewSent, resendMaterialRequest, resendPreview, reviewMaterial,
  revokeMaterialRequest, revokePreview,
} from "@/actions/customer";
import { deleteDossier, saveDossier } from "@/actions/dossiers";
import { CHANNEL_LABELS, DOSSIER_STATUS, OWN_CATEGORY_LABELS, POST_FORMAT_LABELS } from "@/lib/labels";

export interface DossierEditData {
  id: string;
  title: string;
  kind: string;
  client_id: string | null;
  contract_id: string | null;
  deliverable_id: string | null;
  campaign_id: string | null;
  contact_id: string | null;
  own_category: string | null;
  topic: string | null;
  goal: string | null;
  target_audience: string | null;
  key_message: string | null;
  owner_id: string | null;
  period_start: string | null;
  period_end: string | null;
  status: string;
  notes: string | null;
}

export function EditDossierDialog({ dossier, people, campaigns, contacts }: { dossier: DossierEditData; people: Option[]; campaigns: Option[]; contacts: Option[] }) {
  return (
    <DialogForm trigger={<Button variant="outline"><Pencil /> Akte bearbeiten</Button>} title="Beitragsakte bearbeiten" action={saveDossier} wide>
      <input type="hidden" name="id" value={dossier.id} />
      <input type="hidden" name="kind" value={dossier.kind} />
      <input type="hidden" name="client_id" value={dossier.client_id ?? ""} />
      <input type="hidden" name="contract_id" value={dossier.contract_id ?? ""} />
      <input type="hidden" name="deliverable_id" value={dossier.deliverable_id ?? ""} />
      <InputField name="title" label="Titel" defaultValue={dossier.title} required />
      <FormGrid>
        <InputField name="topic" label="Thema" defaultValue={dossier.topic ?? ""} />
        <SelectField name="owner_id" label="Verantwortlich" defaultValue={dossier.owner_id ?? ""} placeholder="Nicht zugewiesen" options={people} />
        <InputField name="period_start" type="date" label="Zeitraum ab" defaultValue={dossier.period_start ?? ""} />
        <InputField name="period_end" type="date" label="Zeitraum bis" defaultValue={dossier.period_end ?? ""} />
        {dossier.kind === "kunde" ? (
          <SelectField name="contact_id" label="Ansprechpartner" defaultValue={dossier.contact_id ?? ""} placeholder="Kein Ansprechpartner" options={contacts} />
        ) : (
          <SelectField name="own_category" label="Kategorie" defaultValue={dossier.own_category ?? "sonstiges"} options={Object.entries(OWN_CATEGORY_LABELS).map(([value, label]) => ({ value, label }))} />
        )}
        <SelectField name="campaign_id" label="Kampagne" defaultValue={dossier.campaign_id ?? ""} placeholder="Keine Kampagne" options={campaigns} />
        <SelectField name="status" label="Status der Akte" defaultValue={dossier.status} options={Object.entries(DOSSIER_STATUS).map(([value, d]) => ({ value, label: d.label }))} />
      </FormGrid>
      <TextareaField name="goal" label="Ziel" defaultValue={dossier.goal ?? ""} rows={2} />
      <TextareaField name="target_audience" label="Zielgruppe" defaultValue={dossier.target_audience ?? ""} rows={2} />
      <TextareaField name="key_message" label="Kernaussage" defaultValue={dossier.key_message ?? ""} rows={2} />
      <TextareaField name="notes" label="Notizen" defaultValue={dossier.notes ?? ""} rows={3} />
    </DialogForm>
  );
}

export function DeleteDossierButton({ id }: { id: string }) {
  const router = useRouter();
  return (
    <ActionButton
      action={() => deleteDossier(id)}
      variant="ghost"
      onDone={() => router.push("/beitraege")}
      confirm={{ title: "Beitragsakte löschen?", description: "Alle Inhalte, Versionen, Aufgaben, Materialanfragen und Vorschauen der Akte werden gelöscht. Akten mit Veröffentlichungen bitte abschließen statt löschen.", confirmLabel: "Endgültig löschen", destructive: true }}
    >
      <Trash2 /> Löschen
    </ActionButton>
  );
}

export function CreateContentDialog({ dossierId, articleId, defaultTitle, hasArticle }: { dossierId: string; articleId: string | null; defaultTitle: string; hasArticle: boolean }) {
  const router = useRouter();
  return (
    <DialogForm
      trigger={<Button size="sm" variant="outline"><Plus /> Inhalt</Button>}
      title="Neuen Inhalt anlegen"
      description="Magazinartikel und Social-Fassungen sind getrennte Veröffentlichungen mit eigenem Status und eigener Freigabe."
      action={createContent}
      submitLabel="Anlegen"
      onSuccess={(d) => router.push(`/beitraege/${dossierId}/inhalte/${d.id}`)}
    >
      <input type="hidden" name="dossier_id" value={dossierId} />
      {articleId && <input type="hidden" name="parent_id" value={articleId} />}
      <SelectField
        name="channel"
        label="Kanal"
        defaultValue={hasArticle ? "instagram" : "magazin"}
        options={Object.entries(CHANNEL_LABELS).map(([value, label]) => ({ value, label: value === "magazin" && hasArticle ? `${label} (weiterer Artikel)` : label }))}
      />
      <SelectField
        name="post_format"
        label="Format (Social)"
        defaultValue="feed_bild"
        options={Object.entries(POST_FORMAT_LABELS).filter(([k]) => k !== "artikel").map(([value, label]) => ({ value, label }))}
        help="Für Magazinartikel ohne Bedeutung."
      />
      <InputField name="title" label="Titel (intern)" defaultValue={defaultTitle} required />
    </DialogForm>
  );
}

export function DeriveSocialDialog({ articleId, existing }: { articleId: string; existing: string[] }) {
  const [open, setOpen] = useState(false);
  const [channels, setChannels] = useState<string[]>(["instagram", "facebook", "linkedin"].filter((c) => !existing.includes(c)));
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm"><Layers /> Social-Fassungen ableiten</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Social-Fassungen aus dem Artikel ableiten</DialogTitle>
          <DialogDescription>Je Kanal entsteht eine eigenständige Fassung (Text, CTA, Hashtags, Medium, Format, Termin). Änderungen an einer Fassung überschreiben die anderen nicht.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          {(["instagram", "facebook", "linkedin"] as const).map((c) => (
            <label key={c} className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
              <input
                type="checkbox"
                className="size-4 accent-[#b90845]"
                disabled={existing.includes(c)}
                checked={channels.includes(c)}
                onChange={(e) => setChannels((s) => (e.target.checked ? [...s, c] : s.filter((x) => x !== c)))}
              />
              {CHANNEL_LABELS[c]} {existing.includes(c) && <span className="text-xs text-muted-foreground">(bereits vorhanden)</span>}
            </label>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Abbrechen</Button>
          <Button
            disabled={pending || channels.length === 0}
            onClick={() =>
              startTransition(async () => {
                const res = await deriveSocialVariants(articleId, channels);
                if (res.ok) {
                  toast.success(`${res.data.created} Fassung(en) angelegt.`);
                  setOpen(false);
                  router.refresh();
                } else toast.error(res.error);
              })
            }
          >
            Anlegen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CopyLinkButton({ load }: { load: () => Promise<{ ok: true; data: { link: string } } | { ok: false; error: string }> }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const res = await load();
          if (res.ok) {
            await navigator.clipboard.writeText(res.data.link);
            toast.success("Link kopiert.");
          } else toast.error(res.error);
        })
      }
    >
      <Copy /> Link
    </Button>
  );
}

export function MaterialRequestActions({ id, status, active }: { id: string; status: string; active: boolean }) {
  if (!active) return null;
  return (
    <div className="flex flex-wrap items-center gap-1">
      <CopyLinkButton load={() => getMaterialLink(id)} />
      {status === "erstellt" && (
        <ActionButton action={() => markMaterialSent(id)} variant="ghost" size="sm"><Send /> Als versendet markieren</ActionButton>
      )}
      {!["eingereicht", "geprueft"].includes(status) && (
        <ActionButton action={() => resendMaterialRequest(id)} variant="ghost" size="sm"><MailPlus /> Erinnern</ActionButton>
      )}
      {status === "eingereicht" && <ReviewMaterialDialog id={id} />}
      <ActionButton
        action={() => revokeMaterialRequest(id)}
        variant="ghost"
        size="sm"
        confirm={{ title: "Link widerrufen?", description: "Der Kunde kann das Formular danach nicht mehr öffnen. Bereits gespeicherte Angaben bleiben erhalten.", confirmLabel: "Widerrufen", destructive: true }}
      >
        <XCircle /> Widerrufen
      </ActionButton>
    </div>
  );
}

function ReviewMaterialDialog({ id }: { id: string }) {
  return (
    <DialogForm
      trigger={<Button size="sm"><ClipboardCheck /> Prüfen</Button>}
      title="Eingereichtes Material prüfen"
      description="Bei einer Rückfrage wird das Formular für den Kunden wieder geöffnet."
      action={reviewMaterial}
    >
      <input type="hidden" name="id" value={id} />
      <SelectField name="outcome" label="Ergebnis" defaultValue="geprueft" options={[{ value: "geprueft", label: "Geprüft – vollständig" }, { value: "rueckfrage", label: "Rückfrage an den Kunden" }]} />
      <TextareaField name="note" label="Notiz bzw. Rückfrage" rows={3} />
      <CheckboxField name="notify" label="Rückfrage per E-Mail mit Link an den Kunden senden" defaultChecked />
    </DialogForm>
  );
}

export function PreviewActions({ id, status, active }: { id: string; status: string; active: boolean }) {
  if (!active) return null;
  return (
    <div className="flex flex-wrap items-center gap-1">
      <CopyLinkButton load={() => getPreviewLink(id)} />
      {status === "erstellt" && <ActionButton action={() => markPreviewSent(id)} variant="ghost" size="sm"><Send /> Als versendet markieren</ActionButton>}
      {status !== "beantwortet" && <ActionButton action={() => resendPreview(id)} variant="ghost" size="sm"><MessageSquareWarning /> Erinnern</ActionButton>}
      <ActionButton
        action={() => revokePreview(id)}
        variant="ghost"
        size="sm"
        confirm={{ title: "Vorschau-Link widerrufen?", description: "Der Kunde kann die Vorschau danach nicht mehr öffnen. Bereits abgegebene Entscheidungen bleiben dokumentiert.", confirmLabel: "Widerrufen", destructive: true }}
      >
        <XCircle /> Widerrufen
      </ActionButton>
    </div>
  );
}
