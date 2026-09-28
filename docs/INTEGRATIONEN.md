# Benötigte Zugänge und Plattformfreigaben

Stand der Prüfung: 24.09.2026 anhand der offiziellen Dokumentation. Plattformvorgaben ändern sich – bitte vor der Aktivierung erneut prüfen.

## Übersicht

| Zugang | Wofür | Ohne diesen Zugang |
| --- | --- | --- |
| Supabase-Projekt (URL, Publishable Key, Secret Key) | Datenbank, Anmeldung, Speicher, RLS | App startet nur mit der Einrichtungsseite |
| `APP_ENCRYPTION_KEY` (selbst erzeugt) | Verschlüsselung von Plattform-Tokens und gespeicherten Kundenlinks | Kundenlinks können nicht erneut versendet werden; Plattformkonten nicht verbindbar |
| `CRON_SECRET` (selbst erzeugt) | Schutz des Hintergrundprozesses | Keine automatischen Erinnerungen/Veröffentlichungen |
| Resend-Konto + verifizierte Absenderdomain | Kunden- und Team-E-Mails | E-Mails werden protokolliert, aber nicht versendet; Links manuell weitergeben |
| SMTP für Supabase Auth | Einladungen, Passwort-Reset | Nur Einmal-Link über `npm run admin:create` bzw. stark limitierter Supabase-Versand |
| Meta-App (Facebook Login) | Facebook-Seite und Instagram per API | Manuelle Veröffentlichung mit Aufgabe und Link-Erfassung |
| LinkedIn-App mit Community Management API | LinkedIn-Unternehmensseite per API | Manuelle Veröffentlichung |
| Vercel Pro **oder** externer Scheduler | Veröffentlichung zur exakten Uhrzeit | Cron nur täglich (Hobby) |
| MICE-Magazin-Schnittstelle | Automatische Magazinveröffentlichung | Manuell (so vorgesehen, keine Schnittstelle bekannt) |

## Resend (E-Mail)

1. Konto unter <https://resend.com> anlegen, Domain (z. B. `meet-germany.network`) hinzufügen und die DNS-Einträge (SPF, DKIM) setzen.
2. API-Key mit Sendeberechtigung erzeugen → `RESEND_API_KEY`.
3. `EMAIL_FROM="MEET GERMANY Redaktion <redaktion@meet-germany.network>"`, optional `EMAIL_REPLY_TO`.

Die App sendet mit `Idempotency-Key`, sodass wiederholte Aufrufe keine Doppel-Mails erzeugen. Der Provider ist in `src/lib/email/provider.ts` austauschbar.

## Meta: Facebook-Seite & Instagram

**Voraussetzungen**

- Die MEET-GERMANY-Facebook-Seite; Ihr Nutzer hat darauf die Aufgabe „Inhalte erstellen“ (bzw. volle Kontrolle).
- Instagram-**Professional**-Konto (Business oder Creator), **mit der Facebook-Seite verknüpft**.
- Meta-Business-Portfolio empfohlen.

**App anlegen**

1. <https://developers.facebook.com/apps> → App erstellen → Anwendungsfall „Inhalte auf Seiten/Instagram verwalten“ (Facebook Login for Business).
2. **Valid OAuth Redirect URI:** `https://<ihre-domain>/api/integrations/meta/callback` (lokal zusätzlich `http://localhost:3000/api/integrations/meta/callback`, sofern von Meta für Entwicklung zugelassen).
3. Berechtigungen: `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`, `instagram_basic`, `instagram_content_publish`. Läuft der Seitenzugriff über ein Business-Portfolio, kann zusätzlich `business_management` nötig sein.
4. `META_APP_ID`, `META_APP_SECRET` setzen; `META_GRAPH_API_VERSION=v26.0` (aktuell, Juli 2026).

**Freigabe durch Meta**

- Für Konten, die Sie selbst verwalten und bei denen alle Nutzer eine Rolle in der App haben, genügt laut Meta **Standard Access**.
- Für **Advanced Access** sind App Review und **Business-Verifizierung** erforderlich. Welche Stufe Meta für Ihren Fall verlangt, bitte in der App-Übersicht prüfen – das konnte ohne Ihr Meta-Konto nicht verifiziert werden.

