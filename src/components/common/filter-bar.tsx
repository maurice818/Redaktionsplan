"use client";

import { useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Bookmark, BookmarkPlus, Loader2, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { NativeSelect, type Option } from "@/components/common/form";
import { deleteFilterAction, saveFilterAction } from "@/actions/general";

export interface FilterDef {
  name: string;
  label: string;
  options: Option[];
  allLabel?: string;
}

export interface SavedFilter {
  id: string;
  name: string;
  params: Record<string, unknown>;
  is_shared: boolean;
  owner_id: string;
}

export function FilterBar({
  view,
  filters,
  saved = [],
  userId,
  search,
  children,
}: {
  view: string;
  filters: FilterDef[];
  saved?: SavedFilter[];
  userId?: string;
  search?: { name: string; placeholder: string };
  children?: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [saveOpen, setSaveOpen] = useState(false);
  const [name, setName] = useState("");
  const [shared, setShared] = useState(false);
  const [text, setText] = useState(search ? params.get(search.name) ?? "" : "");

  const update = (key: string, value: string) => {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete("seite");
    startTransition(() => router.replace(`${pathname}?${next.toString()}`, { scroll: false }));
  };

  const active = filters.some((f) => params.get(f.name)) || (search && params.get(search.name));
  const currentParams = () => {
    const p = new URLSearchParams();
    for (const f of filters) if (params.get(f.name)) p.set(f.name, params.get(f.name)!);
    if (search && params.get(search.name)) p.set(search.name, params.get(search.name)!);
    for (const [k, v] of params.entries()) if (!p.has(k) && k !== "seite") p.set(k, v);
    return p;
  };

  return (
    <div className="no-print mb-5 flex flex-wrap items-end gap-2 rounded-xl border border-border bg-card p-3">
      {search && (
        <form
          className="min-w-48 flex-1"
          onSubmit={(e) => {
            e.preventDefault();
            update(search.name, text.trim());
          }}
        >
          <label className="mb-1 block text-xs font-medium text-muted-foreground" htmlFor={`${view}-suche`}>Suche</label>
          <input
            id={`${view}-suche`}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onBlur={() => text !== (params.get(search.name) ?? "") && update(search.name, text.trim())}
            placeholder={search.placeholder}
            className="h-9 w-full rounded-lg border border-input bg-white px-3 text-sm outline-none focus-visible:border-[#b90845] focus-visible:ring-3 focus-visible:ring-[#b90845]/15"
          />
        </form>
      )}
      {filters.map((f) => (
        <div key={f.name} className="min-w-40 flex-1 sm:flex-none">
          <label className="mb-1 block text-xs font-medium text-muted-foreground" htmlFor={`${view}-${f.name}`}>{f.label}</label>
          <NativeSelect id={`${view}-${f.name}`} value={params.get(f.name) ?? ""} onChange={(e) => update(f.name, e.target.value)} className="sm:w-48">
            <option value="">{f.allLabel ?? "Alle"}</option>
            {f.options.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </NativeSelect>
        </div>
      ))}
      {children}
      <div className="ml-auto flex items-center gap-1">
        {pending && <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="Wird geladen" />}
        {active && (
          <Button variant="ghost" size="sm" onClick={() => startTransition(() => router.replace(pathname, { scroll: false }))}>
            <X /> Zurücksetzen
          </Button>
        )}
        {userId && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm"><Bookmark /> Gespeicherte Filter</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuLabel>Gespeicherte Filter</DropdownMenuLabel>
              {saved.length === 0 && <p className="px-2 py-1.5 text-xs text-muted-foreground">Noch keine gespeicherten Filter.</p>}
              {saved.map((s) => (
                <div key={s.id} className="flex items-center gap-1">
                  <DropdownMenuItem
                    className="flex-1"
                    onSelect={() => {
                      const p = new URLSearchParams(Object.entries(s.params).map(([k, v]) => [k, String(v)]));
                      router.replace(`${pathname}?${p.toString()}`, { scroll: false });
                    }}
                  >
                    <span className="truncate">{s.name}</span>
                    {s.is_shared && <span className="ml-auto text-[10px] text-muted-foreground">geteilt</span>}
                  </DropdownMenuItem>
                  {s.owner_id === userId && (
                    <button
                      type="button"
                      className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive"
                      aria-label={`Filter „${s.name}“ löschen`}
                      onClick={async () => {
                        const res = await deleteFilterAction(s.id);
                        if (res.ok) toast.success("Filter gelöscht.");
                        else toast.error(res.error);
                      }}
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  )}
                </div>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem disabled={!active} onSelect={() => setSaveOpen(true)}>
                <BookmarkPlus /> Aktuellen Filter speichern
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Filter speichern</DialogTitle>
            <DialogDescription>Die aktuelle Filterauswahl steht danach mit einem Klick zur Verfügung.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <label className="grid gap-1.5 text-sm font-medium">
              Name
              <input value={name} onChange={(e) => setName(e.target.value)} className="h-9 rounded-lg border border-input px-3 text-sm font-normal" placeholder="z. B. Meine Instagram-Beiträge" />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={shared} onChange={(e) => setShared(e.target.checked)} className="size-4 accent-[#b90845]" />
              Für das ganze Team sichtbar
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveOpen(false)}>Abbrechen</Button>
            <Button
              disabled={!name.trim()}
              onClick={async () => {
                const res = await saveFilterAction({ view, name, params: currentParams().toString(), shared });
                if (res.ok) {
                  toast.success("Filter gespeichert.");
                  setSaveOpen(false);
                  setName("");
                } else toast.error(res.error);
              }}
            >
              Speichern
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
