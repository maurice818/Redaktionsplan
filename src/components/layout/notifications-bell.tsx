"use client";

import Link from "next/link";
import { useTransition } from "react";
import { Bell, CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { markNotificationsRead } from "@/actions/general";
import { formatDateTime } from "@/lib/time";
import { cn } from "@/lib/utils";

export interface NotificationItem {
  id: string;
  title: string;
  body: string | null;
  link: string | null;
  created_at: string;
  read_at: string | null;
}

export function NotificationsBell({ items, unread }: { items: NotificationItem[]; unread: number }) {
  const [pending, startTransition] = useTransition();
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label={`Benachrichtigungen${unread ? ` (${unread} ungelesen)` : ""}`}>
          <Bell />
          {unread > 0 && (
            <span className="absolute -top-0.5 -right-0.5 grid min-w-4 place-items-center rounded-full bg-[#b90845] px-1 text-[10px] leading-4 font-semibold text-white">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(24rem,calc(100vw-2rem))] p-0">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <p className="text-sm font-semibold">Benachrichtigungen</p>
          <Button
            variant="ghost"
            size="sm"
            disabled={pending || unread === 0}
            onClick={() => startTransition(async () => { await markNotificationsRead(); })}
          >
            <CheckCheck /> Alle gelesen
          </Button>
        </div>
        <ul className="max-h-[60vh] overflow-y-auto">
          {items.length === 0 && <li className="px-4 py-8 text-center text-sm text-muted-foreground">Keine Benachrichtigungen.</li>}
          {items.map((n) => (
            <li key={n.id} className={cn("border-b last:border-0", !n.read_at && "bg-[#fbf5f8]")}>
              <Link
                href={n.link ?? "/"}
                className="block px-4 py-3 hover:bg-muted/60"
                onClick={() => !n.read_at && startTransition(async () => { await markNotificationsRead([n.id]); })}
              >
                <p className="text-sm font-medium">{n.title}</p>
                {n.body && <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{n.body}</p>}
                <p className="mt-1 text-[11px] text-muted-foreground">{formatDateTime(n.created_at)}</p>
              </Link>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
