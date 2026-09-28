import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink, FileText, Mail, Phone, Printer } from "lucide-react";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { KeyValue, Section } from "@/components/common/section";
import { Pill, StatusBadge } from "@/components/common/status-badge";
import { Timeline, type AuditEntry } from "@/components/common/timeline";
import { NoteForm } from "@/components/common/note-form";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { requireProfile } from "@/lib/auth";
import { currentYearId, groupDeliverables, loadDeliverables } from "@/lib/data/deliverables";
import { getPackageTemplates, getPeople, getServiceTypes, peopleOptions, personName } from "@/lib/data/lookups";
import {
  CHANNEL_LABELS, CLIENT_STATUS, CONTENT_STATUS, CONTRACT_STATUS, DELIVERABLE_PROGRESS, DELIVERABLE_SOURCE, DOSSIER_STATUS, labelOf,
} from "@/lib/labels";
import { canEdit } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { addDays, addMonths, berlinToday, formatDate, formatDateTime } from "@/lib/time";
import {
  AddDeliverableDialog, AddYearButton, BookMembershipDialog, ContactDialog, ContractDialog, CorrectDeliverableDialog,
  CreateDossierButton, DeleteContactButton, EditClientDialog,
} from "./client-dialogs";

export default async function ClientDetailPage({ params, searchParams }: PageProps<"/kunden/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  const profile = await requireProfile();
  const editor = canEdit(profile.role);
  const supabase = await createClient();
  const today = berlinToday();

  const { data: client } = await supabase.from("clients").select("*, contacts(*)").eq("id", id).maybeSingle();
  if (!client) notFound();

  const [contractsRes, dossiersRes, auditRes, people, templates, serviceTypes, units] = await Promise.all([
    supabase.from("contracts").select("*, contract_years(id, year_no, start_date, end_date)").eq("client_id", id).order("start_date", { ascending: false }),
    supabase
      .from("dossiers")
      .select("id, title, status, topic, owner_id, period_start, period_end, updated_at, content_items(id, title, channel, status, scheduled_at, published_at, published_url)")
      .eq("client_id", id)
      .order("updated_at", { ascending: false }),
    supabase.from("audit_log").select("id, occurred_at, actor_label, action, entity_type, entity_id, summary, changes, reason").eq("client_id", id).order("occurred_at", { ascending: false }).limit(60),
    getPeople(),
    getPackageTemplates(),
    getServiceTypes(),
    loadDeliverables(supabase, { clientId: id }),
  ]);

  const contracts = contractsRes.data ?? [];
  const dossiers = dossiersRes.data ?? [];
  const personOpts = peopleOptions(people);
  const published = dossiers.flatMap((d) => d.content_items.filter((c) => c.status === "veroeffentlicht").map((c) => ({ ...c, dossierId: d.id })));
  const links = (Array.isArray(client.links) ? client.links : []) as { label: string; url: string }[];
  const tab = typeof sp.tab === "string" ? sp.tab : "leistungen";

  // Nächste Schritte (aus offenen Leistungen & Akten abgeleitet)
  const nextSteps: { text: string; href: string }[] = [];
  for (const u of units.filter((u) => u.progress === "ohne_thema").slice(0, 3)) {
    nextSteps.push({ text: `${u.title}${u.unitCount && u.unitCount > 1 ? ` ${u.unitNo}/${u.unitCount}` : ""}: Thema festlegen und Akte anlegen`, href: `/kunden/${id}?tab=leistungen` });
  }
  for (const d of dossiers.filter((d) => d.status === "aktiv").slice(0, 4)) {
    const pending = d.content_items.find((c) => !["veroeffentlicht", "archiviert"].includes(c.status));
    if (pending) nextSteps.push({ text: `${d.title}: ${labelOf(CONTENT_STATUS, pending.status).label} (${CHANNEL_LABELS[pending.channel]})`, href: `/beitraege/${d.id}` });
  }

  return (
    <div>
      <PageHeader
        back={{ href: "/kunden", label: "Kunden & Memberships" }}
        title={client.name}
        description={[client.category, client.city].filter(Boolean).join(" · ") || undefined}
        meta={
          <>
            <StatusBadge def={labelOf(CLIENT_STATUS, client.status)} />
            {client.is_demo && <Pill tone="warning">DEMO-DATEN</Pill>}
            <span className="text-xs text-muted-foreground">Zuständig: {personName(people, client.owner_id)}</span>
          </>
        }
        actions={
          <>
            <Button asChild variant="outline"><Link href={`/kunden/${id}/nachweis`}><Printer /> Leistungsnachweis</Link></Button>
            {editor && <EditClientDialog client={{ ...client, links }} people={personOpts} />}
          </>
        }
      />

      <Tabs defaultValue={tab} className="gap-4">
        <TabsList className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="leistungen">Memberships & Leistungen</TabsTrigger>
          <TabsTrigger value="beitraege">Beiträge ({dossiers.length})</TabsTrigger>
          <TabsTrigger value="stammdaten">Stammdaten & Kontakte</TabsTrigger>
          <TabsTrigger value="historie">Historie</TabsTrigger>
        </TabsList>

        <TabsContent value="leistungen" id="leistungen" className="grid gap-4">
          {nextSteps.length > 0 && (
            <Section title="Nächste Schritte">
              <ul className="space-y-1.5 text-sm">
                {nextSteps.map((s) => (
                  <li key={s.text}><Link href={s.href} className="hover:text-[#b90845] hover:underline">→ {s.text}</Link></li>
                ))}
              </ul>
            </Section>
          )}

          <div className="flex flex-wrap items-center gap-2">
            {editor && (
              <>
                <BookMembershipDialog
                  clientId={id}
                  templates={templates.filter((t) => t.is_active).map((t) => ({ value: t.id, label: t.name }))}
                  people={personOpts}
                  today={today}
                  defaultEnd={addDays(addMonths(today, 12), -1)}
                />
                <AddDeliverableDialog
                  clientId={id}
                  contracts={contracts.map((c) => ({
                    id: c.id,
                    label: c.package_name,
                    years: c.contract_years.sort((a, b) => a.year_no - b.year_no).map((y) => ({ id: y.id, label: `Jahr ${y.year_no} (${formatDate(y.start_date)} – ${formatDate(y.end_date)})` })),
                  }))}
                  serviceTypes={serviceTypes.filter((s) => s.is_active).map((s) => ({ value: s.id, label: s.name }))}
                  people={personOpts}
                />
              </>
            )}
          </div>

          {contracts.length === 0 && units.length === 0 && (
            <EmptyState icon={FileText} title="Noch keine Membership gebucht">
              Buchen Sie ein Paket – die zugesagten Leistungen werden je Vertragsjahr automatisch erzeugt.
            </EmptyState>
          )}

          {contracts.map((c) => {
            const years = c.contract_years.sort((a, b) => b.year_no - a.year_no);
            const current = currentYearId(units, c.id, today);
            return (
              <Section
                key={c.id}
                title={
                  <span className="flex flex-wrap items-center gap-2">
                    {c.package_name}
                    <StatusBadge def={labelOf(CONTRACT_STATUS, c.status)} />
                    <span className="text-xs font-normal text-muted-foreground">
                      {formatDate(c.start_date)} – {formatDate(c.end_date)}
                      {c.renewal_date && ` · Verlängerung/Kündigung: ${formatDate(c.renewal_date)}`}
                      {c.auto_renew && " · verlängert sich automatisch"}
                    </span>
                  </span>
                }
                description={`Gebuchter Stand: Vorlage Revision ${c.package_revision ?? "–"} vom ${formatDateTime((c.package_snapshot as { booked_at?: string })?.booked_at ?? c.created_at)} · Zuständig: ${personName(people, c.owner_id)}`}
                action={editor && <><AddYearButton contractId={c.id} /><ContractDialog contract={c} people={personOpts} /></>}
              >
                <div className="grid gap-4">
                  {years.map((y) => {
                    const groups = groupDeliverables(units.filter((u) => u.contractId === c.id && u.yearId === y.id));
                    return (
                      <div key={y.id} className={y.id === current ? "" : "opacity-80"}>
                        <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
                          Vertragsjahr {y.year_no}
                          <span className="text-xs font-normal text-muted-foreground">{formatDate(y.start_date)} – {formatDate(y.end_date)}</span>
                          {y.id === current && <Pill tone="brand">aktuell</Pill>}
                        </h3>
                        {groups.length === 0 && <p className="text-sm text-muted-foreground">Keine Leistungen.</p>}
                        <div className="grid gap-3">
                          {groups.map((g) => (
                            <div key={g.key} className="rounded-lg border border-border">
                              <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/30 px-3 py-2">
                                <p className="text-sm font-medium">{g.serviceName}</p>
                                <p className={g.done === g.total ? "text-xs font-medium text-emerald-700" : "text-xs text-muted-foreground"}>{g.summary}</p>
                              </div>
                              <ul className="divide-y">
                                {g.units.map((u) => (
                                  <li key={u.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm">
                                    <span className="min-w-40 flex-1">
                                      {u.unitCount && u.unitCount > 1 ? `Einheit ${u.unitNo} von ${u.unitCount}` : u.title}
                                      {u.source !== "paket" && <Pill tone="info" className="ml-2">{DELIVERABLE_SOURCE[u.source]}</Pill>}
                                      {u.dossiers[0] && (
                                        <Link href={`/beitraege/${u.dossiers[0].id}`} className="ml-2 text-xs text-[#b90845] hover:underline">{u.dossiers[0].title}</Link>
                                      )}
                                      {u.contents.filter((x) => x.published_url).map((x) => (
                                        <a key={x.id} href={x.published_url!} target="_blank" rel="noreferrer" className="ml-2 inline-flex items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground">
                                          {CHANNEL_LABELS[x.channel]} <ExternalLink className="size-3" aria-hidden />
                                        </a>
                                      ))}
                                    </span>
                                    <StatusBadge def={labelOf(DELIVERABLE_PROGRESS, u.progress)} />
                                    <span className="w-32 text-xs text-muted-foreground">{personName(people, u.ownerId)}</span>
                                    <span className="w-24 text-xs text-muted-foreground">{u.dueDate ? `fällig ${formatDate(u.dueDate)}` : ""}</span>
                                    {editor && (
                                      <span className="flex items-center gap-1">
                                        {u.contentKind && !u.parentId && (
                                          <CreateDossierButton deliverableId={u.id} existingDossierId={u.dossiers[0]?.id} />
                                        )}
                                        <CorrectDeliverableDialog unit={{ id: u.id, title: u.title, status: u.status, ownerId: u.ownerId, dueDate: u.dueDate, evidenceUrl: u.evidenceUrl, fulfillmentNote: u.fulfillmentNote, cancelReason: u.cancelReason }} people={personOpts} />
                                      </span>
                                    )}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Section>
            );
          })}

          {units.some((u) => !u.contractId) && (
            <Section title="Leistungen ohne Vertragszuordnung">
              <ul className="divide-y text-sm">
                {units.filter((u) => !u.contractId).map((u) => (
                  <li key={u.id} className="flex items-center gap-3 py-2">
                    <span className="flex-1">{u.title}</span>
                    <StatusBadge def={labelOf(DELIVERABLE_PROGRESS, u.progress)} />
                    {editor && <CorrectDeliverableDialog unit={{ id: u.id, title: u.title, status: u.status, ownerId: u.ownerId, dueDate: u.dueDate, evidenceUrl: u.evidenceUrl, fulfillmentNote: u.fulfillmentNote, cancelReason: u.cancelReason }} people={personOpts} />}
                  </li>
                ))}
              </ul>
            </Section>
          )}

          <Section title="Veröffentlichungslinks" description="Tatsächlich veröffentlichte Inhalte mit Datum – Grundlage des Leistungsnachweises.">
            {published.length === 0 ? (
              <p className="text-sm text-muted-foreground">Noch keine Veröffentlichungen.</p>
            ) : (
              <ul className="divide-y text-sm">
                {published.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center gap-3 py-2">
                    <Link href={`/beitraege/${p.dossierId}/inhalte/${p.id}`} className="flex-1 hover:text-[#b90845]">{p.title}</Link>
                    <span className="text-xs text-muted-foreground">{CHANNEL_LABELS[p.channel]} · {formatDateTime(p.published_at)}</span>
                    {p.published_url && <a href={p.published_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-[#b90845] hover:underline">Link <ExternalLink className="size-3" /></a>}
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </TabsContent>

        <TabsContent value="beitraege" className="grid gap-3">
          {dossiers.length === 0 ? (
            <EmptyState icon={FileText} title="Noch keine Beitragsakten">Legen Sie eine Akte direkt an einer gebuchten Leistung an („Akte anlegen“).</EmptyState>
          ) : (
            dossiers.map((d) => (
              <Link key={d.id} href={`/beitraege/${d.id}`} className="block rounded-xl border border-border bg-card p-4 hover:border-stone-400">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium">{d.title}</p>
                  <StatusBadge def={labelOf(DOSSIER_STATUS, d.status)} />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {d.topic ?? "Ohne Thema"} · {personName(people, d.owner_id)}
                  {(d.period_start || d.period_end) && ` · Zeitraum ${formatDate(d.period_start)} – ${formatDate(d.period_end)}`}
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {d.content_items.map((c) => (
                    <span key={c.id} className="inline-flex items-center gap-1 text-xs">
                      <Pill>{CHANNEL_LABELS[c.channel]}</Pill>
                      <StatusBadge def={labelOf(CONTENT_STATUS, c.status)} />
                    </span>
                  ))}
                </div>
              </Link>
            ))
          )}
        </TabsContent>

        <TabsContent value="stammdaten" className="grid gap-4 lg:grid-cols-2">
          <Section title="Stammdaten">
            <dl>
              <KeyValue label="Firmenname">{client.name}</KeyValue>
              <KeyValue label="Rechtlicher Name">{client.legal_name}</KeyValue>
              <KeyValue label="Kategorie">{client.category}</KeyValue>
              <KeyValue label="Adresse">{[client.street, [client.postal_code, client.city].filter(Boolean).join(" "), client.country].filter(Boolean).join(", ") || "–"}</KeyValue>
              <KeyValue label="Website">{client.website ? <a className="text-[#b90845] hover:underline" href={client.website} target="_blank" rel="noreferrer">{client.website}</a> : "–"}</KeyValue>
              <KeyValue label="E-Mail">{client.email}</KeyValue>
              <KeyValue label="Telefon">{client.phone}</KeyValue>
              <KeyValue label="Zuständig">{personName(people, client.owner_id)}</KeyValue>
            </dl>
            {links.length > 0 && (
              <div className="mt-3">
                <p className="mb-1 text-xs font-medium text-muted-foreground">Relevante Links</p>
                <ul className="space-y-1 text-sm">
                  {links.map((l) => <li key={l.url}><a href={l.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[#b90845] hover:underline">{l.label} <ExternalLink className="size-3" /></a></li>)}
                </ul>
              </div>
            )}
            {client.notes && <p className="mt-3 whitespace-pre-line rounded-lg bg-muted/50 p-3 text-sm">{client.notes}</p>}
          </Section>
          <Section title="Ansprechpartner" action={editor && <ContactDialog clientId={id} />}>
            {client.contacts.length === 0 ? (
              <p className="text-sm text-muted-foreground">Noch keine Ansprechpartner.</p>
            ) : (
              <ul className="divide-y">
                {client.contacts.map((c) => {
                  const name = [c.first_name, c.last_name].filter(Boolean).join(" ");
                  return (
                    <li key={c.id} className="flex items-start gap-2 py-2.5 text-sm">
                      <div className="flex-1">
                        <p className="font-medium">
                          {name}
                          {c.is_primary && <Pill tone="brand" className="ml-2">Haupt</Pill>}
                          {c.can_approve && <Pill tone="success" className="ml-1">freigabeberechtigt</Pill>}
                        </p>
                        {c.position && <p className="text-xs text-muted-foreground">{c.position}</p>}
                        <p className="mt-0.5 flex flex-wrap gap-3 text-xs">
                          {c.email && <a href={`mailto:${c.email}`} className="inline-flex items-center gap-1 hover:underline"><Mail className="size-3" /> {c.email}</a>}
                          {c.phone && <span className="inline-flex items-center gap-1"><Phone className="size-3" /> {c.phone}</span>}
                        </p>
                      </div>
                      {editor && (
                        <>
                          <ContactDialog clientId={id} contact={c} />
                          <DeleteContactButton id={c.id} name={name} />
                        </>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </Section>
        </TabsContent>

        <TabsContent value="historie">
          <Section title="Historie" description="Änderungen an Kunde, Verträgen, Leistungen und Akten – mit Begründungen.">
            {editor && <NoteForm clientId={id} />}
            <div className="mt-4">
              <Timeline entries={(auditRes.data ?? []) as AuditEntry[]} />
            </div>
          </Section>
        </TabsContent>
      </Tabs>
    </div>
  );
}
