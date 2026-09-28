import Link from "next/link";
import { BadgeCheck, Inbox, MessageSquare, ShieldAlert, UserCheck } from "lucide-react";
import { QuickReview } from "@/components/content/quick-review";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { Pill, StatusBadge } from "@/components/common/status-badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { requireProfile } from "@/lib/auth";
import { getPeople, personName } from "@/lib/data/lookups";
import { APPROVAL_DECISION, CHANNEL_LABELS, CONTENT_KIND_LABELS, MATERIAL_STATUS, PREVIEW_STATUS, labelOf } from "@/lib/labels";
import { canApprove } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { berlinDate, berlinToday, daysBetween, formatDate, formatDateTime, isoFromNow } from "@/lib/time";

export const metadata = { title: "Freigaben" };

export default async function ApprovalsPage({ searchParams }: PageProps<"/freigaben">) {
  const sp = await searchParams;
  const profile = await requireProfile();
  const approver = canApprove(profile.role);
  const supabase = await createClient();
  const today = berlinToday();
  const since = isoFromNow(-30 * 86_400_000);

  const [reviewRes, previewRes, decisionsRes, materialRes, invalidRes, people] = await Promise.all([
    supabase
      .from("content_items")
      .select("id, title, kind, channel, dossier_id, assignee_id, updated_at, current_version_no, scheduled_at, dossiers(title, kind, clients(name))")
      .eq("status", "interne_pruefung")
      .order("updated_at"),
    supabase
      .from("previews")
      .select("id, status, round, sent_at, first_viewed_at, response_due_date, recipient_name, dossier_id, clients(name), dossiers(title), preview_items(decision)")
      .in("status", ["erstellt", "versendet", "geoeffnet", "teilweise_beantwortet"])
      .is("revoked_at", null)
      .order("sent_at", { nullsFirst: true }),
    supabase
      .from("approvals")
      .select("id, kind, decision, comment, decided_at, decided_by, approver_name, approver_email, dossier_id, content_items(title, channel, kind), content_versions(version_no)")
      .gte("decided_at", since)
      .order("decided_at", { ascending: false })
      .limit(60),
    supabase
      .from("material_requests")
      .select("id, status, submitted_at, dossier_id, clients(name), dossiers(title), material_responses(submitted_by_name)")
      .eq("status", "eingereicht")
      .order("submitted_at"),
    supabase
      .from("content_items")
      .select("id, title, channel, dossier_id, approval_invalidated_at, status, dossiers(title)")
      .not("approval_invalidated_at", "is", null)
      .eq("approvals_complete", false)
      .not("status", "in", "(veroeffentlicht,archiviert)")
      .gte("approval_invalidated_at", since)
      .order("approval_invalidated_at", { ascending: false }),
    getPeople(),
  ]);

  const reviews = reviewRes.data ?? [];
  const previews = previewRes.data ?? [];
  const decisions = decisionsRes.data ?? [];
  const materials = materialRes.data ?? [];
  const invalid = invalidRes.data ?? [];
  const tab = typeof sp.tab === "string" ? sp.tab : "intern";

  return (
    <div>
      <PageHeader
        title="Freigaben"
        description="Interne Prüfung, Kundenvorschauen und dokumentierte Entscheidungen. Jede Freigabe gilt für eine konkrete Version."
      />
      <Tabs defaultValue={tab} className="gap-4">
        <TabsList className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="intern">Interne Prüfung ({reviews.length})</TabsTrigger>
          <TabsTrigger value="kunde">Beim Kunden ({previews.length})</TabsTrigger>
          <TabsTrigger value="rueckmeldungen">Entscheidungen (30 Tage)</TabsTrigger>
          <TabsTrigger value="material">Material eingegangen ({materials.length})</TabsTrigger>
          <TabsTrigger value="ungueltig">Freigabe ungültig ({invalid.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="intern">
          {!approver && <p className="mb-3 text-sm text-muted-foreground">Interne Freigaben erteilen Personen mit der Rolle Freigabe/Leitung oder Admin.</p>}
          {reviews.length === 0 ? (
            <EmptyState icon={UserCheck} title="Nichts wartet auf interne Prüfung" />
          ) : (
            <ul className="grid gap-3">
              {reviews.map((c) => (
                <li key={c.id} className="rounded-xl border border-border bg-card p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/beitraege/${c.dossier_id}/inhalte/${c.id}`} className="font-medium hover:text-[#b90845]">{c.title}</Link>
                    <Pill tone="brand">{CONTENT_KIND_LABELS[c.kind]} · {CHANNEL_LABELS[c.channel]}</Pill>
                    <Pill>Version {c.current_version_no}</Pill>
                    <span className="ml-auto text-xs text-muted-foreground">seit {formatDate(berlinDate(c.updated_at))} · {personName(people, c.assignee_id)}</span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {c.dossiers?.kind === "kunde" ? c.dossiers.clients?.name : "Eigene Redaktion"} · {c.dossiers?.title}
                    {c.scheduled_at && ` · geplant ${formatDateTime(c.scheduled_at)}`}
                  </p>
                  {approver && <div className="mt-3"><QuickReview contentId={c.id} /></div>}
                </li>
              ))}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="kunde">
          {previews.length === 0 ? (
            <EmptyState icon={Inbox} title="Keine offenen Kundenvorschauen" />
          ) : (
            <div className="overflow-x-auto rounded-xl border border-border bg-card">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                  <tr>
                    <th scope="col" className="px-4 py-2.5 font-medium">Kunde / Akte</th>
                    <th scope="col" className="px-4 py-2.5 font-medium">Status</th>
                    <th scope="col" className="px-4 py-2.5 font-medium">Versendet</th>
                    <th scope="col" className="px-4 py-2.5 font-medium">Antwort bis</th>
                    <th scope="col" className="px-4 py-2.5 font-medium">Entschieden</th>
                  </tr>
                </thead>
                <tbody>
                  {previews.map((p) => {
                    const decided = p.preview_items.filter((i) => i.decision).length;
                    const late = p.response_due_date && p.response_due_date < today;
                    return (
                      <tr key={p.id} className="border-b last:border-0">
                        <td className="px-4 py-3">
                          <Link href={`/beitraege/${p.dossier_id}#vorschauen`} className="font-medium hover:text-[#b90845]">{p.clients?.name}</Link>
                          <div className="text-xs text-muted-foreground">{p.dossiers?.title} · Runde {p.round} · {p.recipient_name}</div>
                        </td>
                        <td className="px-4 py-3"><StatusBadge def={labelOf(PREVIEW_STATUS, p.status)} /></td>
                        <td className="px-4 py-3 text-xs">{p.sent_at ? `${formatDate(p.sent_at)} (vor ${daysBetween(berlinDate(p.sent_at), today)} Tagen)` : "noch nicht"}</td>
                        <td className={`px-4 py-3 text-xs ${late ? "font-medium text-red-700" : ""}`}>{formatDate(p.response_due_date)}</td>
                        <td className="px-4 py-3 text-xs">{decided} / {p.preview_items.length}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="rueckmeldungen">
          {decisions.length === 0 ? (
            <EmptyState icon={MessageSquare} title="Keine Entscheidungen in den letzten 30 Tagen" />
          ) : (
            <ul className="grid gap-2">
              {decisions.map((a) => (
                <li key={a.id} className="flex flex-wrap items-start gap-3 rounded-xl border border-border bg-card px-4 py-3 text-sm">
                  <StatusBadge def={labelOf(APPROVAL_DECISION, a.decision)} />
                  <div className="min-w-0 flex-1">
                    <Link href={`/beitraege/${a.dossier_id}`} className="font-medium hover:text-[#b90845]">{a.content_items?.title}</Link>
                    <p className="text-xs text-muted-foreground">
                      {a.kind === "kunde" ? "Kunde" : "Intern"}: {a.decided_by ? personName(people, a.decided_by) : `${a.approver_name} <${a.approver_email}>`} · {CHANNEL_LABELS[a.content_items?.channel ?? ""]} · Version {a.content_versions?.version_no}
                    </p>
                    {a.comment && <p className="mt-1 rounded bg-muted/60 p-2 text-xs">„{a.comment}“</p>}
                  </div>
                  <span className="text-xs text-muted-foreground">{formatDateTime(a.decided_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="material">
          {materials.length === 0 ? (
            <EmptyState icon={BadgeCheck} title="Kein eingegangenes Material zu prüfen" />
          ) : (
            <ul className="grid gap-2">
              {materials.map((m) => {
                const response = Array.isArray(m.material_responses) ? m.material_responses[0] : m.material_responses;
                return (
                  <li key={m.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 text-sm">
                    <StatusBadge def={labelOf(MATERIAL_STATUS, m.status)} />
                    <Link href={`/beitraege/${m.dossier_id}#material`} className="flex-1 font-medium hover:text-[#b90845]">{m.clients?.name} – {m.dossiers?.title}</Link>
                    <span className="text-xs text-muted-foreground">eingereicht {formatDateTime(m.submitted_at)}{response?.submitted_by_name ? ` von ${response.submitted_by_name}` : ""}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="ungueltig">
          {invalid.length === 0 ? (
            <EmptyState icon={ShieldAlert} title="Keine ungültig gewordenen Freigaben" />
          ) : (
            <ul className="grid gap-2">
              {invalid.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-orange-200 bg-orange-50/60 px-4 py-3 text-sm">
                  <ShieldAlert className="size-4 text-orange-700" aria-hidden />
                  <Link href={`/beitraege/${c.dossier_id}/inhalte/${c.id}`} className="flex-1 font-medium hover:text-[#b90845]">{c.title}</Link>
                  <span className="text-xs text-muted-foreground">{CHANNEL_LABELS[c.channel]} · {c.dossiers?.title} · geändert {formatDateTime(c.approval_invalidated_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
