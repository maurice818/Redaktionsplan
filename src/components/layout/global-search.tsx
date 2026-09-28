"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Building2, CheckSquare, FileText, FolderOpen, Lightbulb, Loader2, Megaphone, Search, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Command, CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { searchAction, type SearchHit } from "@/actions/general";

const GROUPS: Record<string, { label: string; icon: typeof Search }> = {
  kunde: { label: "Kunden", icon: Building2 },
  kontakt: { label: "Ansprechpartner", icon: User },
  akte: { label: "Beitragsakten", icon: FolderOpen },
  inhalt: { label: "Inhalte", icon: FileText },
  aufgabe: { label: "Aufgaben", icon: CheckSquare },
  kampagne: { label: "Kampagnen", icon: Megaphone },
  idee: { label: "Ideen", icon: Lightbulb },
};

export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (query.trim().length < 2) return;
    const t = setTimeout(() => {
      startTransition(async () => {
        const res = await searchAction(query);
        if (res.ok) setHits(res.data);
      });
    }, 220);
    return () => clearTimeout(t);
  }, [query]);

  const visibleHits = query.trim().length < 2 ? [] : hits;
  const grouped = Object.entries(GROUPS)
    .map(([key, meta]) => ({ key, meta, items: visibleHits.filter((h) => h.entity_type === key) }))
    .filter((g) => g.items.length);

  return (
    <>
      <Button
        variant="outline"
        className="h-9 w-full max-w-sm justify-start gap-2 bg-white text-muted-foreground sm:w-72"
        onClick={() => setOpen(true)}
        aria-label="Suche öffnen"
      >
        <Search className="size-4" aria-hidden />
        <span className="truncate">Suchen …</span>
        <kbd className="ml-auto hidden rounded border bg-muted px-1.5 text-[10px] font-medium sm:inline">Strg K</kbd>
      </Button>
      <CommandDialog open={open} onOpenChange={setOpen} title="Suche" description="Kunden, Akten, Inhalte, Aufgaben, Kampagnen und Ideen durchsuchen">
        <Command shouldFilter={false}>
        <CommandInput placeholder="Kunde, Thema, Aufgabe …" value={query} onValueChange={setQuery} />
        <CommandList>
          {pending && (
            <div className="flex items-center gap-2 px-4 py-3 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden /> Suche läuft …
            </div>
          )}
          <CommandEmpty>{query.trim().length < 2 ? "Mindestens zwei Zeichen eingeben." : "Keine Treffer."}</CommandEmpty>
          {grouped.map((g) => (
            <CommandGroup key={g.key} heading={g.meta.label}>
              {g.items.map((h) => {
                const Icon = g.meta.icon;
                return (
                  <CommandItem
                    key={`${h.entity_type}-${h.id}`}
                    value={`${h.entity_type}-${h.id}`}
                    onSelect={() => {
                      setOpen(false);
                      router.push(h.url);
                    }}
                  >
                    <Icon className="size-4 text-muted-foreground" aria-hidden />
                    <div className="min-w-0">
                      <div className="truncate">{h.title}</div>
                      {h.subtitle && <div className="truncate text-xs text-muted-foreground">{h.subtitle}</div>}
                    </div>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          ))}
        </CommandList>
        </Command>
      </CommandDialog>
    </>
  );
}
