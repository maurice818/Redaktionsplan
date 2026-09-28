"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, CalendarClock, ChevronLeft, ChevronRight, ExternalLink, Loader2, Move } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { StatusBadge, toneDot } from "@/components/common/status-badge";
import { moveContent } from "@/actions/content";
import { findConflicts } from "@/lib/domain/conflicts";
import { CALENDAR_STATUS, CHANNEL_LABELS, labelOf } from "@/lib/labels";
import { addDays, berlinDate, berlinLocalToIso, formatDate, formatLongDate, formatMonth, formatTime, formatWeekday, isoWeekNumber, toBerlinLocalInput } from "@/lib/time";
import { cn } from "@/lib/utils";

export interface CalendarEntry {
  id: string;
  type: "inhalt" | "aufgabe" | "frist";
  title: string;
  day: string;
  at: string | null;
  channel: string | null;
  statusKey: string;
  reasons: string[];
  href: string;
  clientName: string | null;
  kind: "kunde" | "eigen" | null;
  scheduleStatus?: string;
  movable: boolean;
  related?: { label: string; due: string | null }[];
  windowStart?: string | null;
  windowEnd?: string | null;
}

const CHANNEL_COLORS: Record<string, string> = {
  magazin: "border-l-[#6f2659]",
  instagram: "border-l-[#d9467b]",
  facebook: "border-l-[#3b5ba5]",
  linkedin: "border-l-[#0a66c2]",
};

