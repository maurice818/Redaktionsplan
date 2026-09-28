# Datenmodell und Sicherheit

## Überblick

```
profiles ─┬─ (Rollen: admin | redaktion | freigabe | mitarbeit)
          │
clients ──┼── contacts
          ├── contracts ── contract_years ── deliverables (je Einheit, z. B. „Artikel 2/4“)
          │      └─ package_snapshot (unveränderlicher Stand der Paketvorlage)
          └── dossiers (Beitragsakten; kind = kunde | eigen) ── campaigns, ideas
                 ├── content_items (magazinartikel | social je Kanal)
                 │      ├── content_versions (Snapshots, Fingerprint)
                 │      ├── approvals (intern | kunde, je Version)
                 │      ├── content_media ── media_assets (Upload | Link)
                 │      └── publish_jobs ── publish_attempts
                 ├── tasks
                 ├── material_requests ── material_responses
                 └── previews ── preview_items (je Inhalt die gezeigte Version)

package_templates ── package_template_items ── service_types
format_rules · email_templates · email_events · reminder_rules · reminder_log
platform_accounts ── platform_credentials (verschlüsselt, nur Service-Rolle)
audit_log · notifications · saved_filters · app_settings · job_runs · job_locks
```

## Zentrale Regeln (in der Datenbank erzwungen)

| Regel | Umsetzung |
| --- | --- |
| Gebuchte Leistungen ändern sich nicht rückwirkend | `book_membership` speichert einen Snapshot; Trigger verbietet Änderungen am Snapshot; neue Vertragsjahre nutzen den Snapshot |
| Korrekturen nachvollziehbar | `add_deliverable` / `correct_deliverable` verlangen eine Begründung, die im Audit-Log landet |
| Freigabe gilt für eine konkrete Fassung | `fingerprint` (SHA-256 über veröffentlichungsrelevante Felder + Medien) je Inhalt und Version; `internal_ok`/`client_ok` werden bei jeder Änderung neu berechnet – nur mit einer Freigabe **dieses** Inhalts und der passenden Art (intern/Kunde) |
| Freigaben nur über den Ablauf | Trigger `content_items_access_guard`: über die API (Rolle `authenticated`) lassen sich Freigabeverweise, Freigabepflichten, Status (außer Entwurf/Archiv), verbindliche Planung, automatische Veröffentlichung und Veröffentlichungsnachweis nicht direkt setzen – nur über die geprüften Datenbankfunktionen |
| Keine stillschweigende Freigabe nach Änderung | Trigger setzt Status auf „In Arbeit“, hebt verbindliche Planung und automatische Veröffentlichung auf, bricht offene Aufträge ab, protokolliert und benachrichtigt |
| Spätere Ablehnung zählt | Interne Änderungswünsche und Kunden-Änderungswünsche (auch in einer späteren Runde) ersetzen die vorherige Freigabe; eine verbindliche Planung wird zurückgestuft, offene Aufträge gestoppt |
| Planungsänderungen ziehen Aufträge nach | Termin, Zielkonto oder Aktivierung geändert → Auftrag und Aufgabe werden angepasst (z. B. API abgeschaltet → manuelle Aufgabe); nicht mehr verbindlich oder archiviert → Aufträge und Aufgaben beendet |
| Konsistente Bezüge | Leistung eines Inhalts/einer Akte gehört zum Kunden der Akte; Medien nur aus der eigenen Akte und nur im Speicherordner der Akte; höchstens eine Akte je Leistung; Aufgaben übernehmen Akte/Kunde aus dem Inhalt |
| „Verbindlich eingeplant“ nur mit Freigaben | Trigger prüft vollständige Freigaben, Termin und Rolle (Freigabe/Leitung, Admin) |
| „Veröffentlicht“ nur mit Nachweis | Trigger verlangt Zeitpunkt und Link bzw. Plattform-ID |
| Keine Doppelveröffentlichung | partieller Unique-Index (ein aktiver Auftrag je Inhalt), `claim_due_publish_jobs` mit `FOR UPDATE SKIP LOCKED`, Abschluss nur durch den reservierenden Lauf, hängende Aufträge → „unklar“ |
| Keine doppelten Erinnerungen | `reminder_log` mit Unique-Schlüssel (Regel, Objekt, Nummer); `claim_reminder` |
| Automatisch erzeugte Aufgaben einmalig | `tasks.auto_key` unique |
| Versionen und Freigaben unveränderlich | Trigger verhindern Updates; keine Update-/Delete-Policies |
| Audit-Log unveränderlich | Trigger verhindert Update/Delete; Einträge nur über Trigger/Funktionen |
| Nutzerkonten löschbar | Einzige erlaubte Änderung an unveränderlichen Datensätzen: Personenverweise werden beim Löschen eines Kontos auf NULL gesetzt; der Name bleibt im Protokoll (`actor_label`) erhalten |

