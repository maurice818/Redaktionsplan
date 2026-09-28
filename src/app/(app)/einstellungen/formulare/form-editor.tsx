"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/common/form";
import { saveMaterialForm } from "@/actions/settings";
import { FIELD_TYPE_LABELS, type MaterialField, type MaterialFieldType } from "@/lib/material-form";

const inputCls = "h-9 w-full rounded-lg border border-input bg-white px-3 text-sm";

export function FormEditor({
  form,
  editable,
}: {
  form?: { id: string; name: string; description: string | null; intro_text: string | null; fields: MaterialField[]; is_default: boolean; is_active: boolean };
  editable: boolean;
}) {
  const [name, setName] = useState(form?.name ?? "Neues Formular");
  const [description, setDescription] = useState(form?.description ?? "");
  const [intro, setIntro] = useState(form?.intro_text ?? "");
  const [fields, setFields] = useState<MaterialField[]>(form?.fields ?? [{ key: "thema", label: "Thema", type: "text", required: true }]);
  const [isDefault, setIsDefault] = useState(form?.is_default ?? false);
  const [isActive, setIsActive] = useState(form?.is_active ?? true);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const update = (i: number, patch: Partial<MaterialField>) => setFields((f) => f.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const move = (i: number, d: -1 | 1) => setFields((f) => {
    const n = [...f];
    const t = i + d;
    if (t < 0 || t >= n.length) return f;
    [n[i], n[t]] = [n[t], n[i]];
    return n;
  });

  const save = () =>
    startTransition(async () => {
      const res = await saveMaterialForm({ id: form?.id, name, description, intro_text: intro, fields, is_default: isDefault, is_active: isActive });
      if (res.ok) {
        toast.success(res.message ?? "Gespeichert.");
        router.refresh();
      } else toast.error(res.error);
    });

  return (
    <div className="grid gap-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-sm font-medium">Name<input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} readOnly={!editable} /></label>
        <label className="grid gap-1 text-sm font-medium">Beschreibung (intern)<input value={description} onChange={(e) => setDescription(e.target.value)} className={inputCls} readOnly={!editable} /></label>
        <label className="grid gap-1 text-sm font-medium sm:col-span-2">Einleitungstext für Kunden<textarea value={intro} onChange={(e) => setIntro(e.target.value)} rows={2} className="rounded-lg border border-input px-3 py-2 text-sm" readOnly={!editable} /></label>
      </div>
      <ol className="grid gap-2">
        {fields.map((f, i) => (
          <li key={i} className="grid gap-2 rounded-lg border border-border p-3 sm:grid-cols-[1fr_12rem_8rem_auto]">
            <div className="grid gap-2">
              <input aria-label="Bezeichnung" value={f.label} onChange={(e) => update(i, { label: e.target.value })} className={inputCls} readOnly={!editable} placeholder="Bezeichnung" />
              <input aria-label="Hilfetext" value={f.help ?? ""} onChange={(e) => update(i, { help: e.target.value || undefined })} className={inputCls} readOnly={!editable} placeholder="Hilfetext (optional)" />
            </div>
            <div className="grid gap-2">
              <NativeSelect aria-label="Feldtyp" value={f.type} onChange={(e) => update(i, { type: e.target.value as MaterialFieldType })} disabled={!editable}>
                {Object.entries(FIELD_TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </NativeSelect>
              <input aria-label="Feldschlüssel" value={f.key} onChange={(e) => update(i, { key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_") })} className={`${inputCls} font-mono text-xs`} readOnly={!editable} placeholder="schluessel" />
            </div>
            <div className="grid content-start gap-2 text-sm">
              <label className="flex items-center gap-2"><input type="checkbox" checked={Boolean(f.required)} onChange={(e) => update(i, { required: e.target.checked })} disabled={!editable || f.type === "heading"} className="size-4 accent-[#b90845]" /> Pflicht</label>
              {f.type === "list" && <label className="flex items-center gap-2">Anzahl<input type="number" min={1} max={10} value={f.count ?? 3} onChange={(e) => update(i, { count: Number(e.target.value) })} className="h-8 w-16 rounded border px-2" disabled={!editable} /></label>}
            </div>
            {editable && (
              <div className="flex items-start gap-1">
                <button type="button" onClick={() => move(i, -1)} className="rounded p-1.5 hover:bg-muted" aria-label="Nach oben"><ArrowUp className="size-4" /></button>
                <button type="button" onClick={() => move(i, 1)} className="rounded p-1.5 hover:bg-muted" aria-label="Nach unten"><ArrowDown className="size-4" /></button>
                <button type="button" onClick={() => setFields((x) => x.filter((_, j) => j !== i))} className="rounded p-1.5 hover:bg-muted hover:text-destructive" aria-label="Feld entfernen"><Trash2 className="size-4" /></button>
              </div>
            )}
          </li>
        ))}
      </ol>
      {editable && (
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" variant="outline" size="sm" onClick={() => setFields((f) => [...f, { key: `feld_${f.length + 1}`, label: "Neues Feld", type: "text" }])}><Plus /> Feld hinzufügen</Button>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} className="size-4 accent-[#b90845]" /> Standardformular</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="size-4 accent-[#b90845]" /> Aktiv</label>
          <Button type="button" className="ml-auto" onClick={save} disabled={pending}>{pending && <Loader2 className="animate-spin" />} Formular speichern</Button>
        </div>
      )}
    </div>
  );
}
