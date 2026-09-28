-- =============================================================================
-- Basiskonfiguration (produktiv, KEINE Demo-Daten):
-- Leistungstypen, Paketvorlagen, Formatregeln, E-Mail-Vorlagen,
-- Erinnerungsregeln, Standard-Materialformular und Einstellungen.
-- Alle Werte sind im Einstellungsbereich durch Admins änderbar.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Leistungstypen
-- -----------------------------------------------------------------------------
insert into public.service_types (id, key, name, description, category, content_kind, sort_order) values
  ('00000000-0000-4000-8000-000000000001', 'mice_artikel', 'MICE-Magazin-Fachartikel',
   'Redaktioneller Fachartikel im MICE Magazin.', 'redaktion', 'magazinartikel', 10),
  ('00000000-0000-4000-8000-000000000002', 'social_beitrag', 'Social-Media-Beitrag',
   'Aus einem Magazinartikel abgeleiteter Beitrag auf den MEET-GERMANY-Kanälen.', 'social', 'social', 20),
  ('00000000-0000-4000-8000-000000000003', 'firmenprofil', 'Firmenprofil',
   'Unternehmensprofil auf der MEET-GERMANY-Plattform.', 'profil', null, 30),
  ('00000000-0000-4000-8000-000000000004', 'community_plattform', 'Community-Plattform',
   'Zugang und Präsenz auf der Community-Plattform.', 'community', null, 40),
  ('00000000-0000-4000-8000-000000000005', 'meetups', 'MeetUps',
   'Teilnahme bzw. Präsenz bei MEET GERMANY MeetUps.', 'event', null, 50),
  ('00000000-0000-4000-8000-000000000006', 'reichweite', 'Reichweite',
   'Reichweitenleistungen gemäß Vereinbarung.', 'reichweite', null, 60),
  ('00000000-0000-4000-8000-000000000007', 'anfragenmagnet', 'Anfragenmagnet',
   'Leistungen zur Generierung von Anfragen gemäß Vereinbarung.', 'reichweite', null, 70),
  ('00000000-0000-4000-8000-000000000008', 'vernetzung', 'Vernetzung',
   'Vernetzungsleistungen gemäß Vereinbarung.', 'vernetzung', null, 80),
  ('00000000-0000-4000-8000-000000000009', 'vorteile', 'Vorteile',
   'Mitgliedervorteile gemäß Vereinbarung.', 'vorteil', null, 90),
  ('00000000-0000-4000-8000-000000000010', 'circle_leistungen', 'Circle-Leistungen',
   'Leistungen des Venue Marketing & Sales Circle gemäß Vereinbarung.', 'circle', null, 100),
  ('00000000-0000-4000-8000-000000000011', 'zusatzleistung', 'Individuelle Zusatzleistung',
   'Individuell vereinbarte Leistung.', 'sonstiges', null, 200);

-- -----------------------------------------------------------------------------
-- Paketvorlagen
-- -----------------------------------------------------------------------------
insert into public.package_templates (id, key, name, description, sort_order, updated_by) values
  ('00000000-0000-4000-8000-000000000101', 'membership_plus', 'Membership Plus',
   '1 MICE-Magazin-Fachartikel pro Vertragsjahr und 1 daraus abgeleiteter Social-Media-Beitrag.', 10, null),
  ('00000000-0000-4000-8000-000000000102', 'membership_professional', 'Membership Professional',
   '4 MICE-Magazin-Fachartikel pro Vertragsjahr und die zugehörigen, aus den Artikeln abgeleiteten Social-Media-Beiträge.', 20, null),
  ('00000000-0000-4000-8000-000000000103', 'venue_circle', 'Venue Marketing & Sales Circle',
   'Es werden keine Magazinartikel oder Social-Media-Beiträge automatisch erzeugt. Paketleistungen und individuelle Zusatzleistungen werden als Leistungen erfasst.', 30, null);

