"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, Info, Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { createUploadTarget, registerUpload } from "@/actions/media";
import { mediaKindForMime, ruleForMedia, validateMedia } from "@/lib/domain/format-validation";
import type { FormatRule, Issue } from "@/lib/domain/types";
import { ALLOWED_UPLOAD_TYPES, formatBytes, readMediaMetadata } from "@/lib/media";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

interface Pending {
  file: File;
  width: number | null;
  height: number | null;
  duration: number | null;
  issues: Issue[];
}

export function MediaUploader({
  dossierId,
  attachTo,
  supersedesId,
  rules,
  channel,
  postFormat,
  label = "Datei hochladen",
  variant = "outline",
}: {
  dossierId: string;
  attachTo?: string;
  supersedesId?: string;
  rules?: FormatRule[];
  channel?: string;
  postFormat?: string | null;
  label?: string;
  variant?: "outline" | "default" | "ghost";
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);
  const [altText, setAltText] = useState("");
  const [credit, setCredit] = useState("");
  const [final, setFinal] = useState(false);
  const router = useRouter();

  const onPick = async (file: File | undefined) => {
    if (!file) return;
    if (!ALLOWED_UPLOAD_TYPES.includes(file.type)) {
      toast.error(`Dateityp ${file.type || "unbekannt"} ist nicht erlaubt.`);
      return;
    }
    const meta = await readMediaMetadata(file);
    const kind = mediaKindForMime(file.type);
    const rule = rules && channel ? ruleForMedia(rules, channel, postFormat, kind) : null;
    const issues = rule
      ? validateMedia({ kind, mime_type: file.type, size_bytes: file.size, width: meta.width, height: meta.height, duration_seconds: meta.duration, file_name: file.name }, rule)
      : [];
    setPending({ file, ...meta, issues });
  };

  const upload = async () => {
    if (!pending) return;
    setBusy(true);
    try {
      const target = await createUploadTarget({ dossierId, fileName: pending.file.name, mimeType: pending.file.type, size: pending.file.size });
      if (!target.ok) throw new Error(target.error);
      const supabase = createClient();
      const { error } = await supabase.storage.from("media").uploadToSignedUrl(target.data.path, target.data.token, pending.file, { contentType: pending.file.type });
      if (error) throw new Error(`Upload fehlgeschlagen: ${error.message}`);
      const reg = await registerUpload({
        dossier_id: dossierId,
        storage_path: target.data.path,
        file_name: pending.file.name,
        mime_type: pending.file.type,
        size_bytes: pending.file.size,
        width: pending.width,
        height: pending.height,
        duration_seconds: pending.duration,
        alt_text: altText,
        credit,
        status: final ? "final" : "entwurf",
        supersedes_id: supersedesId ?? null,
        attach_to: attachTo ?? null,
      });
      if (!reg.ok) throw new Error(reg.error);
      toast.success(supersedesId ? "Neue Version hochgeladen – die alte ist als veraltet gekennzeichnet." : "Datei hochgeladen.");
      setPending(null);
      setAltText("");
      setCredit("");
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const errors = pending?.issues.filter((i) => i.level === "error") ?? [];

  return (
    <>
      <input ref={inputRef} type="file" className="sr-only" accept={ALLOWED_UPLOAD_TYPES.join(",")} onChange={(e) => onPick(e.target.files?.[0])} aria-label={label} tabIndex={-1} />
      <Button type="button" variant={variant} size="sm" onClick={() => inputRef.current?.click()}>
        <Upload /> {label}
      </Button>
      <Dialog open={Boolean(pending)} onOpenChange={(o) => !o && !busy && setPending(null)}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{supersedesId ? "Neue Version hochladen" : "Datei hochladen"}</DialogTitle>
            <DialogDescription>
              {pending?.file.name} · {formatBytes(pending?.file.size)}
              {pending?.width && pending.height ? ` · ${pending.width} × ${pending.height} px` : ""}
              {pending?.duration ? ` · ${pending.duration} s` : ""}
            </DialogDescription>
          </DialogHeader>
          {pending && pending.issues.length > 0 && (
            <ul className="grid gap-1.5">
              {pending.issues.map((i) => (
                <li key={i.code + i.message} className={cn("flex gap-2 rounded-md px-2.5 py-1.5 text-xs", i.level === "error" ? "bg-red-50 text-red-800" : i.level === "warning" ? "bg-amber-50 text-amber-900" : "bg-sky-50 text-sky-900")}>
                  {i.level === "info" ? <Info className="mt-0.5 size-3.5 shrink-0" /> : <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />}
                  {i.message}
                </li>
              ))}
            </ul>
          )}
          {errors.length > 0 && (
            <p className="text-xs text-muted-foreground">Sie können die Datei trotzdem hochladen (z. B. für andere Kanäle). Für diesen Kanal ist sie so jedoch nicht veröffentlichungsfähig.</p>
          )}
          <div className="grid gap-3">
            <label className="grid gap-1 text-sm font-medium">
              Alt-Text (Bildbeschreibung)
              <textarea value={altText} onChange={(e) => setAltText(e.target.value)} rows={2} className="rounded-lg border border-input px-3 py-2 text-sm font-normal" />
            </label>
            <label className="grid gap-1 text-sm font-medium">
              Bildnachweis / Urheber
              <input value={credit} onChange={(e) => setCredit(e.target.value)} className="h-9 rounded-lg border border-input px-3 text-sm font-normal" placeholder="z. B. Foto: Max Mustermann" />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={final} onChange={(e) => setFinal(e.target.checked)} className="size-4 accent-[#b90845]" /> Als finale Version kennzeichnen
            </label>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setPending(null)} disabled={busy}>Abbrechen</Button>
            <Button type="button" onClick={upload} disabled={busy}>
              {busy && <Loader2 className="animate-spin" />} Hochladen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
