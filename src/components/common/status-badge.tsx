import { cn } from "@/lib/utils";
import type { LabelDef, Tone } from "@/lib/labels";

const TONE_CLASSES: Record<Tone, string> = {
  neutral: "bg-stone-100 text-stone-700 ring-stone-200",
  info: "bg-sky-50 text-sky-800 ring-sky-200",
  waiting: "bg-amber-50 text-amber-800 ring-amber-200",
  success: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  brand: "bg-[#f4ecf1] text-[#6f2659] ring-[#e3cfdc]",
  danger: "bg-red-50 text-red-800 ring-red-200",
  warning: "bg-orange-50 text-orange-800 ring-orange-200",
};

const DOT_CLASSES: Record<Tone, string> = {
  neutral: "bg-stone-400",
  info: "bg-sky-500",
  waiting: "bg-amber-500",
  success: "bg-emerald-500",
  brand: "bg-[#6f2659]",
  danger: "bg-red-500",
  warning: "bg-orange-500",
};

export function toneClasses(tone: Tone) {
  return TONE_CLASSES[tone];
}

export function toneDot(tone: Tone) {
  return DOT_CLASSES[tone];
}

export function StatusBadge({ def, className, title }: { def: LabelDef; className?: string; title?: string }) {
  return (
    <span
      title={title ?? def.hint}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset",
        TONE_CLASSES[def.tone],
        className,
      )}
    >
      <span aria-hidden className={cn("size-1.5 rounded-full", DOT_CLASSES[def.tone])} />
      {def.label}
    </span>
  );
}

export function Pill({ children, tone = "neutral", className }: { children: React.ReactNode; tone?: Tone; className?: string }) {
  return (
    <span className={cn("inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-medium ring-1 ring-inset", TONE_CLASSES[tone], className)}>
      {children}
    </span>
  );
}
