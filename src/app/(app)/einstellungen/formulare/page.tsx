import { PageHeader } from "@/components/common/page-header";
import { Section } from "@/components/common/section";
import { Pill } from "@/components/common/status-badge";
import { requireProfile } from "@/lib/auth";
import { parseFields } from "@/lib/material-form";
import { isAdmin } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { FormEditor } from "./form-editor";

export const metadata = { title: "Materialformulare" };

export default async function FormsPage() {
  const profile = await requireProfile();
  const admin = isAdmin(profile.role);
  const supabase = await createClient();
  const { data } = await supabase.from("material_forms").select("*").order("is_default", { ascending: false }).order("name");
  return (
    <div>
      <PageHeader title="Materialformulare" description="Felder des Online-Formulars, das Kunden per persönlichem Link erhalten. Versendete Anfragen behalten den Formularstand zum Versandzeitpunkt." />
      <div className="grid gap-4">
        {(data ?? []).map((f) => (
          <Section key={f.id} title={<span className="flex items-center gap-2">{f.name} {f.is_default && <Pill tone="brand">Standard</Pill>} {!f.is_active && <Pill>inaktiv</Pill>}</span>}>
            <FormEditor form={{ ...f, fields: parseFields(f.fields) }} editable={admin} />
          </Section>
        ))}
        {admin && (
          <Section title="Neues Formular">
            <FormEditor editable />
          </Section>
        )}
      </div>
    </div>
  );
}
