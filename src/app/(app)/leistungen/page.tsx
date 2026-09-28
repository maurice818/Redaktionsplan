import Link from "next/link";
import { ListChecks } from "lucide-react";
import { EmptyState } from "@/components/common/empty-state";
import { FilterBar } from "@/components/common/filter-bar";
import { PageHeader } from "@/components/common/page-header";
import { Pill, StatusBadge } from "@/components/common/status-badge";
import { requireProfile } from "@/lib/auth";
import { currentYearId, groupDeliverables, loadDeliverables } from "@/lib/data/deliverables";
import { getClientsLite, getPackageTemplates, getPeople, getServiceTypes, personName } from "@/lib/data/lookups";
import { getSavedFilters, param } from "@/lib/data/saved-filters";
import { isDoneProgress } from "@/lib/domain/deliverable-progress";
import { DELIVERABLE_PROGRESS, labelOf } from "@/lib/labels";
import { createClient } from "@/lib/supabase/server";
import { berlinToday, daysBetween, formatDate } from "@/lib/time";

export const metadata = { title: "Leistungen" };

export default async function DeliverablesPage({ searchParams }: PageProps<"/leistungen">) {
  const sp = await searchParams;
  const profile = await requireProfile();
  const supabase = await createClient();
  const today = berlinToday();
  const clientId = param(sp.kunde);
  const pkg = param(sp.paket);
  const serviceId = param(sp.leistung);
  const progress = param(sp.stand);
  const owner = param(sp.person) === "ich" ? profile.id : param(sp.person);
  const scope = param(sp.jahr) ?? "aktuell";

  const [units, clients, packages, serviceTypes, people, saved] = await Promise.all([
    loadDeliverables(supabase, { clientId, ownerId: owner }),
    getClientsLite(), getPackageTemplates(), getServiceTypes(), getPeople(), getSavedFilters("leistungen"),
  ]);

  const contractIds = [...new Set(units.map((u) => u.contractId).filter((x): x is string => Boolean(x)))];
  const currentYears = new Set(contractIds.map((c) => currentYearId(units, c, today)).filter(Boolean));
  const filtered = units.filter((u) =>
    (!pkg || u.packageKey === pkg) &&
    (!serviceId || u.serviceTypeId === serviceId) &&
    (!progress || (progress === "offen" ? !isDoneProgress(u.progress) && u.progress !== "entfallen" : u.progress === progress)) &&
    (scope === "alle" || !u.yearId || currentYears.has(u.yearId)),
  );

  const byClient = new Map<string, typeof filtered>();
  for (const u of filtered) {
    if (!byClient.has(u.clientId)) byClient.set(u.clientId, []);
    byClient.get(u.clientId)!.push(u);
  }

  const total = filtered.filter((u) => u.progress !== "entfallen").length;
  const done = filtered.filter((u) => isDoneProgress(u.progress)).length;

  return (
    <div>
      <PageHeader
        title="Leistungen"
        description="Alle zugesagten Leistungen je Membership – mit Status, Verantwortlichen, verknüpften Inhalten und Erfüllungsnachweis."
        meta={<span className="text-sm text-muted-foreground">{done} von {total} Einheiten erbracht bzw. veröffentlicht</span>}
      />
      <FilterBar
        view="leistungen"
        userId={profile.id}
        saved={saved}
        filters={[
          { name: "kunde", label: "Kunde", options: clients.map((c) => ({ value: c.id, label: c.name })) },
          { name: "paket", label: "Paket", options: packages.map((p) => ({ value: p.key, label: p.name })) },
          { name: "leistung", label: "Leistungstyp", options: serviceTypes.map((s) => ({ value: s.id, label: s.name })) },
          { name: "stand", label: "Stand", options: [{ value: "offen", label: "Alle offenen" }, ...Object.entries(DELIVERABLE_PROGRESS).map(([value, d]) => ({ value, label: d.label }))] },
          { name: "person", label: "Verantwortlich", options: [{ value: "ich", label: "Nur meine" }, ...people.filter((p) => p.is_active).map((p) => ({ value: p.id, label: p.full_name || p.email }))] },
          { name: "jahr", label: "Vertragsjahre", allLabel: "Nur aktuelles", options: [{ value: "alle", label: "Alle Vertragsjahre" }] },
        ]}
      />

      {byClient.size === 0 ? (
        <EmptyState icon={ListChecks} title="Keine Leistungen für diese Auswahl">
          Leistungen entstehen beim Buchen eines Pakets in der Kundenakte oder als Zusatzbuchung.
        </EmptyState>
      ) : (
        <div className="grid gap-4">
          {[...byClient.entries()].map(([cid, list]) => {
            const groups = groupDeliverables(list);
            const first = list[0];
            return (
              <section key={cid} className="rounded-xl border border-border bg-card">
                <header className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
                  <Link href={`/kunden/${cid}?tab=leistungen`} className="font-semibold hover:text-[#b90845]">{first.clientName}</Link>
                  {first.isDemo && <Pill tone="warning">DEMO</Pill>}
                  <span className="text-xs text-muted-foreground">{first.packageName}</span>
                </header>
                <div className="divide-y">
                  {groups.map((g) => {
                    const yearEnd = g.units[0].yearEnd;
                    const left = yearEnd ? daysBetween(today, yearEnd) : null;
                    return (
                      <div key={g.key} className="px-4 py-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-sm font-medium">
                            {g.serviceName}
                            {g.units[0].yearNo && <span className="ml-2 text-xs font-normal text-muted-foreground">Vertragsjahr {g.units[0].yearNo} · bis {formatDate(yearEnd)}</span>}
                            {left !== null && left >= 0 && left <= 60 && g.done < g.total && <Pill tone="danger" className="ml-2">endet in {left} Tagen</Pill>}
                          </p>
                          <p className="text-xs text-muted-foreground">{g.summary}</p>
                        </div>
                        <ul className="mt-2 grid gap-1.5 sm:grid-cols-2 lg:grid-cols-4">
                          {g.units.map((u) => (
                            <li key={u.id} className="rounded-lg border border-border/70 px-2.5 py-2 text-xs">
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-medium">{u.unitCount && u.unitCount > 1 ? `${u.unitNo}/${u.unitCount}` : "Leistung"}</span>
                                <StatusBadge def={labelOf(DELIVERABLE_PROGRESS, u.progress)} />
                              </div>
                              <div className="mt-1 truncate text-muted-foreground">
                                {u.dossiers[0] ? <Link href={`/beitraege/${u.dossiers[0].id}`} className="hover:text-[#b90845] hover:underline">{u.dossiers[0].title}</Link> : personName(people, u.ownerId)}
                              </div>
                            </li>
                          ))}
                        </ul>
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
