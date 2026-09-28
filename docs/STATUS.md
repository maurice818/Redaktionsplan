# Funktionsstatus

Stand: 24.09.2026. Legende: ✅ umgesetzt · ⚙️ umgesetzt, aber erst nach Einrichtung eines externen Zugangs aktiv · ⛔ bewusst nicht umgesetzt.

## Wie wurde geprüft?

| Prüfung | Ergebnis |
| --- | --- |
| TypeScript (strikt) inkl. aller Supabase-Abfragen gegen die aus den Migrationen erzeugten Typen | fehlerfrei |
| `next build` (Produktions-Build, 44 Routen) | erfolgreich |
| ESLint | keine Fehler (2 Hinweise zu React Hook Form / React Compiler, ohne Auswirkung) |
| Vitest: 90 Tests – Zeitlogik (inkl. Zeitumstellung), Formatprüfung, Voraussetzungen, Fortschritt, E-Mail-Rendering, Materialformular, **Datenbanktests aller Migrationen in PGlite** (RLS je Rolle, Buchung, Freigaben, Tokens, Doppelveröffentlichung, Erinnerungen, Demo-Daten, Zugriffsschutz) | alle bestanden |
| Sichtprüfung im Browser: Einrichtungsseite, Login (inkl. Fehlerfall), Kundenseiten, Sicherheits-Header, 401 für Cron/API ohne Berechtigung | geprüft (Desktop und Mobil) |
| Unabhängige Code-Prüfung der kritischen Pfade (Freigaben, Kundenlinks, Veröffentlichung, Rechte) | 19 Befunde, alle nachvollzogen und behoben, Datenbanklogik jeweils mit Test (siehe unten) |

**Nicht geprüft werden konnte** (auf dieser Maschine gibt es kein Docker und kein Supabase-Projekt): der Ablauf gegen eine echte Supabase-Instanz (PostgREST, Auth, Storage) sowie die internen Seiten mit Live-Daten. Die Datenbanklogik ist in Postgres getestet und die Abfragen sind typgeprüft; ein Durchklicken mit echten Daten sollte nach der Einrichtung als Erstes erfolgen (siehe unten „Erster Test“).

## Behobene Befunde der Code-Prüfung

| Schwere | Befund | Behebung |
| --- | --- | --- |
| kritisch | Über einen Kundenlink-Aufruf mit falschem Token ließen sich beliebige Dateien im Speicher löschen | Kundenaktionen löschen keine Dateien mehr anhand übergebener Pfade |
| kritisch | Mitarbeit konnte eine eigene Aufgabe an eine fremde Akte hängen (bzw. Kunde/Leistung einer Akte ändern) und so Zugriff erhalten | Datenbank verhindert das Umhängen; Test |
| kritisch | Freigabefelder und Status ließen sich über die API direkt setzen; Freigaben anderer Inhalte wurden anerkannt | Schreibschutz für Ablauf-Felder; Freigabe zählt nur für denselben Inhalt und dieselbe Art; Test |
| hoch | Interne Änderungswünsche hoben eine frühere interne Freigabe nicht auf | Ablehnung ersetzt die Freigabe; Test |
| hoch | Kunden-Änderungswunsch in einer späteren Runde wurde bei bereits freigegebenen Inhalten ignoriert | Änderungswunsch hebt Freigabe auf, stuft Planung zurück, stoppt Aufträge; Test |
| hoch | Nicht erneut gesendete Inhalte blieben nach ersetzter/widerrufener Vorschau „beim Kunden“ hängen | werden zurückgesetzt; Test |
| mittel | „Rückfrage beim Kunden“-Aufgabe schloss sich nie | wird bei erneuter Einreichung/Widerruf geschlossen; Test |
| mittel | API-Veröffentlichung abgeschaltet → geplante Beiträge erschienen stillschweigend nie | Auftrag wird manuell mit Aufgabe (auch bei laufendem Versuch); Test |
| mittel | Archivieren ließ Aufträge und Aufgaben offen | werden beendet; Test |
| mittel | Nutzerkonten ließen sich nicht löschen (unveränderliche Protokolle) | Personenverweise dürfen auf NULL gesetzt werden; Test |
| mittel | Materialformular: Eingaben während des Zwischenspeicherns gingen verloren; Listenfelder außer der Reihe führten zu Fehlern | behoben (Revisionszähler, lückenlose Listen); Unit-Test |
| mittel | Kundenvorschau: nach Teilantwort keine weitere Antwort ohne Neuladen möglich | behoben |
| mittel | Angepasster E-Mail-Text ging verloren, wenn die E-Mail-Vorschau geschlossen wurde | wird immer übernommen, mit „Vorlage wiederherstellen“ |
| mittel | Meta: fehlgeschlagener Tausch in langlebigen Token wurde nicht erkannt | Verbindung bricht mit klarer Meldung ab |
| mittel | Fehler vor dem Versand wurden als „unklar“ statt „fehlgeschlagen“ markiert | unterschieden |
| niedrig | E-Mail-Fehler (fehlender Secret Key) nach Linkerstellung verloren den Link | E-Mail-Versand wirft nie; Link bleibt sichtbar |
| niedrig | Doppelte Akten je Leistung möglich | Unique-Index + Behandlung paralleler Klicks; Test |
| niedrig | Manuelle Bestätigung während laufendem API-Versuch mit unklarer Meldung | klare Meldung; Test |

