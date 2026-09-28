import Link from "next/link";
import { Building2, Plus } from "lucide-react";
import { EmptyState } from "@/components/common/empty-state";
import { FilterBar } from "@/components/common/filter-bar";
import { PageHeader } from "@/components/common/page-header";
import { Pill, StatusBadge } from "@/components/common/status-badge";
import { Button } from "@/components/ui/button";
import { requireProfile } from "@/lib/auth";
import { currentYearId, groupDeliverables, loadDeliverables } from "@/lib/data/deliverables";
import { getPackageTemplates, getPeople, personName } from "@/lib/data/lookups";
import { getSavedFilters, param } from "@/lib/data/saved-filters";
import { CLIENT_STATUS, labelOf } from "@/lib/labels";
import { canEdit } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { berlinToday, daysBetween, formatDate } from "@/lib/time";
import { safeSearch } from "@/lib/validation";

export const metadata = { title: "Kunden & Memberships" };

export default async function ClientsPage({ searchParams }: PageProps<"/kunden">) {
  const sp = await searchParams;
  const profile = await requireProfile();
  const supabase = await createClient();
  const q = param(sp.q);
  const status = param(sp.status);
  const owner = param(sp.person);
  const pkg = param(sp.paket);
  const today = berlinToday();

  let query = supabase
    .from("clients")
    .select("id, name, category, city, status, owner_id, is_demo, contracts(id, package_name, package_key, start_date, end_date, status), contacts(first_name, last_name, is_primary, email)")
    .order("name");
  if (q) query = query.or(`name.ilike.%${safeSearch(q)}%,city.ilike.%${safeSearch(q)}%`);
  if (status) query = query.eq("status", status);
  if (owner) query = query.eq("owner_id", owner);

  const [{ data: rows }, people, packages, saved] = await Promise.all([query, getPeople(), getPackageTemplates(), getSavedFilters("kunden")]);
  const clients = (rows ?? []).filter((c) => !pkg || c.contracts.some((k) => k.package_key === pkg && k.status === "aktiv"));
  const activeContracts = clients.flatMap((c) => c.contracts.filter((k) => k.status === "aktiv" || k.status === "gekuendigt"));
  const units = activeContracts.length ? await loadDeliverables(supabase, { contractIds: activeContracts.map((k) => k.id) }) : [];

  return (
    <div>
      <PageHeader
        title="Kunden & Memberships"
        description="Stammdaten, gebuchte Pakete und der Stand der zugesagten Leistungen je Kunde."
        actions={canEdit(profile.role) && <Button asChild><Link href="/kunden/neu"><Plus /> Neuen Kunden anlegen</Link></Button>}
      />
      <FilterBar
        view="kunden"
        userId={profile.id}
        saved={saved}
        search={{ name: "q", placeholder: "Name oder Ort …" }}
        filters={[
          { name: "status", label: "Status", options: Object.entries(CLIENT_STATUS).map(([value, d]) => ({ value, label: d.label })) },
          { name: "paket", label: "Paket", options: packages.map((p) => ({ value: p.key, label: p.name })) },
          { name: "person", label: "Zuständig", options: people.filter((p) => p.is_active).map((p) => ({ value: p.id, label: p.full_name || p.email })) },
        ]}
      />

      {clients.length === 0 ? (
        <EmptyState
          icon={Building2}
          title={q || status || owner || pkg ? "Keine Kunden für diese Filter" : "Noch keine Kunden angelegt"}
          action={canEdit(profile.role) && <Button asChild><Link href="/kunden/neu"><Plus /> Kunden anlegen & Paket buchen</Link></Button>}
        >
          Legen Sie einen Kunden an, buchen Sie direkt ein Membership-Paket – die zugesagten Leistungen werden automatisch erzeugt.
        </EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full min-w-[860px] text-sm">
            <thead className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
              <tr>
                <th scope="col" className="px-4 py-2.5 font-medium">Kunde</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Membership</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Vertragszeitraum</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Leistungen (aktuelles Vertragsjahr)</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Zuständig</th>
              </tr>
            </thead>
            <tbody>
              {clients.map((c) => {
                const contract = c.contracts
                  .filter((k) => k.status === "aktiv" || k.status === "gekuendigt")
                  .sort((a, b) => b.end_date.localeCompare(a.end_date))[0];
                const yearId = contract ? currentYearId(units, contract.id, today) : null;
                const groups = contract ? groupDeliverables(units.filter((u) => u.contractId === contract.id && u.yearId === yearId)) : [];
                const primary = c.contacts.find((x) => x.is_primary) ?? c.contacts[0];
                const endsSoon = contract && daysBetween(today, contract.end_date) <= 60;
                return (
                  <tr key={c.id} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="px-4 py-3 align-top">
                      <Link href={`/kunden/${c.id}`} className="font-medium hover:text-[#b90845]">{c.name}</Link>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                        <StatusBadge def={labelOf(CLIENT_STATUS, c.status)} />
                        {c.is_demo && <Pill tone="warning">DEMO</Pill>}
                        {[c.category, c.city].filter(Boolean).join(" · ")}
                      </div>
                      {primary && <div className="mt-1 text-xs text-muted-foreground">{[primary.first_name, primary.last_name].filter(Boolean).join(" ")}</div>}
                    </td>
                    <td className="px-4 py-3 align-top">{contract ? contract.package_name : <span className="text-muted-foreground">Kein aktives Paket</span>}</td>
                    <td className="px-4 py-3 align-top whitespace-nowrap">
                      {contract ? (
                        <>
                          {formatDate(contract.start_date)} – {formatDate(contract.end_date)}
                          {endsSoon && <div className="text-xs font-medium text-orange-700">endet bald</div>}
                        </>
                      ) : "–"}
                    </td>
                    <td className="px-4 py-3 align-top">
                      <ul className="space-y-0.5 text-xs">
                        {groups.map((g) => (
                          <li key={g.key} className={g.done === g.total ? "text-emerald-700" : ""}>{g.summary}</li>
                        ))}
                        {contract && groups.length === 0 && <li className="text-muted-foreground">Keine Leistungen im aktuellen Jahr</li>}
                      </ul>
                    </td>
                    <td className="px-4 py-3 align-top text-sm">{personName(people, c.owner_id)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
