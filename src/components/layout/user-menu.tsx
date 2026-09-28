"use client";

import Link from "next/link";
import { LogOut, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { signOutAction } from "@/actions/general";
import { ROLE_LABELS } from "@/lib/labels";

export function UserMenu({ name, email, role }: { name: string; email: string; role: string }) {
  const initials = (name || email)
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-9 gap-2 px-1.5" aria-label="Benutzermenü">
          <span className="grid size-7 place-items-center rounded-full bg-[#6f2659] text-xs font-semibold text-white">{initials || "?"}</span>
          <span className="hidden text-left text-sm leading-tight md:block">
            <span className="block max-w-40 truncate font-medium">{name || email}</span>
            <span className="block text-[11px] text-muted-foreground">{ROLE_LABELS[role] ?? role}</span>
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="font-normal">
          <p className="truncate text-sm font-medium">{name || "Ohne Namen"}</p>
          <p className="truncate text-xs text-muted-foreground">{email}</p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/einstellungen/profil"><UserRound /> Mein Profil</Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <form action={signOutAction} className="w-full">
            <button type="submit" className="flex w-full items-center gap-2"><LogOut className="size-4" /> Abmelden</button>
          </form>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
