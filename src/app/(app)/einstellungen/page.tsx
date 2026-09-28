import Link from "next/link";
import { CheckCircle2, CircleAlert } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { Section } from "@/components/common/section";
import { requireProfile } from "@/lib/auth";
import { isSupabaseConfigured, publicEnv } from "@/lib/env";
import { features, serverEnv } from "@/lib/env.server";
import { getPlatformAccounts } from "@/lib/data/lookups";
import { CHANNEL_LABELS } from "@/lib/labels";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/time";

export const metadata = { title: "Einstellungen" };

function Row({ ok, title, detail, action }: { ok: boolean; title: string; detail: React.ReactNode; action?: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3 py-3">
      {ok ? <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-600" aria-label="Eingerichtet" /> : <CircleAlert className="mt-0.5 size-5 shrink-0 text-amber-600" aria-label="Einrichtung erforderlich" />}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{title} {!ok && <span className="ml-1 rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-900">Einrichtung erforderlich</span>}</p>
        <div className="text-xs text-muted-foreground">{detail}</div>
      </div>
      {action}
    </li>
  );
}

export default async function SettingsOverview() {
  await requireProfile();
  const supabase = await createClient();
  const [accounts, { data: lastRun }] = await Promise.all([
    getPlatformAccounts(),
    supabase.from("job_runs").select("started_at, status").eq("job", "tick").order("started_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const apiAccounts = accounts.filter((a) => a.api_enabled && a.connection_status === "verbunden");

  return (
    <div>
      <PageHeader title="Einstellungen & Integrationen" description="Status der Einrichtung. Fehlende Zugänge sind ehrlich als „Einrichtung erforderlich“ gekennzeichnet – die übrigen Funktionen laufen trotzdem." />
      <Section title="Einrichtungsstatus">
        <ul className="divide-y">
          <Row ok={isSupabaseConfigured()} title="Supabase (Datenbank & Anmeldung)" detail={publicEnv.supabaseUrl || "NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY fehlen"} />
          <Row ok={features.admin()} title="Secret Key (serverseitig)" detail="Für Hintergrundprozess, Einladungen, Kunden-Uploads und signierte Dateilinks in Kundenvorschauen." />
          <Row ok={features.encryption()} title="Verschlüsselungsschlüssel" detail="APP_ENCRYPTION_KEY – verschlüsselt Plattform-Tokens und speichert Kundenlinks für Erinnerungen." />
          <Row ok={features.email()} title="E-Mail-Versand (Resend)" detail={features.email() ? `Absender: ${serverEnv.emailFrom}` : "RESEND_API_KEY und EMAIL_FROM fehlen – E-Mails werden protokolliert, aber nicht versendet; Links können manuell weitergegeben werden."} />
          <Row
            ok={features.cron()}
            title="Hintergrundprozess (Cron)"
            detail={<>{features.cron() ? "CRON_SECRET gesetzt." : "CRON_SECRET fehlt."} {lastRun ? `Letzter Lauf: ${formatDateTime(lastRun.started_at)} (${lastRun.status}).` : "Noch kein Lauf protokolliert."} Vercel Hobby erlaubt nur tägliche Cron-Jobs – für Veröffentlichungen zur exakten Uhrzeit Pro-Plan oder externen Scheduler nutzen (siehe Dokumentation).</>}
          />
          <Row ok={features.meta()} title="Meta (Facebook-Seite & Instagram)" detail={features.meta() ? `App konfiguriert · Graph API ${serverEnv.metaGraphVersion}` : "META_APP_ID / META_APP_SECRET fehlen. Ohne App-Freigabe erfolgt die Veröffentlichung manuell."} action={<Link href="/einstellungen/integrationen" className="text-xs text-[#b90845] hover:underline">Integrationen</Link>} />
          <Row ok={features.linkedin()} title="LinkedIn-Unternehmensseite" detail={features.linkedin() ? `App konfiguriert · API-Version ${serverEnv.linkedinApiVersion}` : "LINKEDIN_CLIENT_ID / LINKEDIN_CLIENT_SECRET fehlen. Community Management API muss von LinkedIn freigegeben werden."} />
          <Row ok={apiAccounts.length > 0} title="Automatische Veröffentlichung" detail={apiAccounts.length ? `Aktiv für: ${apiAccounts.map((a) => `${CHANNEL_LABELS[a.platform]} (${a.display_name})`).join(", ")}` : "Für kein Konto aktiviert – alle Veröffentlichungen laufen als manuelle Aufgabe mit Link-Erfassung."} />
          <Row ok={false} title="MICE Magazin (CMS-Schnittstelle)" detail="Keine veröffentlichungsfähige Schnittstelle bekannt. Veröffentlichung als manueller Arbeitsschritt mit anschließender URL-Erfassung. Eine Anbindung wird erst umgesetzt, wenn eine dokumentierte API vorliegt." />
        </ul>
      </Section>
    </div>
  );
}
