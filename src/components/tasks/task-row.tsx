"use client";

import Link from "next/link";
import { useEffect, useRef, useTransition } from "react";
import { toast } from "sonner";
import { Check, Hourglass, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { StatusBadge, Pill } from "@/components/common/status-badge";
import { setTaskStatus } from "@/actions/tasks";
import { TASK_PRIORITY, TASK_STATUS, TASK_TYPE_LABELS, labelOf } from "@/lib/labels";
import { formatDate, relativeDay } from "@/lib/time";
import { cn } from "@/lib/utils";
import type { Option } from "@/components/common/form";
import { TaskDialog, type TaskFormData } from "./task-dialog";

export interface TaskRowData extends TaskFormData {
  id: string;
  title: string;
  status: string;
  priority: string;
  task_type: string;
  due_date: string | null;
  assigneeName: string;
  contextLabel?: string | null;
  contextHref?: string | null;
  origin?: string;
}

export function TaskRow({ task, today, people, highlight }: { task: TaskRowData; today: string; people: Option[]; highlight?: boolean }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const ref = useRef<HTMLLIElement>(null);
  useEffect(() => {
    if (highlight) ref.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [highlight]);
  const done = task.status === "erledigt" || task.status === "abgebrochen";
  const overdue = !done && task.status !== "wartet_auf_kunde" && task.due_date && task.due_date < today;

  const change = (status: "erledigt" | "offen" | "wartet_auf_kunde" | "in_arbeit") =>
    startTransition(async () => {
      const res = await setTaskStatus(task.id, status);
      if (res.ok) {
        toast.success(res.message ?? "Gespeichert.");
        router.refresh();
      } else toast.error(res.error);
    });

  return (
    <li ref={ref} id={`aufgabe-${task.id}`} className={cn("flex items-start gap-3 px-3 py-2.5", highlight && "bg-[#fbf5f8] ring-1 ring-[#b90845]/30", done && "opacity-60")}>
      <button
        type="button"
        onClick={() => change(done ? "offen" : "erledigt")}
        disabled={pending}
        aria-label={done ? `„${task.title}“ wieder öffnen` : `„${task.title}“ als erledigt markieren`}
        className={cn("mt-0.5 grid size-5 shrink-0 place-items-center rounded-md border transition", done ? "border-emerald-600 bg-emerald-600 text-white" : "border-stone-300 bg-white hover:border-[#b90845]")}
      >
        {pending ? <Loader2 className="size-3 animate-spin" /> : done ? <Check className="size-3.5" /> : null}
      </button>
      <div className="min-w-0 flex-1">
        <p className={cn("text-sm font-medium", done && "line-through")}>{task.title}</p>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <span>{TASK_TYPE_LABELS[task.task_type] ?? task.task_type}</span>
          {task.contextHref ? <Link href={task.contextHref} className="hover:text-[#b90845] hover:underline">{task.contextLabel}</Link> : task.contextLabel && <span>{task.contextLabel}</span>}
          <span>· {task.assigneeName}</span>
          {task.origin === "ablauf" && <Pill>automatisch</Pill>}
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <div className="flex items-center gap-1.5">
          {task.priority !== "normal" && <StatusBadge def={labelOf(TASK_PRIORITY, task.priority)} />}
          {task.status !== "offen" && <StatusBadge def={labelOf(TASK_STATUS, task.status)} />}
        </div>
        {task.due_date && (
          <span className={cn("text-xs", overdue ? "font-medium text-red-700" : "text-muted-foreground")}>
            {overdue ? `überfällig · ${formatDate(task.due_date)}` : `${relativeDay(task.due_date, today)} · ${formatDate(task.due_date)}`}
          </span>
        )}
      </div>
      <div className="flex shrink-0 items-center">
        {!done && task.status !== "wartet_auf_kunde" && (
          <button type="button" onClick={() => change("wartet_auf_kunde")} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-amber-700" title="Wartet auf Kunde" aria-label="Auf „Wartet auf Kunde“ setzen">
            <Hourglass className="size-4" />
          </button>
        )}
        <TaskDialog task={task} people={people} />
      </div>
    </li>
  );
}