Zusätzlich abgesichert: Medien lassen sich nur Inhalten derselben Akte zuordnen und nur im Speicherordner der Akte registrieren; Leistungen müssen zum Kunden der Akte gehören.

## Kernfunktionen

| Bereich | Status |
| --- | --- |
| Anmeldung (Passwort, Anmeldelink, Passwort-Reset), Einladung, Rollen, RLS | ✅ (Einladungs-E-Mails ⚙️ SMTP in Supabase) |
| Dashboard mit allen 9 Karten und Filtern (Person, Kunde, Paket, Kampagne, Zeitraum) | ✅ |
| Kunden, Ansprechpartner, Links, Notizen, Historie | ✅ |
| Schnellweg Kunde → Paket → Leistungen | ✅ |
| Paketvorlagen (Plus, Professional, Venue Circle), Snapshot bei Buchung, mehrere Vertragsjahre, Zusatzbuchungen, Korrekturen mit Protokoll | ✅ |
| Leistungskonto mit Fortschritt („2 von 4 Artikeln veröffentlicht; …“), Leistungsübersicht | ✅ |
| Leistungsnachweis (Druck/PDF über Browser, CSV-Export) | ✅ |
| Beitragsakte mit 15-Schritte-Ablauf, Inhalten, Material, Vorschauen, Aufgaben, Medien, E-Mails, Historie | ✅ |
| Magazinartikel mit Rich-Text-Editor, SEO, Autor; Social-Fassungen je Kanal (unabhängig) | ✅ |
| Versionen, interne Prüfung, Freigabe je Version, automatische Invalidierung bei Änderung | ✅ |
| Materialformular für Kunden (konfigurierbar, Zwischenspeichern, Uploads, Drive-Link, Absenden) | ✅ (Uploads ⚙️ Secret Key) |
| Kundenvorschau & Freigabe je Inhalt mit Identität, Zeitpunkt, Version | ✅ |
| Links mit Ablauf und Widerruf, erneutes Senden | ✅ (erneutes Senden ⚙️ `APP_ENCRYPTION_KEY`) |
| Aufgaben (automatisch/manuell), „Wartet auf Kunde“ getrennt | ✅ |
| Erinnerungsregeln (6 Regeln, konfigurierbar, ohne Duplikate) | ✅ (automatisch ⚙️ Cron) |
| E-Mail-Vorlagen bearbeiten, vor Versand prüfen/anpassen, Protokoll | ✅ (Versand ⚙️ Resend) |
| Redaktionskalender Monat/Woche/Liste, Filter, Verschieben mit Folgenanzeige, Überschneidungen/Überlastung | ✅ |
| Kampagnen, Ideenspeicher (wiederverwendbar), eigene Beiträge (Schnellweg) | ✅ |
| Medien: Upload in privaten Speicher, Drive-Links, Vorschau, Alt-Text, Bildnachweis, final/veraltet, Versionen, Formatprüfung | ✅ |
| Formatregeln konfigurierbar mit Quelle und Prüfdatum, Anzeige bei der Medienauswahl | ✅ |
| Veröffentlichungsvoraussetzungen je Inhalt (Checkliste) | ✅ |
| Manuelle Veröffentlichung: Aufgabe mit vorbereitetem Text/Medien, Link-Erfassung, Leistung automatisch erbracht | ✅ |
| Veröffentlichungsaufträge, Versuche mit Plattformantwort, gezielte Wiederholung, „unklar“-Behandlung | ✅ |
| Globale Suche (Strg+K), gespeicherte Filter, leere Zustände mit nächster Handlung | ✅ |
| Demo-Daten (gekennzeichnet, per Admin-Aktion ladbar und entfernbar) | ✅ |
| Hintergrundprozess `/api/cron/tick` mit Secret, Sperre, Protokoll | ✅ (Zeitplan ⚙️ Vercel/Scheduler) |