**In der App**

1. Einstellungen → Integrationen → „Mit Meta verbinden“. Alle Seiten mit verknüpftem Instagram-Konto werden als Konten angelegt (nicht benötigte bitte entfernen).
2. Je Konto „Verbindung prüfen“, dann **API-Veröffentlichung** bewusst aktivieren.

**Unterstützt per API (in dieser Version)**

- Instagram: Feed-Bild (nur JPEG, 4:5 bis 1,91:1, max. 8 MB), Karussell (2–10), Reel (MP4/MOV, 3 s–15 min, max. 300 MB), Story. Ablauf: Container → Status → `media_publish` → Permalink. Medien müssen öffentlich per URL abrufbar sein – die App erzeugt dafür kurzlebige signierte URLs; Google-Drive-Links sind dafür nicht geeignet.
- Facebook: Text, Link, Bild, mehrere Bilder.
- **Nicht per API (manuell):** Facebook-Video/-Reel (Resumable Upload nicht umgesetzt).
- Veröffentlichungslimit Instagram: laut Doku 100 bzw. 50 Beiträge je 24 h (die Dokumentation ist widersprüchlich; maßgeblich ist `content_publishing_limit`).

## LinkedIn-Unternehmensseite

**Voraussetzungen**

- LinkedIn-Unternehmensseite von MEET GERMANY; Ihr Nutzer ist Super-Admin bzw. Content-Admin.
- LinkedIn-App unter <https://www.linkedin.com/developers/apps>, mit der Unternehmensseite verknüpft (ein Super-Admin der Seite bestätigt die App).

**Freigabe durch LinkedIn**

- Produkt **Community Management API** beantragen. LinkedIn prüft: registrierte juristische Person, geschäftliche E-Mail, Datenschutzerklärung; für den Standard-Tier zusätzlich Formular und Screencast (OAuth-Ablauf, Posten). Bei Ablehnung muss eine neue App beantragt werden.
- Berechtigungen: `w_organization_social`, `r_organization_social`, `rw_organization_admin`.

**Konfiguration**

1. **Authorized redirect URL:** `https://<ihre-domain>/api/integrations/linkedin/callback`
2. `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET`, `LINKEDIN_API_VERSION=202609` (Header `Linkedin-Version`; Versionen gelten ca. 12 Monate – jährlich aktualisieren).
3. In der App: Einstellungen → Integrationen → „Mit LinkedIn verbinden“, danach prüfen und API-Veröffentlichung aktivieren.

**Hinweise**

- Access Tokens gelten 60 Tage. Refresh Tokens stellt LinkedIn nur bestimmten Partnern aus; ohne Refresh Token warnt die App 14 Tage vor Ablauf – dann erneut verbinden.
- Per API: Text, Link-Beitrag (Titel/Beschreibung/Vorschaubild werden mitgegeben), Bild, Mehrbild (2–20). Video: manuell.
- Texte werden in LinkedIns „Little Text Format“ umgewandelt (Sonderzeichen maskiert, Hashtags als Hashtag-Elemente).

## MICE Magazin

Es ist keine veröffentlichungsfähige Schnittstelle zum bestehenden MICE Magazin bekannt; eine CMS-Integration wurde daher **nicht** erfunden. Magazinartikel werden verbindlich eingeplant; zum Termin entsteht die Aufgabe „Manuell veröffentlichen“ mit vorbereitetem Text (Titel, Teaser, SEO, Haupttext). Nach dem Veröffentlichen im CMS werden URL und Zeitpunkt eingetragen – erst dann gilt der Artikel als veröffentlicht und die Leistung als erbracht.

Falls das Magazin z. B. auf WordPress läuft, kann später ein Adapter ergänzt werden (REST API mit Anwendungspasswort). Dafür werden benötigt: CMS-Typ und -Version, API-Zugang, Zielkategorie/-autor, Bild-Upload-Weg.
