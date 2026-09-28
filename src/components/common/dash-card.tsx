import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

export function DashCard({
  title,
  icon: Icon,
  count,
  tone = "neutral",
  href,
  hrefLabel = "Alle anzeigen",
  children,
  empty,
  className,
}: {
  title: string;
  icon: LucideIcon;
  count?: number;
  tone?: "neutral" | "danger" | "waiting" | "brand" | "success";
  href?: string;
  hrefLabel?: string;
  children?: React.ReactNode;
  empty?: React.ReactNode;
  className?: string;
}) {
  const toneClass = {
    neutral: "bg-stone-100 text-stone-700",
    danger: "bg-red-50 text-red-700",
    waiting: "bg-amber-50 text-amber-800",
    brand: "bg-[#f4ecf1] text-[#6f2659]",
    success: "bg-emerald-50 text-emerald-700",
  }[tone];
  const hasItems = count === undefined ? Boolean(children) : count > 0;
  return (
    <section className={cn("flex flex-col rounded-xl border border-border bg-card", className)} aria-labelledby={`card-${title}`}>
      <header className="flex items-center gap-2.5 border-b border-border/70 px-4 py-3">
        <span className={cn("grid size-7 place-items-center rounded-lg", toneClass)}>
          <Icon className="size-4" aria-hidden />
        </span>
        <h2 id={`card-${title}`} className="text-sm font-semibold">{title}</h2>
        {count !== undefined && (
          <span className={cn("ml-auto rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums", count > 0 ? toneClass : "bg-muted text-muted-foreground")}>
            {count}
          </span>
        )}
      </header>
      <div className="flex-1 px-2 py-1.5">
        {hasItems ? children : <p className="px-2 py-4 text-sm text-muted-foreground">{empty ?? "Nichts offen."}</p>}
      </div>
      {href && hasItems && (
        <footer className="border-t border-border/70 px-4 py-2">
          <Link href={href} className="inline-flex items-center gap-1 text-xs font-medium text-[#b90845] hover:underline">
            {hrefLabel} <ArrowRight className="size-3" aria-hidden />
          </Link>
        </footer>
      )}
    </section>
  );
}

export function DashRow({
  href,
  title,
  meta,
  aside,
  urgent,
}: {
  href: string;
  title: React.ReactNode;
  meta?: React.ReactNode;
  aside?: React.ReactNode;
  urgent?: boolean;
}) {
  return (
    <Link
      href={href}
      className="group flex items-start gap-3 rounded-lg px-2 py-2 hover:bg-muted/70 focus-visible:bg-muted/70"
    >
      {urgent !== undefined && (
        <span aria-hidden className={cn("mt-1.5 size-2 shrink-0 rounded-full", urgent ? "bg-red-500" : "bg-stone-300")} />
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium group-hover:text-[#b90845]">{title}</span>
        {meta && <span className="mt-0.5 block truncate text-xs text-muted-foreground">{meta}</span>}
      </span>
      {aside && <span className="shrink-0 text-right text-xs">{aside}</span>}
    </Link>
  );
}