## Plattformanbindungen

| Integration | Status | Was fehlt |
| --- | --- | --- |
| Instagram (Feed-Bild, Karussell, Reel, Story) | ⚙️ Adapter umgesetzt, **nicht live getestet** | Meta-App, Berechtigungen, ggf. App Review/Business-Verifizierung, verbundenes Konto |
| Facebook-Seite (Text, Link, Bild, Mehrbild) | ⚙️ Adapter umgesetzt, **nicht live getestet** | wie oben |
| Facebook Video/Reel | ⛔ manuell (Resumable Upload nicht umgesetzt) | – |
| LinkedIn (Text, Link, Bild, Mehrbild) | ⚙️ Adapter umgesetzt, **nicht live getestet** | LinkedIn-App mit freigegebener Community Management API |
| LinkedIn Video | ⛔ manuell (mehrteiliger Upload nicht umgesetzt) | – |
| MICE Magazin | ⛔ manuell mit URL-Erfassung | Keine Schnittstelle bekannt – bewusst keine CMS-Integration erfunden |
| Kennzahlen aus Plattform-APIs | ⛔ nur manuelle Erfassung (gekennzeichnet) | Insights-Berechtigungen; Anbindung nicht umgesetzt |

Solange eine Anbindung nicht verbunden **und** bewusst aktiviert ist, wird jede verbindlich geplante Veröffentlichung automatisch zur Aufgabe „Manuell veröffentlichen“ – die App zeigt das ehrlich an und behauptet nie „veröffentlicht“ ohne Bestätigung.

## Getroffene Annahmen (bitte bestätigen)

1. **Membership Professional:** „zugehörige, aus den Artikeln abgeleitete Social-Media-Beiträge“ ist als **1 Social-Beitrag je Artikel** (= 4) hinterlegt. In der Paketvorlage änderbar.
2. **Venue Marketing & Sales Circle:** enthält als Platzhalter „Circle-Leistungen“ ohne Stückzahl. Die konkreten Circle-Leistungen bitte in der Vorlage ergänzen.
3. Weitere Paketvorteile (Firmenprofil, Community-Plattform, MeetUps, Reichweite, Anfragenmagnet, Vernetzung, Vorteile) sind als Leistungstypen angelegt, aber keinem Paket zugeordnet, da keine Zuordnung vorgegeben war.
4. Eine Social-Fassung pro Kanal; ein aus einem Artikel abgeleiteter Social-Beitrag (Leistung) wird durch die erste zugeordnete Kanalfassung erfüllt.
5. Markenfarben aus der Website übernommen: #B90845, #6F2659, #ABC788, Schrift Rubik. Bei einem offiziellen Styleguide bitte `src/app/globals.css` anpassen.

## Erster Test nach der Einrichtung (ca. 20 Minuten)

1. Admin anlegen, anmelden, Einstellungen → Übersicht prüfen.
2. Einstellungen → Demo-Daten laden; Dashboard, Kalender, Kunden- und Beitragsakten durchsehen.
3. Eigenen Testkunden über „Kunde & Paket“ anlegen (Professional) → 4 Artikel + 4 Social-Leistungen prüfen.
4. An einer Leistung „Akte anlegen“ → Materialformular an eigene Adresse senden → im privaten Fenster ausfüllen, Bild hochladen, absenden → Prüfaufgabe und Benachrichtigung prüfen.
5. Artikel schreiben → interne Prüfung → (als Freigabe/Leitung) freigeben → Kundenvorschau senden → im privaten Fenster freigeben.
6. Nach der Freigabe den Text ändern → prüfen, dass die Freigabe als ungültig angezeigt wird.
7. Erneut freigeben lassen, verbindlich einplanen → Aufgabe „Manuell veröffentlichen“ → Link eintragen → Leistung „erbracht“, Leistungsnachweis prüfen.
8. Demo-Daten wieder entfernen.
