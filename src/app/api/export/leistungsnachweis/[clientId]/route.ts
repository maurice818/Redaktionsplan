import type { NextRequest } from "next/server";
import { getSessionProfile } from "@/lib/auth";
import { loadClientReport } from "@/lib/data/report";
import { CHANNEL_LABELS, DELIVERABLE_PROGRESS, labelOf } from "@/lib/labels";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatDateTime } from "@/lib/time";

export const dynamic = "force-dynamic";

function csvCell(value: unknown): string {
  const s = value === null || value === undefined ? "" : String(value);
  // Schutz vor Formel-Injektion in Tabellenkalkulationen
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[";\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export async function GET(_request: NextRequest, ctx: RouteContext<"/api/export/leistungsnachweis/[clientId]">) {
  const { clientId } = await ctx.params;
  const profile = await getSessionProfile();
  if (!profile?.is_active) return new Response("Nicht angemeldet", { status: 401 });

  const supabase = await createClient();
  const report = await loadClientReport(supabase, clientId);
  if (!report) return new Response("Nicht gefunden", { status: 404 });

  const rows: unknown[][] = [
    ["Leistungsnachweis", report.client.name, `Stand ${formatDateTime(new Date())}`, report.client.is_demo ? "DEMO-DATEN" : ""],
    [],
    ["Paket", "Vertragsjahr", "Zeitraum", "Leistung", "Einheit", "Herkunft", "Stand", "Erbracht am", "Nachweis/Link", "Entfallen (Grund)"],
  ];
  for (const c of report.contracts) {
    for (const y of c.years) {
      for (const g of y.groups) {
        for (const u of g.units) {
          rows.push([
            c.package_name, y.year_no, `${formatDate(y.start_date)} – ${formatDate(y.end_date)}`, g.serviceName,
            u.unitCount && u.unitCount > 1 ? `${u.unitNo}/${u.unitCount}` : "", u.source,
            labelOf(DELIVERABLE_PROGRESS, u.progress).label, u.fulfilledAt ? formatDate(u.fulfilledAt) : "", u.evidenceUrl ?? "", u.cancelReason ?? "",
          ]);
        }
      }
    }
  }
  rows.push([], ["Veröffentlicht am", "Kanal", "Titel", "Link", "Art", "Reichweite", "Impressionen", "Klicks", "Quelle Kennzahlen"]);
  for (const p of report.publications) {
    rows.push([
      formatDateTime(p.published_at), CHANNEL_LABELS[p.channel] ?? p.channel, p.title, p.published_url ?? "",
      p.publish_method === "api" ? "per Schnittstelle" : "manuell bestätigt",
      p.metrics?.reach ?? "", p.metrics?.impressions ?? "", p.metrics?.clicks ?? "",
      p.metrics ? (p.metrics.source === "api" ? "Plattform" : "manuell") : "",
    ]);
  }

  const csv = "﻿" + rows.map((r) => r.map(csvCell).join(";")).join("\r\n");
  const safeName = report.client.name.replace(/[^\p{L}\p{N}_-]+/gu, "-").replace(/-+/g, "-").slice(0, 60);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="Leistungsnachweis-${safeName}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
