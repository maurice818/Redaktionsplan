import { Check, Circle, Minus } from "lucide-react";
import type { WorkflowStep } from "@/lib/domain/workflow";
import { cn } from "@/lib/utils";

export function WorkflowSteps({ steps }: { steps: WorkflowStep[] }) {
  const current = steps.find((s) => s.state === "open");
  const done = steps.filter((s) => s.state === "done").length;
  const relevant = steps.filter((s) => s.state !== "na").length;
  return (
    <div>
      <div className="mb-3 flex items-center gap-3">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={done} aria-valuemin={0} aria-valuemax={relevant} aria-label="Fortschritt der Beitragsakte">
          <div className="h-full rounded-full bg-[#6f2659]" style={{ width: `${relevant ? Math.round((done / relevant) * 100) : 0}%` }} />
        </div>
        <span className="text-xs text-muted-foreground tabular-nums">{done}/{relevant}</span>
      </div>
      {current && (
        <p className="mb-3 text-sm">
          <span className="text-muted-foreground">Nächster Schritt:</span> <strong>{current.no}. {current.label}</strong>
          {current.hint && <span className="text-muted-foreground"> – {current.hint}</span>}
        </p>
      )}
      <ol className="grid gap-x-4 gap-y-1 sm:grid-cols-2 xl:grid-cols-3">
        {steps.map((s) => (
          <li key={s.key} className={cn("flex items-start gap-2 text-xs", s.state === "na" && "text-muted-foreground/60", current?.key === s.key && "font-medium text-foreground")}>
            <span
              className={cn(
                "mt-px grid size-4 shrink-0 place-items-center rounded-full",
                s.state === "done" ? "bg-emerald-600 text-white" : s.state === "na" ? "bg-muted text-muted-foreground" : current?.key === s.key ? "bg-[#b90845] text-white" : "border border-stone-300",
              )}
              aria-hidden
            >
              {s.state === "done" ? <Check className="size-3" /> : s.state === "na" ? <Minus className="size-3" /> : current?.key === s.key ? <Circle className="size-2 fill-current" /> : null}
            </span>
            <span>
              {s.no}. {s.label}
              <span className="sr-only">{s.state === "done" ? " (erledigt)" : s.state === "na" ? " (nicht relevant)" : " (offen)"}</span>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