insert into public.package_template_items (id, template_id, service_type_id, label, quantity, period,
                                           per_parent_item_id, quantity_per_parent, notes, sort_order) values
  ('00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000001',
   null, 1, 'vertragsjahr', null, null, null, 10),
  ('00000000-0000-4000-8000-000000000202', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000002',
   null, null, 'vertragsjahr', '00000000-0000-4000-8000-000000000201', 1, 'Aus dem Magazinartikel abgeleitet.', 20),
  ('00000000-0000-4000-8000-000000000211', '00000000-0000-4000-8000-000000000102', '00000000-0000-4000-8000-000000000001',
   null, 4, 'vertragsjahr', null, null, null, 10),
  ('00000000-0000-4000-8000-000000000212', '00000000-0000-4000-8000-000000000102', '00000000-0000-4000-8000-000000000002',
   null, null, 'vertragsjahr', '00000000-0000-4000-8000-000000000211', 1,
   'Annahme: 1 abgeleiteter Social-Media-Beitrag je Artikel. Bitte bei abweichender Vereinbarung in der Vorlage anpassen.', 20),
  ('00000000-0000-4000-8000-000000000221', '00000000-0000-4000-8000-000000000103', '00000000-0000-4000-8000-000000000010',
   null, null, 'vertragsjahr', null, null,
   'Konkrete Circle-Leistungen bitte in der Vorlage ergänzen (ohne feste Stückzahl, keine automatische Redaktionseinheit).', 10);

-- Revision nach Initialbefüllung zurücksetzen
update public.package_templates set revision = 1;