function EntryChip({ e, onMove, compact }: { e: CalendarEntry; onMove: (e: CalendarEntry) => void; compact?: boolean }) {
  const def = e.type === "inhalt" ? labelOf(CALENDAR_STATUS, e.statusKey) : { label: e.type === "aufgabe" ? "Aufgabe" : "Frist", tone: "neutral" as const };
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          draggable={e.movable}
          onDragStart={(ev) => {
            ev.dataTransfer.setData("text/plain", e.id);
            ev.dataTransfer.effectAllowed = "move";
          }}
          className={cn(
            "group w-full rounded-md border border-l-4 bg-white px-1.5 py-1 text-left text-[11px] leading-tight shadow-[0_1px_1px_rgba(0,0,0,0.03)] hover:border-stone-400 focus-visible:outline-2",
            e.type === "inhalt" ? CHANNEL_COLORS[e.channel ?? ""] ?? "border-l-stone-400" : "border-l-stone-300 border-dashed bg-stone-50",
            e.statusKey === "blockiert" && "bg-red-50",
            e.movable && "cursor-grab active:cursor-grabbing",
          )}
          aria-label={`${e.title}, ${def.label}${e.at ? `, ${formatTime(e.at)} Uhr` : ""}`}
        >
          <span className="flex items-center gap-1">
            <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", toneDot(def.tone))} />
            {e.at && e.type === "inhalt" && <span className="text-muted-foreground tabular-nums">{formatTime(e.at)}</span>}
            <span className="truncate font-medium">{e.type === "inhalt" ? CHANNEL_LABELS[e.channel ?? ""] : e.type === "aufgabe" ? "Aufgabe" : "Frist"}</span>
          </span>
          {!compact && <span className="mt-0.5 line-clamp-2 block text-foreground/90">{e.title}</span>}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80" align="start">
        <div className="grid gap-2 text-sm">
          <p className="font-medium">{e.title}</p>
          <div className="flex flex-wrap items-center gap-1.5">
            <StatusBadge def={def} />
            {e.channel && <span className="text-xs text-muted-foreground">{CHANNEL_LABELS[e.channel]}</span>}
            <span className="text-xs text-muted-foreground">{e.kind === "eigen" ? "Eigene Redaktion" : e.clientName}</span>
          </div>
          <p className="text-xs text-muted-foreground">{e.at ? `${formatLongDate(e.at)}, ${formatTime(e.at)} Uhr` : formatLongDate(e.day)}</p>
          {e.reasons.length > 0 && <p className="rounded bg-red-50 p-2 text-xs text-red-800">{e.reasons.join(" · ")}</p>}
          {e.related && e.related.length > 0 && (
            <div className="text-xs">
              <p className="font-medium">Zugehörige Aufgaben & Fristen</p>
              <ul className="mt-1 space-y-0.5 text-muted-foreground">
                {e.related.map((r) => <li key={r.label}>{r.label}{r.due ? ` – ${formatDate(r.due)}` : ""}</li>)}
              </ul>
            </div>
          )}
          <div className="flex gap-2 pt-1">
            <Button asChild size="sm" variant="outline"><Link href={e.href}><ExternalLink /> Öffnen</Link></Button>
            {e.movable && <Button size="sm" onClick={() => onMove(e)}><Move /> Verschieben</Button>}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function CalendarView({
  view,
  anchor,
  today,
  days,
  entries,
  maxPerDay,
  minMinutes,
  baseQuery,
}: {
  view: "monat" | "woche" | "liste";
  anchor: string;
  today: string;
  days: string[];
  entries: CalendarEntry[];
  maxPerDay: number;
  minMinutes: number;
  baseQuery: string;
}) {
  const router = useRouter();
  const [moving, setMoving] = useState<{ entry: CalendarEntry; target: string } | null>(null);
  const [time, setTime] = useState("");
  const [pending, startTransition] = useTransition();

  const byDay = useMemo(() => {
    const map = new Map<string, CalendarEntry[]>();
    for (const e of entries) {
      if (!map.has(e.day)) map.set(e.day, []);
      map.get(e.day)!.push(e);
    }
    for (const list of map.values()) list.sort((a, b) => (a.at ?? "").localeCompare(b.at ?? "") || a.type.localeCompare(b.type));
    return map;
  }, [entries]);

  const contentEntries = entries.filter((e) => e.type === "inhalt" && e.at && e.statusKey !== "veroeffentlicht");
  const conflicts = useMemo(
    () => findConflicts(contentEntries.map((e) => ({ id: e.id, title: e.title, channel: e.channel ?? "", scheduled_at: e.at! })), maxPerDay, minMinutes),
    [contentEntries, maxPerDay, minMinutes],
  );
  const overloaded = new Set(conflicts.filter((c) => c.kind === "ueberlastung").map((c) => c.day));

  const startMove = (entry: CalendarEntry, target?: string) => {
    const day = target ?? entry.day;
    setMoving({ entry, target: day });
    setTime(entry.at ? toBerlinLocalInput(entry.at).slice(11, 16) : "10:00");
  };

  const moveWarnings = useMemo(() => {
    if (!moving) return [];
    const at = berlinLocalToIso(`${moving.target}T${time || "10:00"}`);
    const simulated = contentEntries
      .filter((e) => e.id !== moving.entry.id)
      .map((e) => ({ id: e.id, title: e.title, channel: e.channel ?? "", scheduled_at: e.at! }))
      .concat([{ id: moving.entry.id, title: moving.entry.title, channel: moving.entry.channel ?? "", scheduled_at: at }]);
    const warnings = findConflicts(simulated, maxPerDay, minMinutes).filter((w) => w.ids.includes(moving.entry.id) || (w.kind === "ueberlastung" && w.day === moving.target));
    const out = warnings.map((w) => w.message);
    if (moving.entry.windowEnd && moving.target > moving.entry.windowEnd) out.push(`Der neue Termin liegt nach dem vorgeschlagenen Zeitraum (bis ${formatDate(moving.entry.windowEnd)}).`);
    if (moving.entry.windowStart && moving.target < moving.entry.windowStart) out.push(`Der neue Termin liegt vor dem vorgeschlagenen Zeitraum (ab ${formatDate(moving.entry.windowStart)}).`);
    if (moving.target < today) out.push("Der neue Termin liegt in der Vergangenheit.");
    return out;
  }, [moving, time, contentEntries, maxPerDay, minMinutes, today]);

  const confirmMove = () => {
    if (!moving) return;
    startTransition(async () => {
      const res = await moveContent(moving.entry.id, `${moving.target}T${time || "10:00"}`);
      if (res.ok) {
        toast.success("Termin verschoben.");
        setMoving(null);
        router.refresh();
      } else toast.error(res.error);
    });
  };

  const step = view === "monat" ? "monat" : view === "woche" ? "woche" : "liste";
  const prev = view === "monat" ? addDays(anchor.slice(0, 7) + "-01", -1) : addDays(anchor, view === "woche" ? -7 : -30);
  const next = view === "monat" ? addDays(days[days.length - 1], 1) : addDays(anchor, view === "woche" ? 7 : 30);
  const qs = (datum: string, ansicht = step) => `?${new URLSearchParams({ ...Object.fromEntries(new URLSearchParams(baseQuery)), ansicht, datum }).toString()}`;
  const title = view === "monat" ? formatMonth(anchor) : view === "woche" ? `KW ${isoWeekNumber(days[0])} · ${formatDate(days[0])} – ${formatDate(days[6])}` : `${formatDate(days[0])} – ${formatDate(days[days.length - 1])}`;

  const renderDay = (day: string, tall?: boolean) => {
    const list = byDay.get(day) ?? [];
    const inMonth = view !== "monat" || day.slice(0, 7) === anchor.slice(0, 7);
    return (
      <div
        key={day}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const id = e.dataTransfer.getData("text/plain");
          const entry = entries.find((x) => x.id === id);
          if (entry && entry.day !== day) startMove(entry, day);
        }}
        className={cn(
          "flex min-h-28 flex-col gap-1 border-r border-b border-border p-1.5",
          tall && "min-h-[26rem]",
          !inMonth && "bg-muted/40",
          day === today && "bg-[#fbf5f8]",
          overloaded.has(day) && "bg-amber-50",
        )}
      >
        <div className="flex items-center justify-between">
          <span className={cn("text-xs tabular-nums", day === today ? "grid size-5 place-items-center rounded-full bg-[#b90845] font-semibold text-white" : inMonth ? "text-foreground" : "text-muted-foreground")}>
            {Number(day.slice(8))}
          </span>
          {overloaded.has(day) && <AlertTriangle className="size-3.5 text-amber-600" aria-label="Viele Beiträge an diesem Tag" />}
        </div>
        {list.map((e) => <EntryChip key={e.id} e={e} onMove={(x) => startMove(x)} compact={view === "monat" && list.length > 4} />)}
      </div>
    );
  };

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <Button asChild variant="outline" size="icon" aria-label="Zurück"><Link href={qs(prev)}><ChevronLeft /></Link></Button>
          <Button asChild variant="outline"><Link href={qs(today)}>Heute</Link></Button>
          <Button asChild variant="outline" size="icon" aria-label="Weiter"><Link href={qs(next)}><ChevronRight /></Link></Button>
        </div>
        <h2 className="text-lg font-semibold">{title}</h2>
        <div role="tablist" aria-label="Ansicht" className="ml-auto flex rounded-lg bg-muted p-1 text-sm">
          {(["monat", "woche", "liste"] as const).map((v) => (
            <Link key={v} role="tab" aria-selected={view === v} href={qs(anchor, v)} className={cn("rounded-md px-3 py-1", view === v ? "bg-white font-medium shadow-sm" : "text-muted-foreground hover:text-foreground")}>
              {v === "monat" ? "Monat" : v === "woche" ? "Woche" : "Liste"}
            </Link>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-label="Legende">
        {Object.entries(CALENDAR_STATUS).map(([k, d]) => (
          <span key={k} className="inline-flex items-center gap-1"><span className={cn("size-2 rounded-full", toneDot(d.tone))} /> {d.label}</span>
        ))}
        <span className="inline-flex items-center gap-1"><span className="h-3 w-1 rounded bg-[#6f2659]" /> Magazin</span>
        <span className="inline-flex items-center gap-1"><span className="h-3 w-1 rounded bg-[#d9467b]" /> Instagram</span>
        <span className="inline-flex items-center gap-1"><span className="h-3 w-1 rounded bg-[#3b5ba5]" /> Facebook</span>
        <span className="inline-flex items-center gap-1"><span className="h-3 w-1 rounded bg-[#0a66c2]" /> LinkedIn</span>
      </div>

      {conflicts.length > 0 && (
        <details className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900" open={conflicts.length <= 3}>
          <summary className="cursor-pointer font-medium"><AlertTriangle className="mr-1 inline size-4" /> {conflicts.length} Hinweis(e) zu Terminüberschneidungen</summary>
          <ul className="mt-1 list-disc pl-5 text-xs">
            {conflicts.map((c, i) => <li key={i}>{formatDate(c.day)}: {c.message}</li>)}
          </ul>
        </details>
      )}

      {view === "liste" ? (
        <div className="rounded-xl border border-border bg-card">
          {days.filter((d) => byDay.has(d)).length === 0 && <p className="p-6 text-center text-sm text-muted-foreground">Keine Einträge in diesem Zeitraum.</p>}
          {days.filter((d) => byDay.has(d)).map((d) => (
            <section key={d} className="border-b last:border-0" aria-label={formatLongDate(d)}>
              <h3 className={cn("sticky top-14 flex items-center gap-2 bg-muted/60 px-4 py-1.5 text-xs font-semibold backdrop-blur", overloaded.has(d) && "bg-amber-100")}>
                {formatLongDate(d)} {d === today && <span className="text-[#b90845]">· heute</span>}
                {overloaded.has(d) && <span className="font-normal text-amber-800">· viele Beiträge</span>}
              </h3>
              <ul className="divide-y">
                {(byDay.get(d) ?? []).map((e) => {
                  const def = e.type === "inhalt" ? labelOf(CALENDAR_STATUS, e.statusKey) : { label: e.type === "aufgabe" ? "Aufgabe" : "Frist", tone: "neutral" as const };
                  return (
                    <li key={e.id} className="flex flex-wrap items-center gap-3 px-4 py-2 text-sm">
                      <span className="w-12 text-xs text-muted-foreground tabular-nums">{e.at ? formatTime(e.at) : "–"}</span>
                      <span className="w-24 text-xs font-medium">{e.type === "inhalt" ? CHANNEL_LABELS[e.channel ?? ""] : e.type === "aufgabe" ? "Aufgabe" : "Frist"}</span>
                      <Link href={e.href} className="min-w-40 flex-1 hover:text-[#b90845]">{e.title}</Link>
                      <span className="text-xs text-muted-foreground">{e.kind === "eigen" ? "Eigen" : e.clientName}</span>
                      <StatusBadge def={def} title={e.reasons.join(", ")} />
                      {e.movable && <Button size="sm" variant="ghost" onClick={() => startMove(e)}><Move /> Verschieben</Button>}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border-t border-l border-border bg-card">
          <div className="grid min-w-[760px] grid-cols-7">
            {days.slice(0, 7).map((d) => (
              <div key={d} className="border-r border-b border-border bg-muted/40 px-2 py-1.5 text-xs font-medium text-muted-foreground">
                {formatWeekday(d)}{view === "woche" && ` ${formatDate(d).slice(0, 6)}`}
              </div>
            ))}
            {days.map((d) => renderDay(d, view === "woche"))}
          </div>
        </div>
      )}

      <Dialog open={Boolean(moving)} onOpenChange={(o) => !o && setMoving(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><CalendarClock className="size-5" /> Termin verschieben</DialogTitle>
            <DialogDescription>{moving?.entry.title}</DialogDescription>
          </DialogHeader>
          {moving && (
            <div className="grid gap-3 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <label className="grid gap-1">Neues Datum<input type="date" value={moving.target} onChange={(e) => setMoving({ ...moving, target: e.target.value })} className="h-9 rounded-lg border border-input px-3" /></label>
                <label className="grid gap-1">Uhrzeit (Berlin)<input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="h-9 rounded-lg border border-input px-3" /></label>
              </div>
              <p className="text-xs text-muted-foreground">Bisher: {moving.entry.at ? `${formatDate(berlinDate(moving.entry.at))}, ${formatTime(moving.entry.at)} Uhr` : formatDate(moving.entry.day)}</p>
              {moving.entry.scheduleStatus === "verbindlich" && (
                <p className="rounded-md bg-[#f4ecf1] p-2 text-xs text-[#6f2659]">Verbindlich geplant: Veröffentlichungsauftrag und Aufgabe „Manuell veröffentlichen“ werden automatisch auf den neuen Termin umgestellt. Nur Freigabe/Leitung oder Admin dürfen verbindliche Termine verschieben.</p>
              )}
              {moving.entry.related && moving.entry.related.length > 0 && (
                <div className="rounded-md border p-2 text-xs">
                  <p className="font-medium">Betroffene Aufgaben & Fristen – bitte prüfen:</p>
                  <ul className="mt-1 space-y-0.5">
                    {moving.entry.related.map((r) => <li key={r.label}>{r.label}{r.due ? ` – fällig ${formatDate(r.due)}` : ""}{r.due && r.due > moving.target ? " ⚠ liegt nach dem neuen Termin" : ""}</li>)}
                  </ul>
                </div>
              )}
              {moveWarnings.length > 0 && (
                <ul className="grid gap-1 rounded-md bg-amber-50 p-2 text-xs text-amber-900">
                  {moveWarnings.map((w) => <li key={w} className="flex gap-1.5"><AlertTriangle className="mt-0.5 size-3.5 shrink-0" /> {w}</li>)}
                </ul>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setMoving(null)}>Abbrechen</Button>
            <Button onClick={confirmMove} disabled={pending}>{pending && <Loader2 className="animate-spin" />} Verschieben</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
