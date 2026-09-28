-- =============================================================================
-- Globale Suche und klar gekennzeichnete Demo-Daten.
--
-- Demo-Daten werden NIE automatisch geladen. Ein Admin kann sie im
-- Einstellungsbereich ausdrücklich laden und wieder entfernen. Alle Demo-
-- Datensätze tragen is_demo = true und das Präfix „[DEMO]“.
-- =============================================================================

create or replace function public.search_all(p_query text, p_limit integer default 30)
returns table (entity_type text, id uuid, title text, subtitle text, url text)
language sql
stable
security invoker
set search_path = ''
as $$
  with q as (
    select '%' || replace(replace(replace(trim(coalesce(p_query, '')), '\', '\\'), '%', '\%'), '_', '\_') || '%' as pat
  )
  select s.entity_type, s.id, s.title, s.subtitle, s.url
  from (
    select 'kunde'::text as entity_type, c.id, c.name as title, concat_ws(' · ', c.category, c.city) as subtitle,
           '/kunden/' || c.id::text as url, 1 as rank
      from public.clients c, q where c.name ilike q.pat or c.legal_name ilike q.pat or c.city ilike q.pat
    union all
    select 'kontakt', ct.id, concat_ws(' ', ct.first_name, ct.last_name), concat_ws(' · ', ct.position, ct.email),
           '/kunden/' || ct.client_id::text, 2
      from public.contacts ct, q where concat_ws(' ', ct.first_name, ct.last_name) ilike q.pat or ct.email ilike q.pat
    union all
    select 'akte', d.id, d.title, d.topic, '/beitraege/' || d.id::text, 3
      from public.dossiers d, q where d.title ilike q.pat or d.topic ilike q.pat
    union all
    select 'inhalt', ci.id, ci.title, ci.channel, '/beitraege/' || ci.dossier_id::text || '/inhalte/' || ci.id::text, 4
      from public.content_items ci, q where ci.title ilike q.pat or ci.caption ilike q.pat or ci.teaser ilike q.pat
    union all
    select 'aufgabe', t.id, t.title, t.status, '/aufgaben?aufgabe=' || t.id::text, 5
      from public.tasks t, q where t.title ilike q.pat or t.description ilike q.pat
    union all
    select 'kampagne', k.id, k.name, k.goal, '/kampagnen/' || k.id::text, 6
      from public.campaigns k, q where k.name ilike q.pat or k.goal ilike q.pat
    union all
    select 'idee', i.id, i.title, array_to_string(i.tags, ', '), '/kampagnen?tab=ideen&idee=' || i.id::text, 7
      from public.ideas i, q where i.title ilike q.pat or i.description ilike q.pat
  ) s
  where length(trim(coalesce(p_query, ''))) >= 2
  order by s.rank, s.title
  limit greatest(1, least(coalesce(p_limit, 30), 100))
$$;

-- -----------------------------------------------------------------------------
-- Demo-Daten laden
-- -----------------------------------------------------------------------------
create or replace function public.admin_load_demo_data()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_today date := (now() at time zone 'Europe/Berlin')::date;
  v_c1 uuid; v_c2 uuid; v_c3 uuid;
  v_k1 uuid; v_k2 uuid; v_k3 uuid;
  v_ct1 uuid; v_ct2 uuid; v_ct3 uuid;
  v_camp uuid;
  v_d1 uuid; v_d2 uuid; v_d3 uuid; v_d4 uuid; v_d5 uuid;
  v_a1 uuid; v_s1 uuid; v_a2 uuid; v_a4 uuid; v_o1 uuid; v_o2 uuid;
  v_del uuid; v_del_social uuid;
  v_token text; v_preview uuid; v_pi1 uuid; v_pi2 uuid;
  v_media uuid;
begin
  if not private.is_admin() then
    raise exception 'Nur Admins dürfen Demo-Daten laden.' using errcode = '42501';
  end if;
  if exists (select 1 from public.clients where is_demo) then
    raise exception 'Demo-Daten sind bereits geladen. Bitte zuerst entfernen.' using errcode = 'P0001';
  end if;

  -- Kunden -------------------------------------------------------------------
  insert into public.clients (name, legal_name, category, website, email, phone, city, owner_id, notes, links, is_demo)
  values ('[DEMO] Seehotel Rheinblick', 'Seehotel Rheinblick GmbH (Demo)', 'Tagungshotel', 'https://example.com/seehotel',
          'kontakt@example.com', '+49 261 000000', 'Koblenz', v_me, 'Demo-Kunde – kein echter Datensatz.',
          '[{"label":"Website","url":"https://example.com/seehotel"}]'::jsonb, true)
  returning id into v_c1;
  insert into public.clients (name, category, website, city, owner_id, is_demo)
  values ('[DEMO] Eventlocation Alte Werft', 'Eventlocation', 'https://example.com/werft', 'Hamburg', v_me, true)
  returning id into v_c2;
  insert into public.clients (name, category, city, owner_id, is_demo)
  values ('[DEMO] Kongresszentrum Mittelgebirge', 'Kongresszentrum', 'Kassel', v_me, true)
  returning id into v_c3;

  insert into public.contacts (client_id, first_name, last_name, position, email, is_primary, can_approve)
  values (v_c1, 'Mara', 'Beispiel', 'Leitung Marketing', 'mara.beispiel@example.com', true, true) returning id into v_ct1;
  insert into public.contacts (client_id, first_name, last_name, position, email, is_primary, can_approve)
  values (v_c2, 'Jonas', 'Muster', 'Sales Manager', 'jonas.muster@example.com', true, true) returning id into v_ct2;
  insert into public.contacts (client_id, first_name, last_name, position, email, is_primary, can_approve)
  values (v_c3, 'Lea', 'Probe', 'Geschäftsführung', 'lea.probe@example.com', true, true) returning id into v_ct3;

  -- Memberships ----------------------------------------------------------------
  v_k1 := public.book_membership(v_c1, '00000000-0000-4000-8000-000000000102',
                                 (v_today - interval '5 months')::date,
                                 ((v_today - interval '5 months') + interval '1 year' - interval '1 day')::date,
                                 v_me, true, null, 'Demo-Vertrag');
  v_k2 := public.book_membership(v_c2, '00000000-0000-4000-8000-000000000101',
                                 (v_today - interval '11 months')::date,
                                 ((v_today - interval '11 months') + interval '1 year' - interval '1 day')::date,
                                 v_me, false, null, 'Demo-Vertrag – Vertragsjahr endet bald');
  v_k3 := public.book_membership(v_c3, '00000000-0000-4000-8000-000000000103',
                                 (v_today - interval '2 months')::date,
                                 ((v_today - interval '2 months') + interval '2 years' - interval '1 day')::date,
                                 v_me, false, null, 'Demo-Vertrag über zwei Vertragsjahre');
  perform public.add_deliverable(v_c3, v_k3,
    (select y.id from public.contract_years y where y.contract_id = v_k3 and y.year_no = 1),
    '00000000-0000-4000-8000-000000000003', 'Firmenprofil – Aktualisierung', null, 'zusatzbuchung',
    'Demo: individuell vereinbarte Zusatzleistung', (v_today + 30), v_me, null);

  -- Kampagne & Ideen -------------------------------------------------------------
  insert into public.campaigns (name, goal, description, start_date, end_date, owner_id, status, topics, is_demo)
  values ('[DEMO] MEET GERMANY SUMMIT 2027', 'Anmeldungen und Sichtbarkeit für den SUMMIT steigern',
          'Speaker-, Aussteller- und Programmankündigungen.', v_today, v_today + 120, v_me, 'aktiv',
          array['Speaker', 'Aussteller', 'Programm'], true)
  returning id into v_camp;

  insert into public.ideas (title, description, tags, campaign_id, status, is_reusable, is_demo) values
    ('[DEMO] Speaker-Porträt im Kurzformat', 'Wiederkehrendes Format: ein Speaker, drei Fragen, ein Zitat.',
     array['Speaker', 'LinkedIn'], v_camp, 'vorgemerkt', true, true),
    ('[DEMO] Rückblick MeetUp Frankfurt', 'Bildergalerie und Stimmen aus dem MeetUp.', array['Eventrückblick'], null, 'neu', false, true),
    ('[DEMO] Checkliste nachhaltige Tagung', 'Evergreen-Thema für Kunden aus der Hotellerie.', array['Nachhaltigkeit'], null, 'neu', true, true);

  -- Akte 1: Artikel veröffentlicht, Social-Beitrag freigegeben & verbindlich geplant
  select d.id into v_del from public.deliverables d
   where d.contract_id = v_k1 and d.content_kind = 'magazinartikel' and d.unit_no = 1;
  select d.id into v_del_social from public.deliverables d where d.parent_deliverable_id = v_del;

  insert into public.dossiers (title, kind, client_id, contract_id, deliverable_id, contact_id, topic, goal, target_audience,
                               owner_id, period_start, period_end, is_demo)
  values ('[DEMO] Nachhaltig tagen am Rhein', 'kunde', v_c1, v_k1, v_del, v_ct1, 'Green Meetings im Tagungshotel',
          'Positionierung als nachhaltige Tagungslocation', 'Event- und Tagungsplaner in Unternehmen',
          v_me, v_today - 40, v_today + 10, true)
  returning id into v_d1;

  insert into public.media_assets (dossier_id, client_id, kind, source, external_url, file_name, mime_type, width, height,
                                   alt_text, credit, status)
  values (v_d1, v_c1, 'bild', 'link', 'https://drive.google.com/demo-seehotel', 'seehotel-terrasse.jpg', 'image/jpeg',
          1080, 1350, 'Tagungsterrasse mit Blick auf den Rhein', 'Foto: Demo', 'final')
  returning id into v_media;

  insert into public.content_items (dossier_id, kind, channel, deliverable_id, title, teaser, body_html, seo_title,
                                    meta_description, author_name, assignee_id, window_start, window_end)
  values (v_d1, 'magazinartikel', 'magazin', v_del, '[DEMO] Nachhaltig tagen am Rhein',
          'Wie das Seehotel Rheinblick Green Meetings mit regionalen Partnern umsetzt.',
          '<p>Demo-Text: Nachhaltige Veranstaltungen beginnen bei der Anreise …</p><h2>Regionale Partner</h2><p>…</p>',
          'Nachhaltig tagen am Rhein | MICE Magazin', 'Green Meetings im Seehotel Rheinblick – ein Praxisbeispiel.',
          'MEET GERMANY Redaktion', v_me, v_today - 10, v_today - 3)
  returning id into v_a1;
  insert into public.content_media (content_item_id, media_asset_id, position, role) values (v_a1, v_media, 0, 'titelbild');

  insert into public.content_items (dossier_id, kind, channel, parent_id, deliverable_id, title, caption, cta, hashtags,
                                    post_format, assignee_id, window_start, window_end)
  values (v_d1, 'social', 'instagram', v_a1, v_del_social, '[DEMO] Instagram: Nachhaltig tagen',
          'Tagen mit Weitblick: Wie Green Meetings am Rhein gelingen. Den ganzen Artikel lest ihr im MICE Magazin.',
          'Link in Bio', array['#GreenMeetings', '#MICE', '#MEETGERMANY'], 'feed_bild', v_me, v_today + 2, v_today + 5)
  returning id into v_s1;
  insert into public.content_media (content_item_id, media_asset_id, position, role) values (v_s1, v_media, 0, 'medium');

  perform public.request_internal_review(v_a1, 'Demo');
  perform public.decide_internal_review(v_a1, 'freigegeben', 'Demo: sauber recherchiert');
  perform public.request_internal_review(v_s1, 'Demo');
  perform public.decide_internal_review(v_s1, 'freigegeben', null);

  v_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  v_preview := public.create_preview(v_d1, array[v_a1, v_s1], 'Mara Beispiel', 'mara.beispiel@example.com', v_ct1,
                                     'Demo-Vorschau', private.hash_token(v_token), null, now() + interval '14 days', v_today + 3);
  update public.previews set status = 'versendet', sent_at = now() - interval '6 days' where id = v_preview;
  select pi.id into v_pi1 from public.preview_items pi where pi.preview_id = v_preview and pi.content_item_id = v_a1;
  select pi.id into v_pi2 from public.preview_items pi where pi.preview_id = v_preview and pi.content_item_id = v_s1;
  perform public.public_submit_preview_decisions(
    v_token,
    jsonb_build_array(jsonb_build_object('item_id', v_pi1, 'decision', 'freigegeben'),
                      jsonb_build_object('item_id', v_pi2, 'decision', 'freigegeben')),
    'Mara Beispiel', 'mara.beispiel@example.com', 'Leitung Marketing', true);
  perform set_config('app.actor_label', '', true);

  perform public.confirm_manual_publication(v_a1, 'https://example.com/mice-magazin/demo-nachhaltig-tagen',
                                            now() - interval '3 days', 'Demo: manuell im Magazin-CMS veröffentlicht');
  perform public.schedule_content(v_s1, 'verbindlich',
                                  ((v_today + 3)::timestamp + time '10:00') at time zone 'Europe/Berlin', false, null);

  -- Akte 2: Vorschau versendet, Kunde hat noch nicht reagiert ---------------------
  select d.id into v_del from public.deliverables d
   where d.contract_id = v_k1 and d.content_kind = 'magazinartikel' and d.unit_no = 2;
  insert into public.dossiers (title, kind, client_id, contract_id, deliverable_id, contact_id, topic, owner_id,
                               period_start, period_end, is_demo)
  values ('[DEMO] Hybride Formate im Seehotel', 'kunde', v_c1, v_k1, v_del, v_ct1, 'Hybride Veranstaltungen', v_me,
          v_today, v_today + 30, true)
  returning id into v_d2;
  insert into public.content_items (dossier_id, kind, channel, deliverable_id, title, teaser, body_html, author_name,
                                    assignee_id, window_start, window_end)
  values (v_d2, 'magazinartikel', 'magazin', v_del, '[DEMO] Hybride Formate, die wirklich funktionieren',
          'Technik, Moderation, Dramaturgie: Erfahrungen aus 50 hybriden Tagungen.',
          '<p>Demo-Text …</p>', 'MEET GERMANY Redaktion', v_me, v_today + 7, v_today + 14)
  returning id into v_a2;
  perform public.request_internal_review(v_a2, null);
  perform public.decide_internal_review(v_a2, 'freigegeben', null);
  v_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  v_preview := public.create_preview(v_d2, array[v_a2], 'Mara Beispiel', 'mara.beispiel@example.com', v_ct1, null,
                                     private.hash_token(v_token), null, now() + interval '14 days', v_today - 1);
  update public.previews set status = 'versendet', sent_at = now() - interval '4 days' where id = v_preview;

  -- Akte 3: Material angefordert, aber nicht eingereicht --------------------------
  select d.id into v_del from public.deliverables d
   where d.contract_id = v_k1 and d.content_kind = 'magazinartikel' and d.unit_no = 3;
  insert into public.dossiers (title, kind, client_id, contract_id, deliverable_id, contact_id, topic, owner_id, is_demo,
                               period_start, period_end)
  values ('[DEMO] Teambuilding am Wasser', 'kunde', v_c1, v_k1, v_del, v_ct1, 'Outdoor-Teambuilding', v_me, true,
          v_today + 20, v_today + 50)
  returning id into v_d3;
  insert into public.material_requests (dossier_id, client_id, contact_id, form_id, form_snapshot, recipient_name, recipient_email,
                                        token_hash, expires_at, status, due_date, sent_at)
  select v_d3, v_c1, v_ct1, f.id, jsonb_build_object('name', f.name, 'intro_text', f.intro_text, 'fields', f.fields),
         'Mara Beispiel', 'mara.beispiel@example.com',
         private.hash_token(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')),
         now() + interval '20 days', 'versendet', v_today - 2, now() - interval '8 days'
    from public.material_forms f where f.is_default limit 1;
  perform private.ensure_task('demo_material:' || v_d3::text, 'Material vom Kunden abwarten: Teambuilding am Wasser',
                              'material_anfordern', v_me, v_today - 2, v_d3, null, null, 'wartet_auf_kunde');

  -- Akte 4: Werft – interne Prüfung ausstehend, Vertragsjahr endet bald ----------
  select d.id into v_del from public.deliverables d where d.contract_id = v_k2 and d.content_kind = 'magazinartikel';
  insert into public.dossiers (title, kind, client_id, contract_id, deliverable_id, contact_id, topic, owner_id, is_demo)
  values ('[DEMO] Industriecharme für Firmenevents', 'kunde', v_c2, v_k2, v_del, v_ct2, 'Eventlocation mit Geschichte', v_me, true)
  returning id into v_d4;
  insert into public.content_items (dossier_id, kind, channel, deliverable_id, title, teaser, body_html, assignee_id)
  values (v_d4, 'magazinartikel', 'magazin', v_del, '[DEMO] Industriecharme für Firmenevents',
          'Die Alte Werft zeigt, wie historische Hallen moderne Events tragen.', '<p>Demo-Entwurf …</p>', v_me)
  returning id into v_a4;
  perform public.request_internal_review(v_a4, 'Bitte bis Freitag prüfen');

  -- Eigene Redaktion: SUMMIT-Kampagne -------------------------------------------
  insert into public.dossiers (title, kind, campaign_id, own_category, topic, goal, owner_id, period_start, period_end, is_demo)
  values ('[DEMO] SUMMIT 2027 – Keynote-Ankündigung', 'eigen', v_camp, 'speaker', 'Keynote-Speaker vorstellen',
          'Aufmerksamkeit für den SUMMIT', v_me, v_today + 5, v_today + 20, true)
  returning id into v_d5;
  insert into public.content_items (dossier_id, kind, channel, title, caption, cta, hashtags, post_format, assignee_id,
                                    schedule_status, scheduled_at)
  values (v_d5, 'social', 'linkedin', '[DEMO] LinkedIn: Keynote-Ankündigung',
          'Wir freuen uns auf unsere Keynote beim MEET GERMANY SUMMIT 2027 – Details folgen in Kürze.',
          'Jetzt Ticket sichern', array['#MEETGERMANYSUMMIT', '#MICE'], 'text', v_me, 'vorlaeufig',
          ((v_today + 6)::timestamp + time '09:30') at time zone 'Europe/Berlin')
  returning id into v_o1;
  perform public.request_internal_review(v_o1, null);
  perform public.decide_internal_review(v_o1, 'freigegeben', null);
  insert into public.content_items (dossier_id, kind, channel, title, caption, hashtags, post_format, assignee_id,
                                    schedule_status, scheduled_at)
  values (v_d5, 'social', 'instagram', '[DEMO] Instagram: Keynote-Ankündigung',
          'Save the date: MEET GERMANY SUMMIT 2027.', array['#MEETGERMANYSUMMIT'], 'feed_bild', v_me, 'vorlaeufig',
          ((v_today + 6)::timestamp + time '12:00') at time zone 'Europe/Berlin')
  returning id into v_o2;
  perform private.ensure_task('demo_grafik:' || v_o2::text, 'Grafik für Keynote-Ankündigung (Instagram) erstellen',
                              'grafik', v_me, v_today + 3, v_d5, v_o2, 'Format 4:5, JPEG', 'offen', 'hoch');

  -- Allgemeine Aufgaben ------------------------------------------------------------
  insert into public.tasks (title, description, priority, assignee_id, due_date, status, is_demo)
  values ('[DEMO] Newsletter Oktober vorbereiten', 'Themen sammeln, Kundenbeiträge verlinken.', 'normal', v_me, v_today, 'offen', true),
         ('[DEMO] Eventrückblick MeetUp veröffentlichen', null, 'hoch', v_me, v_today - 2, 'in_arbeit', true);

  perform set_config('app.actor_label', '', true);
  perform private.log_event('demo_geladen', 'app', null, null, null, 'Demo-Daten geladen');

  return jsonb_build_object('ok', true, 'kunden', 3, 'akten', 5);
end;
$$;

create or replace function public.admin_remove_demo_data()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_dossiers integer;
  v_clients integer;
begin
  if not private.is_admin() then
    raise exception 'Nur Admins dürfen Demo-Daten entfernen.' using errcode = '42501';
  end if;
  delete from public.tasks where is_demo;
  delete from public.dossiers where is_demo or client_id in (select id from public.clients where is_demo);
  get diagnostics v_dossiers = row_count;
  delete from public.ideas where is_demo;
  delete from public.campaigns where is_demo;
  delete from public.clients where is_demo;
  get diagnostics v_clients = row_count;
  perform private.log_event('demo_entfernt', 'app', null, null, null,
                            format('Demo-Daten entfernt (%s Kunden, %s Akten)', v_clients, v_dossiers));
  return jsonb_build_object('ok', true, 'kunden', v_clients, 'akten', v_dossiers);
end;
$$;