-- -----------------------------------------------------------------------------
-- Formatregeln (geprüft am 24.09.2026 anhand der offiziellen Dokumentation)
-- Harte Grenzen = Ablehnung durch die Plattform/API; Empfehlungen = Warnung.
-- -----------------------------------------------------------------------------
insert into public.format_rules (channel, post_format, media_kind, label, media_required, allowed_mime_types,
  max_file_size_mb, min_width, max_width, max_pixels, recommended_width, recommended_height,
  min_aspect_ratio, max_aspect_ratio, min_duration_seconds, max_duration_seconds, min_items, max_items,
  caption_max_length, hashtags_max, api_supported, notes, source_url, verified_at, updated_by) values
  ('instagram', 'feed_bild', 'bild', 'Instagram Feed-Bild', true, array['image/jpeg'],
   8, 320, 1440, null, 1080, 1350, 0.8, 1.91, null, null, 1, 1, 2200, 30, true,
   'Die Content-Publishing-API akzeptiert nur JPEG. Seitenverhältnis zwischen 4:5 und 1,91:1, Breite 320–1440 px, sRGB. Empfehlung 4:5 für maximale Fläche im Feed.',
   'https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/media', '2026-09-24', null),
  ('instagram', 'karussell', 'bild', 'Instagram Karussell (Bilder)', true, array['image/jpeg'],
   8, 320, 1440, null, 1080, 1350, 0.8, 1.91, null, null, 2, 10, 2200, 30, true,
   'Per API bis zu 10 Elemente (in der App ggf. mehr). Einheitliches Seitenverhältnis für alle Elemente verwenden.',
   'https://developers.facebook.com/docs/instagram-platform/content-publishing', '2026-09-24', null),
  ('instagram', 'karussell', 'video', 'Instagram Karussell (Video-Element)', true, array['video/mp4', 'video/quicktime'],
   null, null, null, null, 1080, 1350, null, null, null, null, 2, 10, 2200, 30, true,
   'Videos sind als Karussell-Elemente möglich; eine separate Spezifikation ist in der Dokumentation nicht ausgewiesen (nicht verifiziert). Reels können keine Karussell-Elemente sein.',
   'https://developers.facebook.com/docs/instagram-platform/content-publishing', '2026-09-24', null),
  ('instagram', 'reel', 'video', 'Instagram Reel', true, array['video/mp4', 'video/quicktime'],
   300, null, 1920, null, 1080, 1920, 0.01, 10, 3, 900, 1, 1, 2200, 30, true,
   'MP4/MOV mit moov-Atom am Dateianfang, H.264 oder HEVC, 23–60 fps, max. 1920 px horizontal, 3 s bis 15 min, max. 300 MB. Empfohlen 9:16.',
   'https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/media', '2026-09-24', null),
  ('instagram', 'story', 'bild', 'Instagram Story (Bild)', true, array['image/jpeg'],
   8, null, null, null, 1080, 1920, null, null, null, null, 1, 1, null, null, true,
   'JPEG, max. 8 MB, 9:16 empfohlen.',
   'https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/media', '2026-09-24', null),
  ('instagram', 'story', 'video', 'Instagram Story (Video)', true, array['video/mp4', 'video/quicktime'],
   100, null, null, null, 1080, 1920, null, null, 3, 60, 1, 1, null, null, true,
   'Codecs wie bei Reels, 3–60 s, max. 100 MB, 9:16 empfohlen.',
   'https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/media', '2026-09-24', null),

  ('facebook', 'feed_bild', 'bild', 'Facebook-Beitrag mit Bild', true,
   array['image/jpeg', 'image/png', 'image/gif', 'image/bmp', 'image/tiff'],
   10, null, null, null, 1440, 1800, null, null, null, null, 1, 1, null, null, true,
   'Bis 10 MB (PNG idealerweise ≤ 1 MB). Größenempfehlung 4:5 stammt aus dem Meta-Anzeigenleitfaden; für organische Beiträge ist keine offizielle Pixelvorgabe dokumentiert.',
   'https://developers.facebook.com/docs/graph-api/reference/page/photos/', '2026-09-24', null),
  ('facebook', 'karussell', 'bild', 'Facebook-Beitrag mit mehreren Bildern', true,
   array['image/jpeg', 'image/png', 'image/gif', 'image/bmp', 'image/tiff'],
   10, null, null, null, 1440, 1800, null, null, null, null, 2, null, null, null, true,
   'Bilder werden unveröffentlicht hochgeladen und als attached_media veröffentlicht. Eine Höchstzahl ist nicht verifiziert.',
   'https://developers.facebook.com/docs/pages-api/posts', '2026-09-24', null),
  ('facebook', 'text', 'keins', 'Facebook-Textbeitrag', false, '{}',
   null, null, null, null, null, null, null, null, null, null, null, null, null, null, true,
   'Textbeitrag über /{page-id}/feed.', 'https://developers.facebook.com/docs/pages-api/posts', '2026-09-24', null),
  ('facebook', 'link', 'keins', 'Facebook-Linkbeitrag', false, '{}',
   null, null, null, null, null, null, null, null, null, null, null, null, null, null, true,
   'Linkbeitrag über /{page-id}/feed mit Parameter link.', 'https://developers.facebook.com/docs/pages-api/posts', '2026-09-24', null),
  ('facebook', 'video', 'video', 'Facebook-Video', true, array['video/mp4'],
   null, null, null, null, 1080, 1350, null, null, null, null, 1, 1, null, null, false,
   'Der Video-Upload über die Resumable Upload API ist in dieser Version nicht umgesetzt – Veröffentlichung erfolgt manuell.',
   'https://developers.facebook.com/docs/video-api/guides/publishing', '2026-09-24', null),
  ('facebook', 'reel', 'video', 'Facebook Reel', true, array['video/mp4'],
   null, 540, null, null, 1080, 1920, null, null, 3, 90, 1, 1, null, null, false,
   '9:16, empfohlen 1080 × 1920 (mind. 540 × 960), 3–90 s, 24–60 fps. Reels-Publishing per API ist in dieser Version nicht umgesetzt – Veröffentlichung erfolgt manuell. Limit: 30 Reels je 24 h.',
   'https://developers.facebook.com/docs/video-api/guides/reels-publishing', '2026-09-24', null),

  ('linkedin', 'feed_bild', 'bild', 'LinkedIn-Beitrag mit Bild', true, array['image/jpeg', 'image/png', 'image/gif'],
   3, null, null, 36152320, null, null, null, null, null, null, 1, 1, null, null, true,
   'Images API: JPG, PNG oder GIF, unter 36.152.320 Pixel. Die 3-MB-Grenze stammt aus der LinkedIn-Hilfe für Seitenbeiträge. Keine offizielle Pixelempfehlung für organische Bildbeiträge verifiziert.',
   'https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/images-api', '2026-09-24', null),
  ('linkedin', 'karussell', 'bild', 'LinkedIn Mehrbild-Beitrag', true, array['image/jpeg', 'image/png', 'image/gif'],
   3, null, null, 36152320, null, null, null, null, null, null, 2, 20, null, null, true,
   '2–20 Bilder (MultiImage). Organische Dokument-Karussells werden per API nicht unterstützt.',
   'https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/multiimage-post-api', '2026-09-24', null),
  ('linkedin', 'text', 'keins', 'LinkedIn-Textbeitrag', false, '{}',
   null, null, null, null, null, null, null, null, null, null, null, null, null, null, true,
   'Textbeitrag über die Posts API.', 'https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api', '2026-09-24', null),
  ('linkedin', 'link', 'bild', 'LinkedIn-Linkbeitrag (Artikel)', false, array['image/jpeg', 'image/png'],
   3, 200, null, null, 1200, 627, null, null, null, null, 0, 1, null, null, true,
   'LinkedIn liest Link-Vorschauen nicht automatisch aus: Titel, Beschreibung und optional ein Vorschaubild (1,91:1, z. B. 1200 × 627) werden mitgegeben.',
   'https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api', '2026-09-24', null),
  ('linkedin', 'video', 'video', 'LinkedIn-Video', true, array['video/mp4'],
   500, 256, 4096, null, null, null, 0.4167, 2.4, 3, 600, 1, 1, null, null, false,
   'MP4, 3 s–10 min, 256 × 144 bis 4096 × 2304, Seitenverhältnis 1:2,4 bis 2,4:1 (LinkedIn-Hilfe); die Videos-API nennt abweichende Grenzen. Mehrteiliger Upload ist in dieser Version nicht umgesetzt – Veröffentlichung erfolgt manuell.',
   'https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/videos-api', '2026-09-24', null),

  ('magazin', 'artikel', 'bild', 'MICE Magazin – Titelbild', true, array['image/jpeg', 'image/png', 'image/webp'],
   null, null, null, null, null, null, null, null, null, null, 1, 1, null, null, false,
   'Für das bestehende MICE Magazin ist keine Schnittstelle bekannt – Veröffentlichung erfolgt manuell. Bildvorgaben des Magazin-CMS bitte hier ergänzen.',
   null, '2026-09-24', null);

