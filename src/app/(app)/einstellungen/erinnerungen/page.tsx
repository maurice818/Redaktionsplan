import { PageHeader } from "@/components/common/page-header";
import { Section } from "@/components/common/section";
import { requireProfile } from "@/lib/auth";
import { isAdmin } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { ReminderForm } from "./reminder-form";

export const metadata = { title: "Erinnerungsregeln" };

const DAY_LABEL: Record<string, string> = {
  material_ausstehend: "Tage nach Versand",
  vorschau_ohne_antwort: "Tage nach Versand",
  grafik_fehlt: "Tage vor dem Termin",
  termin_ohne_freigabe: "Tage vor dem Termin",
  vertragsjahr_endet: "Tage vor Ende des Vertragsjahres",
  aufgabe_ueberfaellig: "Tage nach Fälligkeit",
};

export default async function RemindersPage() {
  const profile = await requireProfile();
  const supabase = await createClient();
  const { data } = await supabase.from("reminder_rules").select("*").order("name");
  return (
    <div>
      <PageHeader
        title="Erinnerungsregeln"
        description="Der Hintergrundprozess prüft die Regeln bei jedem Lauf. Jede Erinnerung wird genau einmal ausgelöst – auch bei wiederholten oder parallelen Läufen."
      />
      <div className="grid gap-4">
        {(data ?? []).map((r) => (
          <Section key={r.key} title={r.name} description={r.description ?? undefined}>
            <ReminderForm rule={r} dayLabel={DAY_LABEL[r.key] ?? "Tage"} editable={isAdmin(profile.role)} />
          </Section>
        ))}
      </div>
    </div>
  );
}
