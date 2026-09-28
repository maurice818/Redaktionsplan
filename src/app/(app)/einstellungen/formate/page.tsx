import { ExternalLink } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { Section } from "@/components/common/section";
import { Pill } from "@/components/common/status-badge";
import { requireProfile } from "@/lib/auth";
import { describeRule } from "@/lib/domain/format-text";
import { getFormatRules } from "@/lib/data/lookups";
import { CHANNEL_LABELS } from "@/lib/labels";
import { isAdmin } from "@/lib/permissions";
import { formatDate, formatDateTime } from "@/lib/time";
import { FormatDialog } from "./format-dialog";

export const metadata = { title: "Formatregeln" };

export default async function FormatsPage() {
  const profile = await requireProfile();
  const admin = isAdmin(profile.role);
  const rules = await getFormatRules();
  const channels = ["instagram", "facebook", "linkedin", "magazin"];
  return (
    <div>
      <PageHeader
        title="Formatregeln"
        description="Konfigurierbare Vorgaben je Kanal und Format – mit Quelle und Prüfdatum. Sie werden bei der Medienauswahl angezeigt und vor jeder Veröffentlichung geprüft."
        actions={<FormatDialog disabled={!admin} />}
      />
      <p className="mb-4 rounded-md bg-sky-50 p-3 text-sm text-sky-900">
        Plattformvorgaben ändern sich. Die hinterlegten Werte wurden am {formatDate("2026-09-24")} anhand der offiziellen Dokumentation geprüft (bei Widersprüchen in den Quellen ist das vermerkt). Bitte regelmäßig kontrollieren.
      </p>
      <div className="grid gap-4">
        {channels.map((ch) => (
          <Section key={ch} title={CHANNEL_LABELS[ch]} bodyClassName="p-0">
            <ul className="divide-y">
              {rules.filter((r) => r.channel === ch).map((r) => (
                <li key={r.id} className="flex gap-3 px-4 py-3 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 font-medium">
                      {r.label}
                      {!r.api_supported && <Pill tone="warning">manuell</Pill>}
                      {!r.is_active && <Pill>inaktiv</Pill>}
                    </p>
                    <ul className="mt-1 list-disc pl-4 text-xs text-muted-foreground">
                      {describeRule(r).map((t) => <li key={t}>{t}</li>)}
                    </ul>
                    {r.notes && <p className="mt-1 text-xs">{r.notes}</p>}
                    <p className="mt-1 flex flex-wrap gap-3 text-[11px] text-muted-foreground">
                      {r.source_url && <a href={r.source_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[#b90845] hover:underline">Quelle <ExternalLink className="size-3" /></a>}
                      <span>Zuletzt geändert: {formatDateTime(r.updated_at)}</span>
                    </p>
                  </div>
                  <FormatDialog rule={r} disabled={!admin} />
                </li>
              ))}
            </ul>
          </Section>
        ))}
      </div>
    </div>
  );
}