-- -----------------------------------------------------------------------------
-- E-Mail-Vorlagen (Platzhalter in doppelten geschweiften Klammern)
-- -----------------------------------------------------------------------------
insert into public.email_templates (key, name, description, audience, subject, body, placeholders, updated_by) values
  ('material_anfrage', 'Materialanfrage an Kunden', 'Versand des persönlichen Links zum Materialformular.', 'kunde',
   'Ihr Beitrag bei MEET GERMANY: Bitte Informationen und Bildmaterial bereitstellen',
   E'Guten Tag {{empfaenger_name}},\n\nfür Ihren Beitrag „{{beitrag_titel}}“ benötigen wir einige Informationen und Bildmaterial von Ihnen.\n\n{{nachricht}}\n\nBitte nutzen Sie dazu unser Online-Formular. Sie können Ihre Angaben zwischenspeichern und später fortsetzen:\n{{link}}\n\nDer Link ist persönlich und gültig bis {{gueltig_bis}}.{{frist_hinweis}}\n\nBei Fragen antworten Sie einfach auf diese E-Mail.\n\nViele Grüße\n{{absender_name}}\nMEET GERMANY Redaktion',
   array['empfaenger_name', 'beitrag_titel', 'kunde_name', 'nachricht', 'link', 'gueltig_bis', 'frist_hinweis', 'absender_name'], null),
  ('material_erinnerung', 'Erinnerung Materialformular', 'Automatische Erinnerung, wenn das Formular nicht ausgefüllt wurde.', 'kunde',
   'Erinnerung: Informationen für Ihren Beitrag „{{beitrag_titel}}“',
   E'Guten Tag {{empfaenger_name}},\n\nwir möchten Sie freundlich an das Materialformular für Ihren Beitrag „{{beitrag_titel}}“ erinnern. Ihre bisherigen Angaben bleiben gespeichert.\n\n{{link}}\n\nDer Link ist gültig bis {{gueltig_bis}}.\n\nViele Grüße\nMEET GERMANY Redaktion',
   array['empfaenger_name', 'beitrag_titel', 'kunde_name', 'link', 'gueltig_bis'], null),
  ('vorschau', 'Kundenvorschau zur Freigabe', 'Versand der Vorschau mit Freigabemöglichkeit.', 'kunde',
   'Zur Freigabe: {{beitrag_titel}}',
   E'Guten Tag {{empfaenger_name}},\n\nIhre Inhalte für „{{beitrag_titel}}“ sind fertig vorbereitet. Bitte prüfen Sie die Vorschau und geben Sie die Inhalte frei oder teilen Sie uns Ihre Änderungswünsche mit:\n\n{{link}}\n\n{{nachricht}}\n\nEnthalten: {{inhalte}}\n{{frist_hinweis}}\nDer Link ist persönlich und gültig bis {{gueltig_bis}}.\n\nViele Grüße\n{{absender_name}}\nMEET GERMANY Redaktion',
   array['empfaenger_name', 'beitrag_titel', 'kunde_name', 'nachricht', 'link', 'inhalte', 'gueltig_bis', 'frist_hinweis', 'absender_name'], null),
  ('vorschau_erinnerung', 'Erinnerung Kundenvorschau', 'Automatische Erinnerung, wenn der Kunde nicht reagiert hat.', 'kunde',
   'Erinnerung: Ihre Freigabe für „{{beitrag_titel}}“',
   E'Guten Tag {{empfaenger_name}},\n\nwir warten noch auf Ihre Rückmeldung zur Vorschau „{{beitrag_titel}}“. Bitte geben Sie die Inhalte frei oder teilen Sie uns Ihre Änderungswünsche mit:\n\n{{link}}\n\nDer Link ist gültig bis {{gueltig_bis}}.\n\nViele Grüße\nMEET GERMANY Redaktion',
   array['empfaenger_name', 'beitrag_titel', 'kunde_name', 'link', 'gueltig_bis'], null),
  ('team_material_eingegangen', 'Team: Material eingegangen', 'Benachrichtigung an die zuständige Person.', 'team',
   'Material eingegangen: {{beitrag_titel}}',
   E'Hallo {{empfaenger_name}},\n\n{{kunde_name}} hat das Materialformular für „{{beitrag_titel}}“ abgeschickt. Eine Prüfaufgabe wurde angelegt.\n\n{{link}}',
   array['empfaenger_name', 'beitrag_titel', 'kunde_name', 'link'], null),
  ('team_kundenantwort', 'Team: Kunde hat geantwortet', 'Benachrichtigung über Freigabe oder Änderungswunsch.', 'team',
   'Kundenrückmeldung: {{beitrag_titel}}',
   E'Hallo {{empfaenger_name}},\n\n{{kunde_name}} hat auf die Vorschau „{{beitrag_titel}}“ geantwortet:\n\n{{text}}\n\n{{link}}',
   array['empfaenger_name', 'beitrag_titel', 'kunde_name', 'text', 'link'], null),
  ('team_erinnerung', 'Team: Erinnerung', 'Interne Erinnerung aus den Erinnerungsregeln.', 'team',
   '{{titel}}',
   E'Hallo {{empfaenger_name}},\n\n{{text}}\n\n{{link}}',
   array['empfaenger_name', 'titel', 'text', 'link'], null),
  ('team_veroeffentlichung_fehlgeschlagen', 'Team: Veröffentlichung fehlgeschlagen', 'Benachrichtigung bei fehlgeschlagener oder unklarer Veröffentlichung.', 'team',
   'Veröffentlichung prüfen: {{beitrag_titel}}',
   E'Hallo {{empfaenger_name}},\n\ndie Veröffentlichung von „{{beitrag_titel}}“ auf {{kanal}} ist fehlgeschlagen oder ihr Ergebnis ist unklar.\n\nFehler: {{text}}\n\nBitte prüfen: {{link}}',
   array['empfaenger_name', 'beitrag_titel', 'kanal', 'text', 'link'], null);

