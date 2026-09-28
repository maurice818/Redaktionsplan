<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

<!-- END:nextjs-agent-rules -->

# Projektkonventionen – MEET GERMANY Redaktionszentrale

- Oberfläche und Meldungen auf **Deutsch**; Statuswerte nie roh anzeigen, sondern über `src/lib/labels.ts`.
- Zeit: `timestamptz` in UTC speichern, Anzeige/Eingabe in Europe/Berlin über `src/lib/time.ts` (`berlinLocalToIso`, `toBerlinLocalInput`, `formatDateTime`). Kalendertage als `YYYY-MM-DD`.
- Next.js 16: `proxy.ts` statt `middleware.ts`; `params`/`searchParams`/`cookies()` sind asynchron; `PageProps<"/pfad">` nach `npx next typegen`.
- Supabase: `createClient()` (Server, mit Nutzersitzung, RLS) für alles Interne. `createAdminClient()` (Secret Key) nur für Cron, E-Mail-Protokoll, Einladungen und signierte Dateilinks nach Tokenprüfung. `createAnonClient()` für Kundenseiten (nur `public_*`-RPCs).
- Geschäftsregeln (Freigaben, Planung, Veröffentlichung, Tokens) gehören in die Datenbank (Trigger/Funktionen) und bekommen Tests in `tests/db`.
- Freigabeverweise, Status (außer Entwurf/Archiv), verbindliche Planung, `auto_publish = true` und Veröffentlichungsnachweise von `content_items` sind für direkte API-Schreibzugriffe gesperrt (`content_items_access_guard`, prüft `current_user = 'authenticated'`). Solche Änderungen immer als SECURITY-DEFINER-Funktion umsetzen.
- Kundenaktionen (`src/actions/public.ts`) dürfen nie anhand von Pfaden oder IDs aus dem Browser Dateien löschen oder ändern, ohne dass die Datenbank Token und Zugehörigkeit bestätigt hat.
- Neue Migrationen: Funktionen erhalten standardmäßig **keine** Ausführungsrechte – ausdrücklich `grant execute … to authenticated` bzw. `service_role` setzen. Danach `npm run db:types`.
- Server Actions (`src/actions/*`, `"use server"`): nur async Funktionen exportieren; Eingaben mit Zod prüfen; `runAction` + `check()` verwenden; danach `revalidatePath("/", "layout")`.
- Formulare: `ActionForm` (setzt Eingaben bei Fehlern nicht zurück) bzw. `submitWithoutReset`.
- Vor Abschluss: `npm run typecheck && npm run lint && npm test && npm run build`.
