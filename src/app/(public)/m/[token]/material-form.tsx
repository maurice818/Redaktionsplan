"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { CheckCircle2, FileText, Loader2, Save, Send, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { materialUploadTarget, registerMaterialFile, removeMaterialFile, saveMaterial } from "@/actions/public";
import type { MaterialField } from "@/lib/material-form";
import { ALLOWED_UPLOAD_TYPES, formatBytes, readMediaMetadata } from "@/lib/media";
import { createClient } from "@/lib/supabase/client";
import { formatDateTime } from "@/lib/time";
import { cn } from "@/lib/utils";

interface FileItem {
  id: string;
  file_name: string;
  size_bytes: number | null;
  credit: string | null;
}

const inputCls = "w-full rounded-lg border border-input bg-white px-3 py-2 text-[15px] outline-none focus-visible:border-[#b90845] focus-visible:ring-3 focus-visible:ring-[#b90845]/15 disabled:bg-muted/40";

export function MaterialForm({
  token,
  fields,
  initialAnswers,
  initialFiles,
  editable,
  submittedAt,
  submittedBy,
  defaultName,
  defaultEmail,
}: {
  token: string;
  fields: MaterialField[];
  initialAnswers: Record<string, unknown>;
  initialFiles: FileItem[];
  editable: boolean;
  submittedAt: string | null;
  submittedBy: string | null;
  defaultName: string;
  defaultEmail: string;
}) {
  const [answers, setAnswers] = useState<Record<string, unknown>>(initialAnswers);
  const [files, setFiles] = useState<FileItem[]>(initialFiles);
  const [name, setName] = useState(defaultName);
  const [email, setEmail] = useState(defaultEmail);
  const [dirty, setDirty] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [done, setDone] = useState(!editable && Boolean(submittedAt));
  const [uploading, setUploading] = useState(false);
  const [credit, setCredit] = useState("");
  const [pending, startTransition] = useTransition();
  const fileInput = useRef<HTMLInputElement>(null);
  // Zählt Eingaben; nur wenn seit Beginn des Speicherns nichts Neues getippt wurde, gilt der Stand als gespeichert.
  const revision = useRef(0);

  const set = (key: string, value: unknown) => {
    setAnswers((a) => ({ ...a, [key]: value }));
    revision.current += 1;
    setDirty(true);
  };

  const save = useCallback(
    (submit: boolean) =>
      new Promise<boolean>((resolve) => {
        startTransition(async () => {
          const savedRevision = revision.current;
          const res = await saveMaterial({ token, answers, submit, name, email });
          if (res.ok) {
            if (revision.current === savedRevision) setDirty(false);
            setLastSaved(new Date());
            if (submit) setDone(true);
            else toast.success("Zwischengespeichert.");
            resolve(true);
          } else {
            toast.error(res.error);
            resolve(false);
          }
        });
      }),
    [token, answers, name, email],
  );

  // Automatisches Zwischenspeichern nach Pausen
  useEffect(() => {
    if (!dirty || !editable) return;
    const t = setTimeout(async () => {
      const savedRevision = revision.current;
      const res = await saveMaterial({ token, answers, submit: false, name, email });
      if (res.ok) {
        // Während des Speicherns weitergetippt? Dann bleibt "ungespeichert" und der nächste Timer läuft.
        if (revision.current === savedRevision) setDirty(false);
        setLastSaved(new Date());
      }
    }, 4000);
    return () => clearTimeout(t);
  }, [dirty, answers, token, name, email, editable]);

  const upload = async (list: FileList | null) => {
    if (!list?.length) return;
    setUploading(true);
    try {
      for (const file of Array.from(list)) {
        if (!ALLOWED_UPLOAD_TYPES.includes(file.type)) {
          toast.error(`${file.name}: Dateityp nicht erlaubt.`);
          continue;
        }
        const target = await materialUploadTarget({ token, fileName: file.name, mimeType: file.type, size: file.size });
        if (!target.ok) {
          toast.error(target.error);
          continue;
        }
        const supabase = createClient();
        const { error } = await supabase.storage.from("media").uploadToSignedUrl(target.data.path, target.data.uploadToken, file, { contentType: file.type });
        if (error) {
          toast.error(`${file.name}: Upload fehlgeschlagen.`);
          continue;
        }
        const meta = await readMediaMetadata(file);
        const reg = await registerMaterialFile({ token, path: target.data.path, fileName: file.name, mimeType: file.type, size: file.size, width: meta.width, height: meta.height, credit: credit || undefined });
        if (reg.ok) {
          setFiles((f) => [...f, { id: reg.data.id, file_name: file.name, size_bytes: file.size, credit: credit || null }]);
          toast.success(`${file.name} hochgeladen.`);
        } else toast.error(reg.error);
      }
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  if (done) {
    return (
      <div className="rounded-xl border border-emerald-200 bg-white p-8 text-center">
        <CheckCircle2 className="mx-auto size-10 text-emerald-600" aria-hidden />
        <h2 className="mt-3 text-xl font-semibold">Vielen Dank!</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
          Ihre Angaben sind bei der MEET GERMANY Redaktion eingegangen{submittedAt ? ` (${formatDateTime(submittedAt)}${submittedBy ? `, ${submittedBy}` : ""})` : ""}. Wir melden uns, falls wir Rückfragen haben.
        </p>
      </div>
    );
  }

  return (
    <form
      className="grid gap-5"
      onSubmit={async (e) => {
        e.preventDefault();
        await save(true);
      }}
      noValidate
    >
      {fields.map((f) => {
        const id = `feld-${f.key}`;
        const value = answers[f.key];
        const label = (
          <label htmlFor={id} className="text-sm font-medium">
            {f.label}
            {f.required && <span className="ml-0.5 text-[#b90845]" aria-hidden>*</span>}
            {f.required && <span className="sr-only"> (Pflichtfeld)</span>}
          </label>
        );
        if (f.type === "heading") return <h2 key={f.key} className="mt-2 text-base font-semibold">{f.label}</h2>;
        return (
          <div key={f.key} className="grid gap-1.5 rounded-xl border border-border bg-white p-4">
            {f.type !== "checkbox" && label}
            {f.help && <p className="text-xs text-muted-foreground">{f.help}</p>}
            {f.type === "textarea" && (
              <textarea id={id} rows={5} value={String(value ?? "")} onChange={(e) => set(f.key, e.target.value)} className={inputCls} disabled={!editable} required={f.required} />
            )}
            {(f.type === "text" || f.type === "url") && (
              <input id={id} type={f.type === "url" ? "url" : "text"} value={String(value ?? "")} onChange={(e) => set(f.key, e.target.value)} className={cn(inputCls, "h-10")} disabled={!editable} required={f.required} placeholder={f.type === "url" ? "https://" : f.placeholder} />
            )}
            {f.type === "date" && (
              <input id={id} type="date" value={String(value ?? "")} onChange={(e) => set(f.key, e.target.value)} className={cn(inputCls, "h-10 w-auto")} disabled={!editable} />
            )}
            {f.type === "checkbox" && (
              <label className="flex items-start gap-2 text-sm">
                <input id={id} type="checkbox" checked={value === true} onChange={(e) => set(f.key, e.target.checked)} className="mt-0.5 size-4 accent-[#b90845]" disabled={!editable} />
                <span>{f.label}{f.required && <span className="text-[#b90845]"> *</span>}</span>
              </label>
            )}
            {f.type === "list" && (
              <ol className="grid gap-2">
                {Array.from({ length: f.count ?? 3 }).map((_, i) => {
                  const list = Array.isArray(value) ? (value as string[]) : [];
                  return (
                    <li key={i} className="flex items-center gap-2">
                      <span className="w-5 text-sm text-muted-foreground">{i + 1}.</span>
                      <input
                        id={i === 0 ? id : undefined}
                        aria-label={`${f.label} ${i + 1}`}
                        value={list[i] ?? ""}
                        onChange={(e) => {
                          // Lückenlos aufbauen, auch wenn ein späterer Punkt zuerst ausgefüllt wird
                          const next = Array.from({ length: f.count ?? 3 }, (_, j) => list[j] ?? "");
                          next[i] = e.target.value;
                          set(f.key, next);
                        }}
                        className={cn(inputCls, "h-10")}
                        disabled={!editable}
                      />
                    </li>
                  );
                })}
              </ol>
            )}
            {f.type === "files" && (
              <div className="grid gap-2">
                <input ref={fileInput} id={id} type="file" multiple accept={ALLOWED_UPLOAD_TYPES.join(",")} className="sr-only" onChange={(e) => upload(e.target.files)} disabled={!editable || uploading} />
                <div className="flex flex-wrap items-center gap-2">
                  <input value={credit} onChange={(e) => setCredit(e.target.value)} placeholder="Urheber / Bildnachweis für die nächsten Uploads" aria-label="Urheber für die nächsten Uploads" className={cn(inputCls, "h-10 flex-1")} disabled={!editable} />
                  <Button type="button" variant="outline" onClick={() => fileInput.current?.click()} disabled={!editable || uploading}>
                    {uploading ? <Loader2 className="animate-spin" /> : <Upload />} Dateien auswählen
                  </Button>
                </div>
                {files.length > 0 && (
                  <ul className="grid gap-1.5">
                    {files.map((file) => (
                      <li key={file.id} className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2 text-sm">
                        <FileText className="size-4 text-muted-foreground" aria-hidden />
                        <span className="min-w-0 flex-1 truncate">{file.file_name}</span>
                        <span className="text-xs text-muted-foreground">{formatBytes(file.size_bytes)}{file.credit ? ` · ${file.credit}` : ""}</span>
                        {editable && (
                          <button
                            type="button"
                            className="rounded p-1 text-muted-foreground hover:bg-white hover:text-destructive"
                            aria-label={`${file.file_name} entfernen`}
                            onClick={async () => {
                              const res = await removeMaterialFile({ token, mediaId: file.id });
                              if (res.ok) setFiles((list) => list.filter((x) => x.id !== file.id));
                              else toast.error(res.error);
                            }}
                          >
                            <Trash2 className="size-4" />
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                <p className="text-xs text-muted-foreground">Große Dateien oder ganze Ordner bitte als Link (z. B. Google Drive) angeben.</p>
              </div>
            )}
          </div>
        );
      })}

      {editable && (
        <div className="grid gap-4 rounded-xl border border-border bg-white p-4">
          <p className="text-sm font-medium">Wer übermittelt die Angaben?</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1 text-sm">Name<input value={name} onChange={(e) => setName(e.target.value)} className={cn(inputCls, "h-10")} autoComplete="name" /></label>
            <label className="grid gap-1 text-sm">E-Mail<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={cn(inputCls, "h-10")} autoComplete="email" /></label>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground" aria-live="polite">
              {pending ? "Wird gespeichert …" : dirty ? "Ungespeicherte Änderungen" : lastSaved ? `Zwischengespeichert um ${lastSaved.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}` : "Ihre Angaben werden automatisch zwischengespeichert."}
            </p>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => save(false)} disabled={pending}><Save /> Zwischenspeichern</Button>
              <Button type="submit" disabled={pending}>{pending ? <Loader2 className="animate-spin" /> : <Send />} Absenden</Button>
            </div>
          </div>
        </div>
      )}
    </form>
  );
}