-- -----------------------------------------------------------------------------
-- Erinnerungsregeln
-- -----------------------------------------------------------------------------
insert into public.reminder_rules (key, name, description, days, repeat_days, max_reminders, notify_customer, notify_team,
                                   customer_template_key, team_template_key, updated_by) values
  ('material_ausstehend', 'Materialformular nicht ausgefüllt',
   'Tage nach Versand des Materiallinks, bis erinnert wird. Nach der letzten Erinnerung erhält das Team eine Aufgabe.',
   5, 4, 2, true, true, 'material_erinnerung', 'team_erinnerung', null),
  ('vorschau_ohne_antwort', 'Keine Reaktion auf Kundenvorschau',
   'Tage nach Versand der Vorschau ohne Antwort. Nach der letzten Erinnerung erhält das Team eine Aufgabe.',
   3, 3, 2, true, true, 'vorschau_erinnerung', 'team_erinnerung', null),
  ('grafik_fehlt', 'Grafik fehlt kurz vor dem Termin',
   'Tage vor dem geplanten Termin, an denen ein Beitrag ohne finales Medium gemeldet wird.',
   3, null, 1, false, true, null, 'team_erinnerung', null),
  ('termin_ohne_freigabe', 'Veröffentlichung naht ohne Freigabe',
   'Tage vor dem geplanten Termin, an denen fehlende Freigaben gemeldet werden.',
   2, null, 1, false, true, null, 'team_erinnerung', null),
  ('vertragsjahr_endet', 'Vertragsjahr endet mit offenen Leistungen',
   'Tage vor Ende eines Vertragsjahres, ab denen offene Leistungen gemeldet werden.',
   60, 30, 2, false, true, null, 'team_erinnerung', null),
  ('aufgabe_ueberfaellig', 'Aufgabe überfällig',
   'Tage nach Fälligkeit, an denen die zuständige Person erinnert wird (Aufgaben mit Status „Wartet auf Kunde“ ausgenommen).',
   1, null, 1, false, true, null, 'team_erinnerung', null);

