import { SettingsNav } from "./settings-nav";
import { requireProfile } from "@/lib/auth";
import { isAdmin } from "@/lib/permissions";

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireProfile();
  return (
    <div className="grid gap-6 lg:grid-cols-[14rem_1fr]">
      <SettingsNav admin={isAdmin(profile.role)} />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
