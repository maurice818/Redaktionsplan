import { PageHeader } from "@/components/common/page-header";
import { requireEditor } from "@/lib/auth";
import { getPackageTemplates, getPeople, peopleOptions } from "@/lib/data/lookups";
import { berlinToday } from "@/lib/time";
import { QuickClientForm, type TemplateOption } from "./quick-client-form";

export const metadata = { title: "Neuer Kunde" };

export default async function NewClientPage() {
  const profile = await requireEditor();
  const [templates, people] = await Promise.all([getPackageTemplates(), getPeople()]);
  const options: TemplateOption[] = templates
    .filter((t) => t.is_active)
    .map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description,
      items: t.package_template_items
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((i) => ({
          id: i.id,
          name: i.label || i.service_types?.name || "Leistung",
          quantity: i.quantity,
          perParentItemId: i.per_parent_item_id,
          quantityPerParent: i.quantity_per_parent,
          period: i.period,
          contentKind: i.service_types?.content_kind ?? null,
        })),
    }));
  return (
    <div>
      <PageHeader
        title="Neuen Kunden anlegen"
        description="In drei Schritten: Stammdaten und Ansprechpartner, Paket und Vertragszeitraum, Kontrolle der erzeugten Leistungen."
        back={{ href: "/kunden", label: "Kunden & Memberships" }}
      />
      <QuickClientForm templates={options} people={peopleOptions(people)} currentUserId={profile.id} today={berlinToday()} />
    </div>
  );
}
