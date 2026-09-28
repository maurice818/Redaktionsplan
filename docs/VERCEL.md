# Bereitstellung auf Vercel

> Es wurde **nichts** veröffentlicht. Die folgenden Schritte führen Sie (oder auf ausdrückliche Anweisung mit Zugangsdaten das Team) selbst aus.

## 1. Voraussetzungen

- Supabase-Projekt eingerichtet und Migrationen eingespielt ([SUPABASE.md](SUPABASE.md))
- Git-Repository (GitHub/GitLab/Bitbucket) mit diesem Projekt
- Vercel-Konto

## 2. Projekt importieren

1. Vercel → **Add New → Project** → Repository importieren. Framework wird als Next.js erkannt; Build-Befehl `npm run build`, Node.js 22.x oder 24.x.
2. Region: `vercel.json` setzt `fra1` (Frankfurt, nahe der Supabase-Region).

## 3. Umgebungsvariablen (Settings → Environment Variables)

| Variable | Pflicht | Hinweis |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | ja | |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | ja | oder `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| `NEXT_PUBLIC_APP_URL` | ja | z. B. `https://redaktion.meet-germany.network` |
| `SUPABASE_SECRET_KEY` | ja | nur serverseitig; als *Sensitive* markieren |
| `APP_ENCRYPTION_KEY` | ja | 32 Byte Base64 (`npm run secrets:generate`); **nicht mehr ändern**, sonst sind gespeicherte Tokens/Links unlesbar |
| `CRON_SECRET` | ja | Vercel sendet ihn automatisch an den Cron-Endpunkt |
| `RESEND_API_KEY`, `EMAIL_FROM`, `EMAIL_REPLY_TO` | für E-Mail | Absenderdomain in Resend verifizieren (SPF/DKIM) |
| `META_APP_ID`, `META_APP_SECRET`, `META_GRAPH_API_VERSION` | für Meta | siehe [INTEGRATIONEN.md](INTEGRATIONEN.md) |
| `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET`, `LINKEDIN_API_VERSION` | für LinkedIn | siehe [INTEGRATIONEN.md](INTEGRATIONEN.md) |

Nach dem ersten Deployment `NEXT_PUBLIC_APP_URL` und in Supabase die Site URL/Redirect URLs auf die endgültige Domain setzen.

## 4. Hintergrundprozess (Cron)

`vercel.json` enthält einen Cron-Job auf `/api/cron/tick`:

```json
{ "path": "/api/cron/tick", "schedule": "0 5 * * *" }
```

- **Hobby-Plan:** nur **einmal täglich** erlaubt (Ausführung innerhalb der angegebenen Stunde, 05:00 UTC ≈ 07:00 Berlin). Erinnerungen laufen damit täglich; **automatische Veröffentlichungen zur exakten Uhrzeit sind so nicht möglich.**
- **Pro-Plan:** Zeitplan auf `*/5 * * * *` ändern (alle 5 Minuten).
- **Alternative ohne Pro-Plan:** Supabase `pg_cron` + `pg_net` ruft den Endpunkt alle 5 Minuten auf (siehe [SUPABASE.md](SUPABASE.md#6-alternative-zum-vercel-cron-supabase-pg_cron)) oder ein anderer externer Scheduler mit Header `Authorization: Bearer <CRON_SECRET>`.
- Ein Admin kann den Lauf unter **Veröffentlichungen → Jetzt ausführen** auch manuell starten.

Vercel wiederholt fehlgeschlagene Cron-Aufrufe nicht und kann denselben Lauf gelegentlich doppelt auslösen – beides ist durch Sperre, idempotente Reservierung und die nächste reguläre Ausführung abgedeckt.

## 5. Nach dem Deployment prüfen

1. `https://<domain>/login` öffnen, mit dem Admin anmelden.
2. **Einstellungen → Übersicht:** alle Punkte grün oder bewusst „Einrichtung erforderlich“.
3. Cron testen:
   ```bash
   curl -H "Authorization: Bearer <CRON_SECRET>" https://<domain>/api/cron/tick
   ```
   Ergebnis unter **Einstellungen → Protokolle → Hintergrundläufe**.
4. Einen Test-Kunden anlegen, Materialformular an eine eigene Adresse senden, Link im privaten Fenster öffnen.

## 6. Eigene Domain

Vercel → Settings → Domains, z. B. `redaktion.meet-germany.network`. Anschließend `NEXT_PUBLIC_APP_URL`, Supabase Site URL/Redirect URLs und die OAuth-Redirect-URIs der Meta- und LinkedIn-Apps anpassen.