## Row Level Security

RLS ist auf **allen** Tabellen aktiv (durch einen Test abgesichert).

| Rolle | Lesen | Schreiben |
| --- | --- | --- |
| admin | alles | alles inkl. Einstellungen, Pakete, Team, Integrationen |
| redaktion | alles Redaktionelle | Kunden, Leistungen, Akten, Inhalte, Aufgaben, Material/Vorschau |
| freigabe | wie Redaktion | wie Redaktion + interne Freigabe + verbindliche Planung |
| mitarbeit | nur Akten, in denen die Person verantwortlich ist oder Inhalte/Aufgaben zugewiesen hat (inkl. zugehöriger Kunden) | diese Akten, Inhalte und eigene Aufgaben – Kunde, Vertrag, Leistung und Verantwortung einer Akte sowie die Akte einer Aufgabe kann sie nicht umhängen (sonst ließe sich Zugriff auf fremde Akten erschleichen) |
| inaktive Konten | nichts | nichts |
| anon (Kunden) | **keine Tabellenrechte** | nur `public_*`-Funktionen mit Tokenprüfung |

Hilfsfunktionen für Policies liegen im nicht exponierten Schema `private` (SECURITY DEFINER, `search_path = ''`). Alle Funktionsrechte werden zunächst entzogen und dann gezielt vergeben; neue Funktionen sind standardmäßig nicht für `anon`/`authenticated` ausführbar.

## Kundenlinks

- Token: 32 Byte Zufall (base64url), erzeugt serverseitig.
- Gespeichert: SHA-256-Hash (für die Suche) und optional eine AES-256-GCM-verschlüsselte Kopie (nur serverseitig entschlüsselbar, damit Erinnerungen den Link enthalten können).
- Ablaufdatum und Widerruf je Link; ersetzte Vorschauen sind nicht mehr nutzbar. Unbeantwortete Inhalte einer widerrufenen oder ersetzten Vorschau verlassen den Status „beim Kunden“ wieder.
- Kunden-Uploads landen nur im Ordner `material/<Anfrage>/`; die Kundenaktionen löschen nie Dateien anhand von Pfaden, die der Browser schickt.
- Kunden sehen ausschließlich die Snapshots der ihnen zugesandten Versionen; Mediendateien nur über signierte Links (1 h).
- Seiten: `noindex`, `no-referrer`, kein Caching, Schutz gegen Einbettung (Clickjacking).
- Gespeichert werden Zeitpunkt, Version, Entscheidung, Kommentar sowie angegebener Name, E-Mail und Funktion – keine IP-Adressen.

## Plattform-Zugangsdaten

`platform_credentials` hat RLS ohne Policies und keine Rechte für `authenticated` – nur die Service-Rolle (Server) liest sie. Tokens sind mit `APP_ENCRYPTION_KEY` verschlüsselt, werden nie an den Browser gegeben und in Protokollen entfernt.

## Zeit

Zeitpunkte als `timestamptz` (UTC); Kalendertage (Fälligkeiten, Vertragsdaten) als `date` im Berliner Kalender. Eingaben in Berliner Ortszeit werden serverseitig eindeutig nach UTC umgerechnet (inkl. Sommer-/Winterzeit, getestet).
