import {
  BadgeCheck, Building2, CalendarDays, CheckSquare, LayoutDashboard, ListChecks, Megaphone, Newspaper, Send, Settings,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  countKey?: "tasks" | "approvals" | "publishing";
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/kalender", label: "Redaktionskalender", icon: CalendarDays },
  { href: "/kunden", label: "Kunden & Memberships", icon: Building2 },
  { href: "/leistungen", label: "Leistungen", icon: ListChecks },
  { href: "/beitraege", label: "Beiträge & Magazin", icon: Newspaper },
  { href: "/aufgaben", label: "Aufgaben", icon: CheckSquare, countKey: "tasks" },
  { href: "/freigaben", label: "Freigaben", icon: BadgeCheck, countKey: "approvals" },
  { href: "/kampagnen", label: "Kampagnen", icon: Megaphone },
  { href: "/veroeffentlichungen", label: "Veröffentlichungen", icon: Send, countKey: "publishing" },
  { href: "/einstellungen", label: "Einstellungen & Integrationen", icon: Settings },
];
