import Link from "next/link";
import { PageHeader } from "@/components/common/page-header";
import { Section } from "@/components/common/section";
import { StatusBadge } from "@/components/common/status-badge";
import { Timeline, type AuditEntry } from "@/components/common/timeline";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { requireEditor } from "@/lib/auth";
import { EMAIL_STATUS, labelOf } from "@/lib/labels";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/time";

export const metadata = { title: "Protokolle" };

export default async function LogsPage() {
  await requireEditor();
  const supabase = await createClient();
  const [emails, runs, audit, reminders] = await Promise.all([
    supabase.from("email_events").select("*").order("created_at", { ascending: false }).limit(200),
    supabase.from("job_runs").select("*").order("started_at", { ascending: false }).limit(50),
    supabase.from("audit_log").select("id, occurred_at, actor_label, action, entity_type, entity_id, summary, changes, reason").order("occurred_at", { ascending: false }).limit(150),
    supabase.from("reminder_log").select("*").order("fired_at", { ascending: false }).limit(100),
  ]);
  return (
    <div>
      <PageHeader title="Protokolle" description="E-Mail-Versand, Hintergrundläufe, Erinnerungen und Änderungsprotokoll. Link-Tokens werden nie im Klartext protokolliert." />
      <Tabs defaultValue="emails" className="gap-4">
        <TabsList className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="emails">E-Mails</TabsTrigger>
          <TabsTrigger value="laeufe">Hintergrundläufe</TabsTrigger>
          <TabsTrigger value="erinnerungen">Erinnerungen</TabsTrigger>
          <TabsTrigger value="aenderungen">Änderungen</TabsTrigger>
        </TabsList>
        <TabsContent value="emails">
          <Section bodyClassName="p-0">
            <ul className="divide-y text-sm">
              {(emails.data ?? []).length === 0 && <li className="px-4 py-4 text-muted-foreground">Keine E-Mails protokolliert.</li>}
              {(emails.data ?? []).map((e) => (
                <li key={e.id} className="flex flex-wrap items-start gap-3 px-4 py-2.5">
                  <StatusBadge def={labelOf(EMAIL_STATUS, e.status)} />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{e.subject}</p>
                    <p className="text-xs text-muted-foreground">an {e.to_name ? `${e.to_name} <${e.to_email}>` : e.to_email} · Vorlage {e.template_key} · {e.triggered_by}{e.dossier_id && <> · <Link href={`/beitraege/${e.dossier_id}`} className="text-[#b90845] hover:underline">Akte</Link></>}</p>
                    {e.error && <p className="text-xs text-red-700">{e.error}</p>}
                  </div>
                  <span className="text-xs text-muted-foreground">{formatDateTime(e.sent_at ?? e.created_at)}</span>
                </li>
              ))}
            </ul>
          </Section>
        </TabsContent>
        <TabsContent value="laeufe">
          <Section bodyClassName="p-0">
            <ul className="divide-y text-sm">
              {(runs.data ?? []).length === 0 && <li className="px-4 py-4 text-muted-foreground">Noch keine Läufe.</li>}
              {(runs.data ?? []).map((r) => (
                <li key={r.id} className="px-4 py-2.5">
                  <p className="flex flex-wrap items-center gap-2">
                    <StatusBadge def={{ label: r.status, tone: r.status === "ok" ? "success" : r.status === "fehler" ? "danger" : "neutral" }} />
                    <span>{formatDateTime(r.started_at)}</span>
                    <span className="text-xs text-muted-foreground">{r.trigger}{r.finished_at && ` · ${Math.round((new Date(r.finished_at).getTime() - new Date(r.started_at).getTime()) / 100) / 10} s`}</span>
                  </p>
                  {r.error && <p className="mt-1 text-xs whitespace-pre-line text-red-700">{r.error}</p>}
                  {r.summary && <details className="mt-1 text-xs"><summary className="cursor-pointer text-muted-foreground">Details</summary><pre className="mt-1 overflow-auto rounded bg-muted p-2">{JSON.stringify(r.summary, null, 2)}</pre></details>}
                </li>
              ))}
            </ul>
          </Section>
        </TabsContent>
        <TabsContent value="erinnerungen">
          <Section bodyClassName="p-0">
            <ul className="divide-y text-sm">
              {(reminders.data ?? []).length === 0 && <li className="px-4 py-4 text-muted-foreground">Noch keine Erinnerungen ausgelöst.</li>}
              {(reminders.data ?? []).map((r) => (
                <li key={r.id} className="flex flex-wrap gap-3 px-4 py-2 text-xs">
                  <span className="w-40">{formatDateTime(r.fired_at)}</span>
                  <span className="font-medium">{r.rule_key}</span>
                  <span className="text-muted-foreground">Nr. {r.occurrence}</span>
                  <span className="flex-1 truncate text-muted-foreground">{r.outcome ? JSON.stringify(r.outcome) : ""}</span>
                </li>
              ))}
            </ul>
          </Section>
        </TabsContent>
        <TabsContent value="aenderungen">
          <Section><Timeline entries={(audit.data ?? []) as AuditEntry[]} /></Section>
        </TabsContent>
      </Tabs>
    </div>
  );
}
