import { PageHeader } from "@/components/common/page-header";
import { Section } from "@/components/common/section";
import { Pill } from "@/components/common/status-badge";
import { requireProfile } from "@/lib/auth";
import { features } from "@/lib/env.server";
import { isAdmin } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/time";
import { TemplateEditor } from "./template-editor";

export const metadata = { title: "E-Mail-Vorlagen" };

export default async function EmailTemplatesPage() {
  const profile = await requireProfile();
  const supabase = await createClient();
  const { data } = await supabase.from("email_templates").select("*").order("audience").order("name");
  return (
    <div>
      <PageHeader title="E-Mail-Vorlagen" description="Texte für Kunden- und Team-E-Mails. Vor dem Versand lässt sich jede E-Mail im Versanddialog prüfen und anpassen." />
      {!features.email() && <p className="mb-4 rounded-md bg-amber-50 p-3 text-sm text-amber-900">Einrichtung erforderlich: Der E-Mail-Versand (Resend) ist nicht konfiguriert. E-Mails werden protokolliert, aber nicht versendet.</p>}
      <div className="grid gap-4">
        {(data ?? []).map((t) => (
          <Section key={t.key} title={<span className="flex items-center gap-2">{t.name} <Pill tone={t.audience === "kunde" ? "info" : "brand"}>{t.audience === "kunde" ? "an Kunden" : "an das Team"}</Pill></span>} description={`${t.description ?? ""} · zuletzt geändert ${formatDateTime(t.updated_at)}`}>
            <TemplateEditor template={t} editable={isAdmin(profile.role)} />
          </Section>
        ))}
      </div>
    </div>
  );
}