-- -----------------------------------------------------------------------------
-- Standard-Materialformular
-- -----------------------------------------------------------------------------
insert into public.material_forms (name, description, intro_text, is_default, fields, updated_by) values
  ('Standard-Materialformular', 'Informationen und Bildmaterial für Magazinartikel und Social-Media-Beiträge.',
   'Mit Ihren Angaben erstellen wir Ihren Beitrag. Sie können jederzeit zwischenspeichern und später fortfahren. Pflichtfelder sind mit * markiert.',
   true,
   '[
     {"key":"unternehmen","label":"Unternehmen","type":"text","required":true,"prefill":"client_name"},
     {"key":"ansprechpartner","label":"Ansprechpartner (Name, Funktion, E-Mail, Telefon)","type":"textarea","required":true,"prefill":"recipient_name"},
     {"key":"thema","label":"Thema","type":"text","required":true,"help":"Worum soll es in Ihrem Beitrag gehen?"},
     {"key":"aussage","label":"Gewünschte Kernaussage","type":"textarea","required":true,"help":"Was sollen Leserinnen und Leser mitnehmen?"},
     {"key":"hintergrund","label":"Hintergrundinformationen","type":"textarea","required":false},
     {"key":"fakten","label":"Die drei wichtigsten Fakten","type":"list","count":3,"required":true},
     {"key":"zitate","label":"Zitate oder Sprecher","type":"textarea","required":false,"help":"Name, Funktion und Zitat. Bitte nur freigegebene Zitate."},
     {"key":"links","label":"Links","type":"textarea","required":false,"help":"Website, Landingpage, Buchungsseite – je Zeile ein Link."},
     {"key":"cta","label":"Gewünschter Call-to-Action","type":"text","required":false,"help":"z. B. „Jetzt Tagungsangebot anfragen“"},
     {"key":"anlass","label":"Geplanter Anlass oder Wunschtermin","type":"text","required":false},
     {"key":"bildmaterial","label":"Bildmaterial hochladen","type":"files","required":false,"help":"JPG, PNG, WebP, MP4 oder PDF. Alternativ unten einen Link zu Google Drive angeben."},
     {"key":"drive_link","label":"Link zu Google Drive oder Cloud-Ordner","type":"url","required":false},
     {"key":"bildrechte","label":"Angaben zu Bildrechten und Urhebern","type":"textarea","required":true,"help":"Wer ist Urheber? Dürfen wir die Bilder im Magazin und auf Social Media nutzen?"},
     {"key":"vorgaben","label":"Besondere Vorgaben","type":"textarea","required":false,"help":"Schreibweisen, Sperrfristen, Tabus …"},
     {"key":"rueckfragen","label":"Anmerkungen oder Rückfragen an die Redaktion","type":"textarea","required":false}
   ]'::jsonb, null);

