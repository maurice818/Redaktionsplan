import { PageHeader } from "@/components/common/page-header";
import { Section } from "@/components/common/section";
import { Pill, StatusBadge } from "@/components/common/status-badge";
import { requireAdmin } from "@/lib/auth";
import { getPackageTemplates, getServiceTypes } from "@/lib/data/lookups";
import { SERVICE_CATEGORY_LABELS } from "@/lib/labels";
import { DeleteItemButton, ItemDialog, ServiceTypeDialog, TemplateDialog } from "./package-dialogs";

export const metadata = { title: "Pakete & Leistungstypen" };

export default async function PackagesPage() {
  await requireAdmin();
  const [templates, serviceTypes] = await Promise.all([getPackageTemplates(), getServiceTypes()]);
  const stOptions = serviceTypes.filter((s) => s.is_active).map((s) => ({ value: s.id, label: s.name }));
  return (
    <div>
      <PageHeader
        title="Pakete & Leistungstypen"
        description="Vorlagen für Membership-Pakete. Beim Buchen wird der aktuelle Stand im Vertrag gespeichert – Änderungen wirken nie rückwirkend."
        actions={<TemplateDialog />}
      />
      <div className="grid gap-4">
        {templates.map((t) => {
          const items = [...t.package_template_items].sort((a, b) => a.sort_order - b.sort_order);
          return (
            <Section
              key={t.id}
              title={<span className="flex items-center gap-2">{t.name} <Pill>Revision {t.revision}</Pill> {!t.is_active && <StatusBadge def={{ label: "Inaktiv", tone: "neutral" }} />}</span>}
              description={t.description ?? undefined}
              action={<><ItemDialog templateId={t.id} serviceTypes={stOptions} siblings={items.map((i) => ({ value: i.id, label: i.label || i.service_types?.name || "Position" }))} /><TemplateDialog template={t} /></>}
              bodyClassName="p-0"
            >
              {items.length === 0 ? <p className="px-4 py-3 text-sm text-muted-foreground">Keine Positionen – es werden keine Leistungen erzeugt.</p> : (
                <ul className="divide-y">
                  {items.map((i) => {
                    const parent = items.find((p) => p.id === i.per_parent_item_id);
                    return (
                      <li key={i.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm">
                        <span className="flex-1">
                          <span className="font-medium">{i.label || i.service_types?.name}</span>
                          {i.service_types?.content_kind && <Pill tone="brand" className="ml-2">erzeugt Redaktionseinheiten</Pill>}
                          {i.notes && <span className="block text-xs text-muted-foreground">{i.notes}</span>}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {parent ? `${i.quantity_per_parent} je Einheit „${parent.label || parent.service_types?.name}“` : i.quantity ? `${i.quantity} ×` : "ohne feste Stückzahl"} · {i.period === "vertragsjahr" ? "je Vertragsjahr" : "je Vertragslaufzeit"}
                        </span>
                        <ItemDialog templateId={t.id} item={i} serviceTypes={stOptions} siblings={items.map((x) => ({ value: x.id, label: x.label || x.service_types?.name || "Position" }))} />
                        <DeleteItemButton id={i.id} />
                      </li>
                    );
                  })}
                </ul>
              )}
            </Section>
          );
        })}

        <Section title="Leistungstypen" description="Konfigurierbare Leistungen, z. B. Firmenprofil, Community-Plattform, MeetUps, Reichweite, Anfragenmagnet, Vernetzung, Vorteile, Circle-Leistungen." action={<ServiceTypeDialog />} bodyClassName="p-0">
          <ul className="divide-y">
            {serviceTypes.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm">
                <span className="flex-1"><span className="font-medium">{s.name}</span>{s.description && <span className="block text-xs text-muted-foreground">{s.description}</span>}</span>
                <Pill>{SERVICE_CATEGORY_LABELS[s.category]}</Pill>
                {s.content_kind && <Pill tone="brand">{s.content_kind === "magazinartikel" ? "Magazinartikel" : "Social-Beitrag"}</Pill>}
                {!s.is_active && <StatusBadge def={{ label: "Inaktiv", tone: "neutral" }} />}
                <ServiceTypeDialog type={s} />
              </li>
            ))}
          </ul>
        </Section>
      </div>
    </div>
  );
}
