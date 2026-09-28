"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Ban, Copy, Download, Loader2, Play, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { ActionButton } from "@/components/common/action-button";
import { DialogForm } from "@/components/common/dialog-form";
import { InputField, TextareaField } from "@/components/common/form";
import { cancelPublishJob, confirmManualPublication, retryPublishJob, runBackgroundNow } from "@/actions/publishing";
import { getMediaUrl } from "@/actions/media";

export function RetryButton({ jobId, unclear }: { jobId: string; unclear: boolean }) {
  const [open, setOpen] = useState(false);
  const [checked, setChecked] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  if (!unclear) {
    return <ActionButton action={() => retryPublishJob(jobId)} size="sm"><RotateCcw /> Erneut versuchen</ActionButton>;
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm" variant="outline"><RotateCcw /> Erneut versuchen …</Button></DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Ergebnis war unklar</DialogTitle>
          <DialogDescription>Bitte prüfen Sie zuerst auf der Plattform, ob der Beitrag erschienen ist. So vermeiden Sie eine Doppelveröffentlichung.</DialogDescription>
        </DialogHeader>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} className="mt-0.5 size-4 accent-[#b90845]" />
          Ich habe geprüft: Der Beitrag ist <strong>nicht</strong> erschienen.
        </label>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Abbrechen</Button>
          <Button
            disabled={!checked || pending}
            onClick={() =>
              startTransition(async () => {
                const res = await retryPublishJob(jobId, true);
                if (res.ok) {
                  toast.success(res.message ?? "Eingeplant.");
                  setOpen(false);
                  router.refresh();
                } else toast.error(res.error);
              })
            }
          >
            {pending && <Loader2 className="animate-spin" />} Erneut einplanen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function CancelJobDialog({ jobId }: { jobId: string }) {
  return (
    <DialogForm trigger={<Button size="sm" variant="ghost"><Ban /> Abbrechen</Button>} title="Veröffentlichung abbrechen" description="Der Termin wird wieder vorläufig. Bitte einen Grund angeben." action={cancelPublishJob} submitLabel="Auftrag abbrechen">
      <input type="hidden" name="id" value={jobId} />
      <TextareaField name="reason" label="Grund" required rows={2} />
    </DialogForm>
  );
}

export function ConfirmPublicationDialog({ contentId, nowLocal, label = "Veröffentlicht – Link eintragen" }: { contentId: string; nowLocal: string; label?: string }) {
  return (
    <DialogForm
      trigger={<Button size="sm">{label}</Button>}
      title="Veröffentlichung bestätigen"
      description="Erst mit Link und tatsächlichem Zeitpunkt gilt der Inhalt als veröffentlicht. Die zugehörige Leistung wird automatisch als erbracht markiert."
      action={confirmManualPublication}
      submitLabel="Bestätigen"
    >
      <input type="hidden" name="content_id" value={contentId} />
      <InputField name="url" label="Link zur Veröffentlichung" required placeholder="https://" />
      <InputField name="published_local" type="datetime-local" label="Veröffentlicht am (Europe/Berlin)" defaultValue={nowLocal} required />
      <TextareaField name="note" label="Notiz" rows={2} />
    </DialogForm>
  );
}

export function CopyTextButton({ text, label = "Text kopieren" }: { text: string; label?: string }) {
  return (
    <Button size="sm" variant="outline" onClick={async () => { await navigator.clipboard.writeText(text); toast.success("In die Zwischenablage kopiert."); }}>
      <Copy /> {label}
    </Button>
  );
}

export function DownloadMediaButton({ mediaId, name }: { mediaId: string; name: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      size="sm"
      variant="ghost"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const res = await getMediaUrl(mediaId);
          if (res.ok) window.open(res.data.url, "_blank", "noopener,noreferrer");
          else toast.error(res.error);
        })
      }
    >
      <Download /> {name}
    </Button>
  );
}

export function RunNowButton() {
  return (
    <ActionButton action={runBackgroundNow} size="sm" variant="outline" confirm={{ title: "Hintergrundprozess jetzt ausführen?", description: "Fällige Veröffentlichungen, Erinnerungen und Autorisierungen werden sofort verarbeitet – mit denselben Sperren wie beim automatischen Lauf.", confirmLabel: "Jetzt ausführen" }}>
      <Play /> Jetzt ausführen
    </ActionButton>
  );
}
