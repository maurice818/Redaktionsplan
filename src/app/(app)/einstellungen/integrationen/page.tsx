import { AlertTriangle, ExternalLink, Info } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { Section } from "@/components/common/section";
import { Pill, StatusBadge } from "@/components/common/status-badge";
import { Button } from "@/components/ui/button";
import { requireProfile } from "@/lib/auth";
import { features, serverEnv } from "@/lib/env.server";
import { getPlatformAccounts } from "@/lib/data/lookups";
import { param } from "@/lib/data/saved-filters";
import { CHANNEL_LABELS, CONNECTION_STATUS, labelOf } from "@/lib/labels";
import { isAdmin } from "@/lib/permissions";
import { adapters } from "@/lib/platforms/registry";
import { formatDateTime, requestNow } from "@/lib/time";
import { AccountButtons, AccountDialog, ApiSwitch } from "./integration-actions";

export const metadata = { title: "Integrationen" };

export default async function IntegrationsPage({ searchParams }: PageProps<"/einstellungen/integrationen">) {
  const sp = await searchParams;
  const profile = await requireProfile();
  const admin = isAdmin(profile.role);
  const accounts = await getPlatformAccounts();
  const error = param(sp.fehler);
  const hint = param(sp.hinweis);
  const soon = requestNow() + 14 * 86_400_000;

  const platforms = [
    { key: "instagram", configured: features.meta(), connect: "/api/integrations/meta/start", connectLabel: "Mit Meta verbinden (Facebook Login)", docs: "https://developers.facebook.com/docs/instagram-platform/content-publishing" },
    { key: "facebook", configured: features.meta(), connect: "/api/integrations/meta/start", connectLabel: "Mit Meta verbinden (Facebook Login)", docs: "https://developers.facebook.com/docs/pages-api/posts" },
    { key: "linkedin", configured: features.linkedin(), connect: "/api/integrations/linkedin/start", connectLabel: "Mit LinkedIn verbinden", docs: "https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api" },
  ] as const;

  return (
    <div>
      <PageHeader
        title="Integrationen"
        description="Verbindung zu den eigenen MEET-GERMANY-Unternehmensseiten. Kundenbeiträge werden über diese Kanäle veröffentlicht – Kunden verbinden keine eigenen Konten."
        actions={admin && <AccountDialog />}
      />
      {error && <p role="alert" className="mb-4 flex gap-2 rounded-md bg-red-50 p-3 text-sm text-red-900"><AlertTriangle className="size-4 shrink-0" /> {error}</p>}
      {hint && <p role="status" className="mb-4 flex gap-2 rounded-md bg-emerald-50 p-3 text-sm text-emerald-900"><Info className="size-4 shrink-0" /> {hint}</p>}
      <p className="mb-4 rounded-md bg-sky-50 p-3 text-sm text-sky-900">
        Ohne verbundene und freigeschaltete Schnittstelle funktioniert alles weiter: Zum verbindlichen Termin entsteht eine Aufgabe „Manuell veröffentlichen“ mit vorbereitetem Text und Medien; danach wird der Link eingetragen. Zugangsdaten liegen ausschließlich serverseitig und verschlüsselt.
      </p>

      <div className="grid gap-4">
        {platforms.map((p) => {
          const adapter = adapters[p.key];
          const list = accounts.filter((a) => a.platform === p.key);
          return (
            <Section
              key={p.key}
              title={<span className="flex items-center gap-2">{CHANNEL_LABELS[p.key]} {!p.configured && <Pill tone="warning">Einrichtung erforderlich</Pill>}</span>}
              description={adapter.label}
              action={admin && p.configured && <Button asChild size="sm"><a href={p.connect}>{p.connectLabel}</a></Button>}
            >
              <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
                <div>
                  {list.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Noch kein Konto. {p.configured ? "Über „Verbinden“ anlegen." : "App-Zugangsdaten fehlen – Konto kann trotzdem für manuelle Veröffentlichung angelegt werden."}</p>
                  ) : (
                    <ul className="grid gap-2">
                      {list.map((a) => {
                        const expiring = a.token_expires_at && new Date(a.token_expires_at).getTime() < soon;
                        return (
                          <li key={a.id} className="rounded-lg border border-border p-3 text-sm">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-medium">{a.display_name}</span>
                              {a.is_default && <Pill tone="brand">Standard</Pill>}
                              <StatusBadge def={labelOf(CONNECTION_STATUS, a.connection_status)} />
                              {a.external_id && <span className="font-mono text-xs text-muted-foreground">{a.external_id}</span>}
                              {admin && <span className="ml-auto"><ApiSwitch id={a.id} enabled={a.api_enabled} connected={a.connection_status === "verbunden"} /></span>}
                            </div>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {a.token_expires_at ? <span className={expiring ? "font-medium text-orange-700" : ""}>Autorisierung gültig bis {formatDateTime(a.token_expires_at)}{expiring ? " – läuft bald ab, bitte neu verbinden" : ""}</span> : a.auth_type ? "Kein Ablaufdatum bekannt" : "Nur manuelle Veröffentlichung"}
                              {a.last_checked_at && ` · zuletzt geprüft ${formatDateTime(a.last_checked_at)}`}
                              {a.scopes.length > 0 && ` · Berechtigungen: ${a.scopes.join(", ")}`}
                            </p>
                            {a.last_error && <p className="mt-1 text-xs text-red-700">{a.last_error}</p>}
                            {admin && (
                              <div className="mt-2 flex items-center gap-1">
                                <AccountButtons id={a.id} isDefault={a.is_default} />
                                <AccountDialog account={a} />
                              </div>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
                <div className="rounded-lg bg-muted/50 p-3 text-xs">
                  <p className="mb-1 font-medium">Voraussetzungen</p>
                  <ul className="list-disc space-y-1 pl-4 text-muted-foreground">{adapter.requirements.map((r) => <li key={r}>{r}</li>)}</ul>
                  <p className="mt-2">Per API: {adapter.supportedFormats.join(", ")}</p>
                  <a href={p.docs} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-[#b90845] hover:underline">Offizielle Dokumentation <ExternalLink className="size-3" /></a>
                </div>
              </div>
            </Section>
          );
        })}

        <Section title={<span className="flex items-center gap-2">MICE Magazin <Pill tone="warning">keine Schnittstelle</Pill></span>}>
          <p className="text-sm text-muted-foreground">
            Für das bestehende MICE Magazin ist keine veröffentlichungsfähige Schnittstelle bekannt. Magazinartikel werden daher als manueller Arbeitsschritt
            veröffentlicht (Aufgabe mit vorbereitetem Text) und anschließend mit URL und Datum erfasst. Eine Anbindung wird erst umgesetzt, wenn eine dokumentierte API (z. B. WordPress REST mit Anwendungspasswort) vorliegt.
          </p>
        </Section>

        <Section title={<span className="flex items-center gap-2">E-Mail-Versand (Resend) {!features.email() && <Pill tone="warning">Einrichtung erforderlich</Pill>}</span>}>
          <p className="text-sm text-muted-foreground">
            {features.email() ? `Aktiv · Absender ${serverEnv.emailFrom}${serverEnv.emailReplyTo ? ` · Antwort an ${serverEnv.emailReplyTo}` : ""}` : "RESEND_API_KEY und EMAIL_FROM (verifizierte Absenderdomain) setzen. Bis dahin werden E-Mails protokolliert, aber nicht versendet."}
          </p>
        </Section>
      </div>
    </div>
  );
}
