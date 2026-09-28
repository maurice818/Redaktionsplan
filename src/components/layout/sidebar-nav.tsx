"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { NAV_ITEMS } from "./nav-items";

export type NavCounts = Partial<Record<"tasks" | "approvals" | "publishing", number>>;

export function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

export function SidebarNav({ counts, onNavigate }: { counts: NavCounts; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Hauptnavigation" className="flex flex-col gap-0.5">
      {NAV_ITEMS.map((item) => {
        const active = isActive(pathname, item.href);
        const count = item.countKey ? counts[item.countKey] : undefined;
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
              active
                ? "bg-sidebar-accent font-medium text-white shadow-[inset_3px_0_0_var(--brand-crimson)]"
                : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-white",
            )}
          >
            <Icon className={cn("size-4 shrink-0", active ? "text-[#ff5c8d]" : "text-sidebar-foreground/60 group-hover:text-white")} aria-hidden />
            <span className="truncate">{item.label}</span>
            {count ? (
              <span className="ml-auto rounded-full bg-[#b90845] px-1.5 py-0.5 text-[10px] leading-none font-semibold text-white tabular-nums">
                {count > 99 ? "99+" : count}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
