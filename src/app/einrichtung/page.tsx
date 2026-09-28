import { redirect } from "next/navigation";
import { isSupabaseConfigured } from "@/lib/env";

export const metadata = { title: "Einrichtung" };
export const dynamic = "force-dynamic";

const STEPS = [
  { title: "Supabase-Projekt anlegen", text: "Unter supabase.com ein Projekt in der Region EU (Frankfurt) anlegen – oder lokal mit Docker und `npx supabase start`." },
  { title: "Migrationen einspielen", text: "`npx supabase link --project-ref <ref>` und anschließend `npx supabase db push`. Dabei entstehen Tabellen, RLS-Regeln, Speicher-Bucket und Basiskonfiguration (keine Demo-Daten)." },
  { title: ".env.local anlegen", text: "`.env.example` kopieren und mindestens NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, SUPABASE_SECRET_KEY, APP_ENCRYPTION_KEY und CRON_SECRET setzen (`npm run secrets:generate`)." },
  { title: "Ersten Admin anlegen", text: "`npm run admin:create -- ihre@adresse.de \"Ihr Name\"` – danach mit dem Link aus der E-Mail oder dem ausgegebenen Einmal-Link anmelden." },
  { title: "Neu starten", text: "Entwicklungsserver neu starten (`npm run dev`) und http://localhost:3000 öffnen." },
];

export default function SetupPage() {
  if (isSupabaseConfigured()) redirect("/");
  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <div className="mb-8 flex items-center gap-3">
        <span className="grid size-10 place-items-center rounded-lg bg-[#b90845] font-bold text-white">MG</span>
        <div>
          <p className="text-sm font-semibold tracking-[0.16em]">MEET GERMANY</p>
          <p className="text-xs text-muted-foreground">Redaktionszentrale</p>
        </div>
      </div>
      <h1 className="text-2xl font-semibold">Einrichtung erforderlich</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Die Anwendung ist noch nicht mit einer Supabase-Datenbank verbunden. Diese Seite ist nur sichtbar, solange die Verbindungsdaten fehlen.
      </p>
      <ol className="mt-6 grid gap-3">
        {STEPS.map((s, i) => (
          <li key={s.title} className="flex gap-3 rounded-xl border border-border bg-card p-4">
            <span className="grid size-7 shrink-0 place-items-center rounded-full bg-[#f4ecf1] text-sm font-semibold text-[#6f2659]">{i + 1}</span>
            <div>
              <p className="font-medium">{s.title}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {s.text.split(/(`[^`]+`)/).map((part, j) =>
                  part.startsWith("`") ? <code key={j} className="rounded bg-muted px-1 py-0.5 font-mono text-[12px] text-foreground">{part.slice(1, -1)}</code> : part,
                )}
              </p>
            </div>
          </li>
        ))}
      </ol>
      <p className="mt-6 text-sm text-muted-foreground">Ausführliche Anleitung: README.md und docs/ im Projektordner.</p>
    </main>
  );
}