-- -----------------------------------------------------------------------------
-- Einstellungen
-- -----------------------------------------------------------------------------
insert into public.app_settings (key, value, label, description) values
  ('calendar.max_posts_per_day', '3', 'Warnschwelle Beiträge pro Tag',
   'Ab dieser Anzahl geplanter Veröffentlichungen an einem Tag zeigt der Kalender eine Warnung.'),
  ('calendar.min_minutes_between_posts', '60', 'Mindestabstand je Kanal (Minuten)',
   'Liegen zwei Veröffentlichungen im selben Kanal näher beieinander, wird eine Überschneidung gemeldet.'),
  ('links.material_expiry_days', '30', 'Gültigkeit Materiallink (Tage)', 'Standard-Gültigkeit neuer Materialformular-Links.'),
  ('links.preview_expiry_days', '21', 'Gültigkeit Vorschaulink (Tage)', 'Standard-Gültigkeit neuer Vorschau-Links.'),
  ('material.response_days', '10', 'Frist Materialformular (Tage)', 'Standardfrist für Kunden zum Ausfüllen des Materialformulars.'),
  ('preview.response_days', '5', 'Frist Kundenfreigabe (Tage)', 'Standardfrist für Kunden zur Rückmeldung auf eine Vorschau.'),
  ('contract.warning_days', '60', 'Vorwarnzeit Vertragsjahr (Tage)', 'Ab wann das Dashboard vor offenen Leistungen am Vertragsjahresende warnt.'),
  ('magazine.integration', '"keine"', 'MICE-Magazin-Schnittstelle',
   'Es ist keine veröffentlichungsfähige Schnittstelle zum MICE Magazin bekannt. Veröffentlichung erfolgt manuell mit anschließender URL-Erfassung.'),
  ('magazine.base_url', '""', 'Basis-URL MICE Magazin', 'Optional: Basis-URL zur Plausibilitätsprüfung eingetragener Artikel-Links.');
