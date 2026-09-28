# Supabase einrichten

## 1. Projekt anlegen

1. Unter <https://supabase.com/dashboard> ein Projekt anlegen, Region **Central EU (Frankfurt)**.
2. **Project Settings → API Keys**: den *Publishable Key* (`sb_publishable_…`) und den *Secret Key* (`sb_secret_…`) kopieren. Ältere Projekte: `anon` bzw. `service_role` (die App akzeptiert beide Varianten, siehe `.env.example`).
3. **Project Settings → Data API**: Das Schema `public` muss exponiert sein (Standard). Das Schema `private` bleibt **nicht** exponiert.

## 2. Migrationen einspielen

```bash
npx supabase login
npx supabase link --project-ref <projekt-ref>
npx supabase db push
```

Die Migrationen legen an:

| Datei | Inhalt |
| --- | --- |
| `…120000_foundation.sql` | Profile/Rollen, Rollenfunktionen, Audit-Log, Einstellungen, Benachrichtigungen, gespeicherte Filter |
| `…120100_clients_memberships.sql` | Kunden, Ansprechpartner, Leistungstypen, Paketvorlagen, Verträge, Vertragsjahre, Leistungen, Buchungsfunktionen |
| `…120200_editorial.sql` | Kampagnen, Ideen, Beitragsakten, Inhalte, Versionen, Freigaben, Medien, Formatregeln, Aufgaben, interne Prüfung |
| `…120300_customer_portal.sql` | Materialformulare/-anfragen/-antworten, Vorschauen, tokengeprüfte Kundenfunktionen |
| `…120400_communication.sql` | E-Mail-Vorlagen und -Protokoll, Erinnerungsregeln, Duplikatschutz, Job-Läufe und -Sperren |
| `…120500_publishing.sql` | Plattformkonten, verschlüsselte Zugangsdaten, Aufträge, Versuche, Planung, Hintergrundfunktionen |
| `…120600_access_control.sql` | Row Level Security für alle Tabellen |
| `…120700_base_configuration.sql` | Produktive Basiskonfiguration (Pakete, Formatregeln, Vorlagen, Regeln, Formular) |
| `…120800_demo_and_search.sql` | Globale Suche, Demo-Daten-Funktionen (werden nicht automatisch ausgeführt) |
| `…120900_storage_and_grants.sql` | Privater Bucket `media`, Storage-Policies, restriktive Rechte |
| `…121000_notes_and_metrics.sql` | Notizen in der Historie, manuelle Kennzahlen |

Datenbanktypen neu erzeugen (optional, nach Schemaänderungen):

```bash
npm run db:types                                   # ohne Docker, aus den Migrationen
npx supabase gen types typescript --linked --schema public > src/lib/supabase/database.types.ts   # alternativ offiziell
```

## 3. Authentifizierung konfigurieren (Dashboard → Authentication)

- **Sign In / Providers → Email:** aktiviert. **„Allow new users to sign up“ deaktivieren** – Zugang nur per Einladung.
- **URL Configuration:**
  - Site URL: `https://<ihre-domain>` (lokal `http://localhost:3000`)
  - Redirect URLs: `https://<ihre-domain>/auth/confirm`, `https://<ihre-domain>/auth/callback` (und lokal dieselben mit `http://localhost:3000`)
- **Email Templates:** Die deutschen Vorlagen aus `supabase/templates/` übernehmen (Einladung, Passwort zurücksetzen, Magic Link). Sie verwenden den `token_hash`-Ablauf über `/auth/confirm`, z. B.
  `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite&next=/passwort-setzen`
- **SMTP:** Der eingebaute Supabase-Mailversand ist stark limitiert. Für den Betrieb unter **Authentication → Emails → SMTP Settings** einen eigenen SMTP-Zugang hinterlegen (z. B. ebenfalls Resend).
- **Passwort-Richtlinie:** mindestens 10 Zeichen, Groß-/Kleinbuchstaben und Ziffern (so auch in `supabase/config.toml` für lokal).

## 4. Speicher (Storage)

Die Migration legt den privaten Bucket `media` an (keine öffentlichen URLs; Anzeige nur über kurzlebige signierte Links). Das Größenlimit richtet sich nach dem Projekt: im Free-Plan **50 MB pro Datei**. Für Reels bis 300 MB unter **Storage → Settings** das globale Limit erhöhen (Pro-Plan) oder große Videos als Google-Drive-Link hinterlegen (dann manuelle Veröffentlichung).

## 5. Ersten Admin anlegen

```bash
npm run admin:create -- ihre@adresse.de "Vorname Nachname"
```

Weitere Teammitglieder lädt ein Admin unter **Einstellungen → Team & Rollen** ein.

## 6. Alternative zum Vercel-Cron: Supabase pg_cron

Wenn der Vercel-Plan nur tägliche Cron-Jobs erlaubt, kann Supabase den Hintergrundprozess alle 5 Minuten aufrufen (Dashboard → Integrations → Cron und pg_net aktivieren):

```sql
-- CRON_SECRET vorher im Vault speichern: select vault.create_secret('<CRON_SECRET>', 'cron_secret');
select cron.schedule(
  'redaktionszentrale-tick',
  '*/5 * * * *',
  $$
  select net.http_get(
    url := 'https://<ihre-domain>/api/cron/tick',
    headers := jsonb_build_object('Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret'))
  );
  $$
);
```

Doppelte oder parallele Aufrufe sind unkritisch (Sperre + atomare Reservierung).
