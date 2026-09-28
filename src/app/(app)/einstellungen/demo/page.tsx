import { PageHeader } from "@/components/common/page-header";
import { Section } from "@/components/common/section";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { DemoActions } from "./demo-actions";

export const metadata = { title: "Demo-Daten" };

export default async function DemoPage() {
  await requireAdmin();
  const supabase = await createClient();
  const { count } = await supabase.from("clients").select("id", { count: "exact", head: true }).eq("is_demo", true);
  return (
    <div>
      <PageHeader title="Demo-Daten" description="Realistische Beispieldaten zum Kennenlernen – klar gekennzeichnet mit „[DEMO]“ und vollständig entfernbar." />
      <Section>
        <div className="grid gap-3 text-sm">
          <p>
            Die Demo-Daten umfassen drei Beispielkunden (Membership Professional, Plus und Venue Circle), fünf Beitragsakten in verschiedenen Ablaufstufen
            (veröffentlicht, beim Kunden, Material ausstehend, interne Prüfung, eigene SUMMIT-Kampagne), Aufgaben und Themenideen. Sie durchlaufen den echten
            Ablauf inklusive Versionen, Freigaben und Veröffentlichungsnachweis. Es werden <strong>keine</strong> E-Mails versendet und keine Beiträge veröffentlicht.
          </p>
          <p className="text-muted-foreground">Status: {count ? `${count} Demo-Kunden geladen.` : "Keine Demo-Daten geladen."}</p>
          <DemoActions loaded={Boolean(count)} />
        </div>
      </Section>
    </div>
  );
}
