import { notFound } from "next/navigation";
import { Download } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { Pill } from "@/components/common/status-badge";
import { PrintButton } from "@/components/common/print-button";
import { Button } from "@/components/ui/button";
import { requireProfile } from "@/lib/auth";
import { loadClientReport } from "@/lib/data/report";
import { CHANNEL_LABELS, CONTRACT_STATUS, DELIVERABLE_PROGRESS, labelOf } from "@/lib/labels";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatDateTime } from "@/lib/time";

export const metadata = { title: "Leistungsnachweis" };

export default async function ReportPage({ params }: PageProps<"/kunden/[id]/nachweis">) {
  const { id } = await params;
  const profile = await requireProfile();
  const supabase = await createClient();
  const report = await loadClientReport(supabase, id);
  if (!report) notFound();
  const hasMetrics = report.publications.some((p) => p.metrics);

  return (
    <div className="mx-auto max-w-4xl">
      <div className="no-print">
        <PageHeader
          back={{ href: `/kunden/${id}`, label: report.client.name }}
          title="Leistungsnachweis"
          description="Druckansicht (über „Drucken“ auch als PDF speicherbar) und CSV-Export für die Weiterverarbeitung."
          actions={
            <>
              <Button asChild variant="outline"><a href={`/api/export/leistungsnachweis/${id}`}><Download /> CSV exportieren</a></Button>
              <PrintButton />
            </>
          }
        />
      </div>

      <article className="rounded-xl border border-border bg-white p-8 print:border-0 print:p-0">
        <header className="mb-6 flex items-start justify-between border-b pb-4">
          <div>
            <p className="text-xs font-semibold tracking-[0.18em] text-[#b90845]">MEET GERMANY</p>
            <h1 className="mt-1 text-2xl font-semibold">Leistungsnachweis</h1>
            <p className="mt-1 text-sm">{report.client.legal_name ?? report.client.name}{report.client.city ? `, ${report.client.city}` : ""}</p>
            {report.client.is_demo && <Pill tone="warning" className="mt-2">DEMO-DATEN – kein echter Nachweis</Pill>}
          </div>
          <p className="text-right text-xs text-muted-foreground">Stand: {formatDateTime(new Date())}<br />Erstellt von: {profile.full_name || profile.email}</p>
        </header>

        {report.contracts.length === 0 && <p className="text-sm text-muted-foreground">Keine gebuchten Memberships.</p>}

        {report.contracts.map((c) => (
          <section key={c.id} className="mb-8 break-inside-avoid">
            <h2 className="text-lg font-semibold">{c.package_name}</h2>
            <p className="text-sm text-muted-foreground">
              Vertragszeitraum {formatDate(c.start_date)} – {formatDate(c.end_date)} · {labelOf(CONTRACT_STATUS, c.status).label}
            </p>
            {c.years.map((y) => (
              <div key={y.id} className="mt-4">
                <h3 className="text-sm font-semibold">Vertragsjahr {y.year_no} ({formatDate(y.start_date)} – {formatDate(y.end_date)})</h3>
                <table className="mt-2 w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs text-muted-foreground">
                      <th scope="col" className="py-1.5 pr-3 font-medium">Zugesagte Leistung</th>
                      <th scope="col" className="py-1.5 pr-3 font-medium">Stand</th>
                      <th scope="col" className="py-1.5 pr-3 font-medium">Erbracht am</th>
                      <th scope="col" className="py-1.5 font-medium">Nachweis</th>
                    </tr>
                  </thead>
                  <tbody>
                    {y.groups.flatMap((g) =>
                      g.units.map((u) => (
                        <tr key={u.id} className="border-b align-top">
                          <td className="py-1.5 pr-3">
                            {g.serviceName}{u.unitCount && u.unitCount > 1 ? ` (${u.unitNo}/${u.unitCount})` : ""}
                            {u.source !== "paket" && <span className="text-xs text-muted-foreground"> · {u.source === "zusatzbuchung" ? "Zusatzbuchung" : "Korrektur"}</span>}
                          </td>
                          <td className="py-1.5 pr-3">{labelOf(DELIVERABLE_PROGRESS, u.progress).label}</td>
                          <td className="py-1.5 pr-3 whitespace-nowrap">{u.fulfilledAt ? formatDate(u.fulfilledAt) : "–"}</td>
                          <td className="py-1.5 break-all">
                            {u.evidenceUrl ? <a href={u.evidenceUrl} className="text-[#b90845] underline">{u.evidenceUrl}</a> : u.cancelReason ? `Entfallen: ${u.cancelReason}` : "–"}
                          </td>
                        </tr>
                      )),
                    )}
                  </tbody>
                </table>
                <ul className="mt-2 space-y-0.5 text-xs text-muted-foreground">
                  {y.groups.map((g) => <li key={g.key}>{g.serviceName}: {g.summary}</li>)}
                </ul>
              </div>
            ))}
          </section>
        ))}

        <section className="break-inside-avoid">
          <h2 className="text-lg font-semibold">Veröffentlichungen</h2>
          {report.publications.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">Noch keine Veröffentlichungen.</p>
          ) : (
            <table className="mt-2 w-full border-collapse text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th scope="col" className="py-1.5 pr-3 font-medium">Datum</th>
                  <th scope="col" className="py-1.5 pr-3 font-medium">Kanal</th>
                  <th scope="col" className="py-1.5 pr-3 font-medium">Titel</th>
                  <th scope="col" className="py-1.5 pr-3 font-medium">Link</th>
                  {hasMetrics && <th scope="col" className="py-1.5 font-medium">Kennzahlen</th>}
                </tr>
              </thead>
              <tbody>
                {report.publications.map((p) => (
                  <tr key={p.id} className="border-b align-top">
                    <td className="py-1.5 pr-3 whitespace-nowrap">{formatDateTime(p.published_at)}</td>
                    <td className="py-1.5 pr-3">{CHANNEL_LABELS[p.channel]}</td>
                    <td className="py-1.5 pr-3">{p.title}</td>
                    <td className="py-1.5 pr-3 break-all">{p.published_url ? <a className="text-[#b90845] underline" href={p.published_url}>{p.published_url}</a> : "–"}</td>
                    {hasMetrics && (
                      <td className="py-1.5 text-xs">
                        {p.metrics ? (
                          <>
                            {p.metrics.reach != null && <div>Reichweite: {p.metrics.reach.toLocaleString("de-DE")}</div>}
                            {p.metrics.impressions != null && <div>Impressionen: {p.metrics.impressions.toLocaleString("de-DE")}</div>}
                            {p.metrics.clicks != null && <div>Klicks: {p.metrics.clicks.toLocaleString("de-DE")}</div>}
                            <div className="text-muted-foreground">Quelle: {p.metrics.source === "api" ? "Plattform" : "manuell eingetragen"}</div>
                          </>
                        ) : "–"}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="mt-4 text-xs text-muted-foreground">
            Als veröffentlicht gelten nur Inhalte mit Plattformbestätigung oder manueller Bestätigung inkl. Link. Kennzahlen werden nur angezeigt, wenn echte Daten vorliegen oder ausdrücklich manuell eingetragen wurden.
          </p>
        </section>
      </article>
    </div>
  );
}
