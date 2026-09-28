# MEET GERMANY Redaktionszentrale

Gebuchte Membership-Leistungen, eigene Redaktion, Freigaben und Veröffentlichungen an einem Ort – vom gebuchten Paket bis zum Veröffentlichungsnachweis.

- **Stack:** Next.js 16 (App Router, TypeScript), React 19, Tailwind CSS 4, shadcn/ui (Radix), Supabase (Auth, PostgreSQL, Row Level Security, Storage), Zod, React Hook Form, Tiptap 3, Resend (austauschbar), Vercel Cron
- **Sprache/Zeit:** deutsche Oberfläche, Zeitzone Europe/Berlin (Zeitpunkte als `timestamptz` in UTC gespeichert)
- **Status der Funktionen:** siehe [docs/STATUS.md](docs/STATUS.md)

## Schnellstart (lokal)

Voraussetzungen: Node.js ≥ 20.9 (empfohlen 22+), npm. Für eine vollständig lokale Datenbank zusätzlich Docker Desktop.

```bash
npm install
cp .env.example .env.local        # Windows: copy .env.example .env.local
npm run secrets:generate          # Werte für APP_ENCRYPTION_KEY und CRON_SECRET
```

Dann **eine** der beiden Datenbank-Varianten:

**A) Supabase Cloud (ohne Docker)** – siehe [docs/SUPABASE.md](docs/SUPABASE.md)

```bash
npx supabase login
npx supabase link --project-ref <projekt-ref>
npx supabase db push              # Migrationen, RLS, Storage-Bucket, Basiskonfiguration
```

**B) Supabase lokal (Docker)**

```bash
npx supabase start                # zeigt URL und Keys für .env.local
npx supabase db reset             # spielt alle Migrationen ein (ohne Demo-Daten)
```

Keys in `.env.local` eintragen, ersten Admin anlegen und starten:

```bash
npm run admin:create -- ihre@adresse.de "Vorname Nachname"
npm run dev                       # http://localhost:3000
```

`admin:create` gibt zusätzlich einen Einmal-Link aus, mit dem sich der Admin auch ohne eingerichteten E-Mail-Versand anmelden und ein Passwort setzen kann. Demo-Daten lassen sich danach unter **Einstellungen → Demo-Daten** laden und wieder entfernen.

## Befehle

| Befehl | Zweck |
| --- | --- |
| `npm run dev` | Entwicklungsserver |
| `npm run build` / `npm start` | Produktions-Build / -Server |
| `npm run typecheck` | Routentypen erzeugen + TypeScript prüfen |
| `npm run lint` | ESLint |
| `npm test` | Unit- und Datenbanktests (PGlite, ohne Docker) |
| `npm run db:types` | Datenbanktypen aus den Migrationen erzeugen (ohne Docker) |
| `npm run db:push` | Migrationen ins verknüpfte Supabase-Projekt übertragen |
| `npm run admin:create -- <mail> "<Name>"` | Ersten Admin anlegen |
| `npm run secrets:generate` | Zufällige Secrets erzeugen |

## Bereitstellung

Vercel: siehe [docs/VERCEL.md](docs/VERCEL.md). Benötigte Zugänge und Plattformfreigaben: [docs/INTEGRATIONEN.md](docs/INTEGRATIONEN.md).

## Architektur in Kürze

```
src/
  app/(app)/…        Interne Bereiche (Dashboard, Kalender, Kunden, Leistungen, Beiträge, Aufgaben,
                     Freigaben, Kampagnen, Veröffentlichungen, Einstellungen)
  app/(public)/m/…   Materialformular für Kunden (persönlicher Link)
  app/(public)/v/…   Kundenvorschau & Freigabe (persönlicher Link)
  app/api/cron/tick  Geschützter Hintergrundprozess (Erinnerungen, Veröffentlichungen, Autorisierungen)
  actions/           Server Actions (Zod-Validierung, Rollenprüfung, dann DB mit RLS)
  lib/domain/        Fachlogik ohne DB (Formatprüfung, Voraussetzungen, Kalenderstatus, Fortschritt)
  lib/platforms/     Adapter Instagram / Facebook / LinkedIn (+ OAuth)
  lib/jobs/          Hintergrundprozess
  lib/email/         Austauschbarer E-Mail-Provider (Resend) + Vorlagen-Rendering
supabase/migrations  Versionierte Migrationen inkl. RLS, Triggern und DB-Funktionen
tests/               Unit-Tests und Datenbanktests (PGlite mit Supabase-Nachbildung)
```

Die wichtigsten Geschäftsregeln sind in der Datenbank abgesichert (Trigger und Funktionen) und damit weder aus dem Browser noch versehentlich aus der App heraus umgehbar – Details in [docs/DATENMODELL.md](docs/DATENMODELL.md):

- Freigaben gelten für eine konkrete **Version** (SHA-256-Fingerprint über Text, Format und Medienzuordnung). Jede inhaltliche Änderung macht eine Freigabe für die aktuelle Fassung ungültig, stoppt verbindliche Planung und offene Aufträge.
- „Verbindlich eingeplant“ und automatische Veröffentlichung sind erst mit allen erforderlichen Freigaben möglich – und nur für Freigabe/Leitung bzw. Admin.
- „Veröffentlicht“ nur mit Plattformbestätigung (Post-ID/Link) oder manueller Bestätigung inkl. Link.
- Pro Inhalt höchstens ein aktiver Veröffentlichungsauftrag; Aufträge werden atomar reserviert (`FOR UPDATE SKIP LOCKED`); hängende Aufträge werden „unklar“ statt automatisch wiederholt.
- Erinnerungen werden je Regel × Objekt × Nummer genau einmal ausgelöst.
- Kunden haben kein Konto und keinerlei Tabellenzugriff; nur tokengeprüfte `public_*`-Funktionen. Tokens: 256 Bit, nur als SHA-256-Hash gespeichert, mit Ablauf und Widerruf.
- Gebuchte Pakete werden als unveränderlicher Snapshot im Vertrag gespeichert.
- Freigaben, Status, verbindliche Planung und Veröffentlichungsnachweise lassen sich über die API nicht direkt setzen – nur über die geprüften Datenbankfunktionen (Trigger `content_items_access_guard`).

## Tests

```bash
npm test
```

Die Datenbanktests führen alle Migrationen in PGlite (Postgres als WebAssembly) mit einer Nachbildung der Supabase-Rollen aus und prüfen u. a. Buchungslogik, RLS je Rolle, Freigabe-Invalidierung, Token-Abläufe, Doppelveröffentlichungsschutz, Erinnerungs-Duplikatschutz, Zugriffsschutz gegen Rechteausweitung und Demo-Daten.
