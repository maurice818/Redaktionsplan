"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/einstellungen", label: "Übersicht & Einrichtung" },
  { href: "/einstellungen/profil", label: "Mein Profil" },
  { href: "/einstellungen/team", label: "Team & Rollen", admin: true },
  { href: "/einstellungen/integrationen", label: "Integrationen" },
  { href: "/einstellungen/pakete", label: "Pakete & Leistungstypen", admin: true },
  { href: "/einstellungen/formate", label: "Formatregeln" },
  { href: "/einstellungen/email-vorlagen", label: "E-Mail-Vorlagen" },
  { href: "/einstellungen/erinnerungen", label: "Erinnerungsregeln" },
  { href: "/einstellungen/formulare", label: "Materialformulare" },
  { href: "/einstellungen/allgemein", label: "Allgemein", admin: true },
  { href: "/einstellungen/protokoll", label: "Protokolle" },
  { href: "/einstellungen/demo", label: "Demo-Daten", admin: true },
];

export function SettingsNav({ admin }: { admin: boolean }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Einstellungen" className="flex gap-1 overflow-x-auto lg:flex-col">
      {ITEMS.filter((i) => admin || !i.admin).map((i) => {
        const active = i.href === "/einstellungen" ? pathname === i.href : pathname.startsWith(i.href);
        return (
          <Link
            key={i.href}
            href={i.href}
            aria-current={active ? "page" : undefined}
            className={cn("shrink-0 rounded-lg px-3 py-2 text-sm whitespace-nowrap", active ? "bg-[#f4ecf1] font-medium text-[#6f2659]" : "text-muted-foreground hover:bg-muted hover:text-foreground")}
          >
            {i.label}
          </Link>
        );
      })}
    </nav>
  );
}
