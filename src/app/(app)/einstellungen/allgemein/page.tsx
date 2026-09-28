import { PageHeader } from "@/components/common/page-header";
import { Section } from "@/components/common/section";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { SettingsForm } from "./settings-form";

export const metadata = { title: "Allgemeine Einstellungen" };

export default async function GeneralSettingsPage() {
  await requireAdmin();
  const supabase = await createClient();
  const { data } = await supabase.from("app_settings").select("key, value, label, description").order("key");
  return (
    <div>
      <PageHeader title="Allgemeine Einstellungen" description="Fristen, Gültigkeiten, Warnschwellen im Kalender und Hinweise zum MICE Magazin." />
      <Section>
        <SettingsForm settings={(data ?? []).map((s) => ({ ...s, value: s.value as string | number }))} />
      </Section>
    </div>
  );
}
