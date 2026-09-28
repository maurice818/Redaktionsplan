import { BrandMark } from "@/components/layout/brand";
import { GlobalSearch } from "@/components/layout/global-search";
import { MobileNav } from "@/components/layout/mobile-nav";
import { NotificationsBell } from "@/components/layout/notifications-bell";
import { SidebarNav, type NavCounts } from "@/components/layout/sidebar-nav";
import { UserMenu } from "@/components/layout/user-menu";
import { requireProfile } from "@/lib/auth";
import { canApprove } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { berlinToday, isoFromNow } from "@/lib/time";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireProfile();
  const supabase = await createClient();
  const today = berlinToday();

  const [tasks, reviews, material, failedJobs, manualDue, notifications, unread] = await Promise.all([
    supabase.from("tasks").select("id", { count: "exact", head: true })
      .eq("assignee_id", profile.id).in("status", ["offen", "in_arbeit"]).lte("due_date", today),
    canApprove(profile.role)
      ? supabase.from("content_items").select("id", { count: "exact", head: true }).eq("status", "interne_pruefung")
      : Promise.resolve({ count: 0 }),
    supabase.from("material_requests").select("id", { count: "exact", head: true }).eq("status", "eingereicht"),
    supabase.from("publish_jobs").select("id", { count: "exact", head: true }).in("status", ["fehlgeschlagen", "unklar"]),
    supabase.from("publish_jobs").select("id", { count: "exact", head: true }).eq("status", "manuell_offen")
      .lte("scheduled_at", isoFromNow(86_400_000)),
    supabase.from("notifications").select("id, title, body, link, created_at, read_at")
      .eq("recipient_id", profile.id).order("created_at", { ascending: false }).limit(20),
    supabase.from("notifications").select("id", { count: "exact", head: true }).eq("recipient_id", profile.id).is("read_at", null),
  ]);

  const counts: NavCounts = {
    tasks: tasks.count ?? 0,
    approvals: (reviews.count ?? 0) + (material.count ?? 0),
    publishing: (failedJobs.count ?? 0) + (manualDue.count ?? 0),
  };

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[16.5rem_1fr]">
      <a href="#inhalt" className="sr-only z-50 rounded bg-white px-3 py-2 focus:not-sr-only focus:fixed focus:top-2 focus:left-2">
        Zum Inhalt springen
      </a>
      <aside className="no-print sticky top-0 hidden h-dvh flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground lg:flex">
        <div className="px-5 pt-5 pb-4">
          <BrandMark />
        </div>
        <div className="flex-1 overflow-y-auto px-3 pb-4">
          <SidebarNav counts={counts} />
        </div>
        <div className="border-t border-sidebar-border px-5 py-3 text-[11px] text-sidebar-foreground/60">
          Zeitzone: Europe/Berlin
        </div>
      </aside>
      <div className="flex min-w-0 flex-col">
        <header className="no-print sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border bg-background/90 px-3 backdrop-blur sm:px-6">
          <MobileNav counts={counts} />
          <div className="min-w-0 flex-1">
            <GlobalSearch />
          </div>
          <NotificationsBell items={notifications.data ?? []} unread={unread.count ?? 0} />
          <UserMenu name={profile.full_name} email={profile.email} role={profile.role} />
        </header>
        <main id="inhalt" className="mx-auto w-full max-w-[1400px] flex-1 px-3 py-6 sm:px-6 lg:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}
