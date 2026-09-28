-- =============================================================================
-- Kundenzugang ohne Konto: Materialformular und Vorschau/Freigabe per
-- persönlichem, zeitlich begrenztem und widerrufbarem Link.
--
-- Sicherheit
--  * Tokens werden in der App mit 256 Bit Zufall erzeugt. In der Datenbank liegt
--    nur der SHA-256-Hash (Suche) und optional eine mit einem Server-Schlüssel
--    verschlüsselte Kopie (für erneuten Versand von Erinnerungen).
--  * Die Rolle "anon" hat keinerlei Tabellenrechte. Kunden greifen ausschließlich
--    über die SECURITY-DEFINER-Funktionen public_* zu, die Token, Ablauf und
--    Widerruf prüfen und nur die freigegebenen Daten zurückgeben.
-- =============================================================================

create or replace function private.hash_token(p_token text)
returns text
language sql
immutable
set search_path = ''
as $$
  select encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex')
$$;

-- -----------------------------------------------------------------------------
-- Materialformulare (konfigurierbar)
-- -----------------------------------------------------------------------------
create table public.material_forms (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  intro_text text,
  fields jsonb not null check (jsonb_typeof(fields) = 'array'),
  is_default boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid() references public.profiles (id) on delete set null
);

create unique index material_forms_one_default on public.material_forms (is_default) where is_default;

create trigger material_forms_updated_at before update on public.material_forms
  for each row execute function private.set_updated_at();

create table public.material_requests (
  id uuid primary key default gen_random_uuid(),
  dossier_id uuid not null references public.dossiers (id) on delete cascade,
  client_id uuid references public.clients (id) on delete cascade,
  contact_id uuid references public.contacts (id) on delete set null,
  form_id uuid references public.material_forms (id) on delete set null,
  form_snapshot jsonb not null,
  recipient_name text,
  recipient_email text,
  message text,
  token_hash text not null unique,
  token_encrypted text,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  revoked_by uuid references public.profiles (id) on delete set null,
  status text not null default 'erstellt'
    check (status in ('erstellt', 'versendet', 'geoeffnet', 'in_bearbeitung', 'eingereicht', 'geprueft', 'rueckfrage', 'widerrufen')),
  due_date date,
  sent_at timestamptz,
  first_opened_at timestamptz,
  last_saved_at timestamptz,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles (id) on delete set null,
  review_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.profiles (id) on delete set null
);

create index material_requests_dossier_idx on public.material_requests (dossier_id);
create index material_requests_status_idx on public.material_requests (status, sent_at);

create trigger material_requests_updated_at before update on public.material_requests
  for each row execute function private.set_updated_at();
create trigger material_requests_audit after insert or update or delete on public.material_requests
  for each row execute function private.audit_row();

alter table public.media_assets
  add constraint media_assets_material_request_fk foreign key (material_request_id)
  references public.material_requests (id) on delete set null;

create table public.material_responses (
  request_id uuid primary key references public.material_requests (id) on delete cascade,
  answers jsonb not null default '{}'::jsonb check (jsonb_typeof(answers) = 'object'),
  submitted_by_name text,
  submitted_by_email text,
  revision integer not null default 0,
  updated_at timestamptz not null default now(),
  submitted_at timestamptz
);

-- -----------------------------------------------------------------------------
-- Kundenvorschauen
-- -----------------------------------------------------------------------------
create table public.previews (
  id uuid primary key default gen_random_uuid(),
  dossier_id uuid not null references public.dossiers (id) on delete cascade,
  client_id uuid references public.clients (id) on delete cascade,
  contact_id uuid references public.contacts (id) on delete set null,
  recipient_name text,
  recipient_email text,
  message text,
  token_hash text not null unique,
  token_encrypted text,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  revoked_by uuid references public.profiles (id) on delete set null,
  status text not null default 'erstellt'
    check (status in ('erstellt', 'versendet', 'geoeffnet', 'teilweise_beantwortet', 'beantwortet', 'ersetzt', 'widerrufen')),
  round integer not null default 1,
  replaces_preview_id uuid references public.previews (id) on delete set null,
  response_due_date date,
  sent_at timestamptz,
  first_viewed_at timestamptz,
  last_viewed_at timestamptz,
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.profiles (id) on delete set null
);

create index previews_dossier_idx on public.previews (dossier_id, created_at desc);
create index previews_status_idx on public.previews (status, sent_at);

create trigger previews_updated_at before update on public.previews
  for each row execute function private.set_updated_at();
create trigger previews_audit after insert or update or delete on public.previews
  for each row execute function private.audit_row();

create table public.preview_items (
  id uuid primary key default gen_random_uuid(),
  preview_id uuid not null references public.previews (id) on delete cascade,
  content_item_id uuid not null references public.content_items (id) on delete cascade,
  content_version_id uuid not null references public.content_versions (id),
  proposed_start date,
  proposed_end date,
  proposed_at timestamptz,
  position integer not null default 0,
  decision text check (decision in ('freigegeben', 'aenderung_gewuenscht')),
  decision_comment text,
  decided_at timestamptz,
  approval_id uuid references public.approvals (id) on delete set null,
  unique (preview_id, content_item_id)
);

create index preview_items_content_idx on public.preview_items (content_item_id);

-- -----------------------------------------------------------------------------
-- Interne Funktionen: Vorschau anlegen, Links widerrufen
-- -----------------------------------------------------------------------------

-- Unbeantwortete Inhalte einer nicht mehr gültigen Vorschau (widerrufen/ersetzt)
-- verlassen den Status "beim Kunden" wieder – außer sie sind in p_keep enthalten.
create or replace function private.release_preview_items(p_preview_id uuid, p_keep uuid[] default '{}')
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.content_items c
     set status = case
           when c.approvals_complete then 'freigegeben'
           when c.internal_ok or not c.requires_internal_approval then 'intern_freigegeben'
           else 'entwurf'
         end
    from public.preview_items pi
   where pi.preview_id = p_preview_id and pi.content_item_id = c.id and pi.decision is null
     and c.status = 'beim_kunden'
     and not (c.id = any (coalesce(p_keep, '{}')));
end;
$$;

create or replace function public.create_preview(
  p_dossier_id uuid,
  p_content_ids uuid[],
  p_recipient_name text,
  p_recipient_email text,
  p_contact_id uuid,
  p_message text,
  p_token_hash text,
  p_token_encrypted text,
  p_expires_at timestamptz,
  p_response_due_date date default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_dossier public.dossiers;
  v_item public.content_items;
  v_preview_id uuid;
  v_version_id uuid;
  v_round integer;
  v_pos integer := 0;
  v_id uuid;
begin
  if not private.is_editor() then
    raise exception 'Keine Berechtigung zum Versenden von Kundenvorschauen.' using errcode = '42501';
  end if;
  select * into v_dossier from public.dossiers where id = p_dossier_id;
  if not found then
    raise exception 'Beitragsakte nicht gefunden.' using errcode = 'P0002';
  end if;
  if coalesce(array_length(p_content_ids, 1), 0) = 0 then
    raise exception 'Bitte mindestens einen Inhalt für die Vorschau auswählen.' using errcode = '22023';
  end if;
  if coalesce(trim(p_recipient_email), '') = '' then
    raise exception 'Bitte eine Empfänger-E-Mail angeben.' using errcode = '22023';
  end if;
  if p_expires_at <= now() then
    raise exception 'Das Ablaufdatum muss in der Zukunft liegen.' using errcode = '22023';
  end if;
  if length(coalesce(p_token_hash, '')) <> 64 then
    raise exception 'Ungültiger Token-Hash.' using errcode = '22023';
  end if;

  -- Voraussetzungen je Inhalt
  foreach v_id in array p_content_ids loop
    select * into v_item from public.content_items where id = v_id;
    if not found or v_item.dossier_id <> p_dossier_id then
      raise exception 'Ein ausgewählter Inhalt gehört nicht zu dieser Beitragsakte.' using errcode = '22023';
    end if;
    if v_item.requires_internal_approval and not v_item.internal_ok then
      raise exception '„%“ ist in der aktuellen Fassung noch nicht intern freigegeben.', v_item.title using errcode = 'P0001';
    end if;
    if v_item.status in ('veroeffentlicht', 'archiviert') then
      raise exception '„%“ ist bereits veröffentlicht oder archiviert.', v_item.title using errcode = 'P0001';
    end if;
  end loop;

  select coalesce(max(p.round), 0) + 1 into v_round from public.previews p where p.dossier_id = p_dossier_id;

  insert into public.previews (dossier_id, client_id, contact_id, recipient_name, recipient_email, message,
                               token_hash, token_encrypted, expires_at, round, response_due_date,
                               replaces_preview_id)
  values (p_dossier_id, v_dossier.client_id, p_contact_id, p_recipient_name, lower(trim(p_recipient_email)), p_message,
          p_token_hash, p_token_encrypted, p_expires_at, v_round, p_response_due_date,
          (select p.id from public.previews p where p.dossier_id = p_dossier_id order by p.round desc limit 1))
  returning id into v_preview_id;

  -- Ältere, noch offene Vorschauen derselben Akte werden ersetzt; deren unbeantwortete
  -- Inhalte, die nicht erneut gesendet werden, sind danach nicht mehr "beim Kunden".
  for v_id in
    update public.previews
       set status = 'ersetzt'
     where dossier_id = p_dossier_id and id <> v_preview_id
       and status in ('erstellt', 'versendet', 'geoeffnet', 'teilweise_beantwortet')
    returning id
  loop
    perform private.release_preview_items(v_id, p_content_ids);
  end loop;
  update public.tasks set status = 'erledigt'
   where task_type = 'kundenfeedback' and dossier_id = p_dossier_id
     and status in ('offen', 'in_arbeit', 'wartet_auf_kunde');

  foreach v_id in array p_content_ids loop
    select * into v_item from public.content_items where id = v_id;
    v_version_id := private.ensure_version(v_id, 'kundenvorschau');
    insert into public.preview_items (preview_id, content_item_id, content_version_id, proposed_start, proposed_end,
                                      proposed_at, position)
    values (v_preview_id, v_id, v_version_id, v_item.window_start, v_item.window_end,
            v_item.scheduled_at, v_pos);
    v_pos := v_pos + 1;
    if v_item.requires_client_approval then
      update public.content_items set status = 'beim_kunden'
       where id = v_id and status in ('intern_freigegeben', 'entwurf', 'aenderung_gewuenscht', 'beim_kunden');
    end if;
    perform private.close_tasks('kundenvorschau', p_dossier_id, v_id);
  end loop;

  perform private.ensure_task('kundenfeedback:' || v_preview_id::text,
                              'Kundenfeedback abwarten: ' || v_dossier.title, 'kundenfeedback',
                              v_dossier.owner_id, p_response_due_date, p_dossier_id, null,
                              'Vorschau Runde ' || v_round || ' an ' || coalesce(p_recipient_name, p_recipient_email),
                              'wartet_auf_kunde');

  perform private.log_event('vorschau_erstellt', 'previews', v_preview_id, p_dossier_id, v_dossier.client_id,
                            format('Kundenvorschau Runde %s für %s erstellt (%s Inhalt(e))', v_round,
                                   coalesce(p_recipient_name, p_recipient_email), array_length(p_content_ids, 1)));
  return v_preview_id;
end;
$$;

create or replace function public.revoke_preview(p_preview_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_preview public.previews;
begin
  if not private.is_editor() then
    raise exception 'Keine Berechtigung.' using errcode = '42501';
  end if;
  update public.previews
     set revoked_at = now(), revoked_by = auth.uid(), status = 'widerrufen'
   where id = p_preview_id and revoked_at is null
  returning * into v_preview;
  if found then
    update public.tasks set status = 'abgebrochen'
     where auto_key = 'kundenfeedback:' || p_preview_id::text and status not in ('erledigt', 'abgebrochen');
    perform private.release_preview_items(p_preview_id);
    perform private.log_event('vorschau_widerrufen', 'previews', p_preview_id, v_preview.dossier_id, v_preview.client_id,
                              'Vorschau-Link widerrufen');
  end if;
end;
$$;

create or replace function public.revoke_material_request(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_req public.material_requests;
begin
  if not private.is_editor() then
    raise exception 'Keine Berechtigung.' using errcode = '42501';
  end if;
  update public.material_requests
     set revoked_at = now(), revoked_by = auth.uid(), status = 'widerrufen'
   where id = p_request_id and revoked_at is null
  returning * into v_req;
  if found then
    -- Warte-Aufgaben der Anfrage und aller Rückfragen (Schlüssel material_warten:<id>[:<zeit>])
    update public.tasks set status = 'abgebrochen'
     where (auto_key = 'material_warten:' || p_request_id::text or auto_key like 'material_warten:' || p_request_id::text || ':%')
       and status not in ('erledigt', 'abgebrochen');
    perform private.log_event('materiallink_widerrufen', 'material_requests', p_request_id, v_req.dossier_id, v_req.client_id,
                              'Link zum Materialformular widerrufen');
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- Öffentliche Funktionen für Kunden (anon) – Materialformular
-- -----------------------------------------------------------------------------
create or replace function private.material_request_by_token(p_token text)
returns public.material_requests
language sql
stable
security definer
set search_path = ''
as $$
  select r.* from public.material_requests r where r.token_hash = private.hash_token(p_token)
$$;

create or replace function public.public_get_material_request(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_req public.material_requests;
  v_resp public.material_responses;
  v_client_name text;
  v_dossier_title text;
begin
  v_req := private.material_request_by_token(p_token);
  if v_req.id is null then
    return jsonb_build_object('error', 'ungueltig');
  end if;
  if v_req.revoked_at is not null then
    return jsonb_build_object('error', 'widerrufen');
  end if;
  if v_req.expires_at < now() then
    return jsonb_build_object('error', 'abgelaufen');
  end if;

  update public.material_requests
     set first_opened_at = coalesce(first_opened_at, now()),
         status = case when status in ('erstellt', 'versendet') then 'geoeffnet' else status end
   where id = v_req.id
  returning * into v_req;

  select * into v_resp from public.material_responses where request_id = v_req.id;
  select c.name into v_client_name from public.clients c where c.id = v_req.client_id;
  select d.title into v_dossier_title from public.dossiers d where d.id = v_req.dossier_id;

  return jsonb_build_object(
    'request', jsonb_build_object(
      'id', v_req.id,
      'status', v_req.status,
      'fields', v_req.form_snapshot -> 'fields',
      'intro_text', v_req.form_snapshot ->> 'intro_text',
      'form_name', v_req.form_snapshot ->> 'name',
      'message', v_req.message,
      'recipient_name', v_req.recipient_name,
      'expires_at', v_req.expires_at,
      'due_date', v_req.due_date,
      'client_name', v_client_name,
      'dossier_title', v_dossier_title,
      'editable', v_req.status not in ('eingereicht', 'geprueft')
    ),
    'response', case when v_resp.request_id is null then null else jsonb_build_object(
      'answers', v_resp.answers,
      'submitted_at', v_resp.submitted_at,
      'submitted_by_name', v_resp.submitted_by_name,
      'submitted_by_email', v_resp.submitted_by_email,
      'revision', v_resp.revision
    ) end,
    'files', coalesce((
      select jsonb_agg(jsonb_build_object('id', m.id, 'file_name', m.file_name, 'mime_type', m.mime_type,
                                          'size_bytes', m.size_bytes, 'kind', m.kind, 'source', m.source,
                                          'external_url', m.external_url, 'credit', m.credit,
                                          'rights_note', m.rights_note, 'created_at', m.created_at)
                       order by m.created_at)
        from public.media_assets m
       where m.material_request_id = v_req.id and m.uploaded_via = 'kunde'
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.public_save_material_response(
  p_token text,
  p_answers jsonb,
  p_submit boolean,
  p_name text,
  p_email text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_req public.material_requests;
  v_field jsonb;
  v_missing text[] := '{}';
  v_revision integer;
  v_owner uuid;
  v_title text;
begin
  v_req := private.material_request_by_token(p_token);
  if v_req.id is null or v_req.revoked_at is not null or v_req.expires_at < now() then
    return jsonb_build_object('error', 'ungueltig');
  end if;
  if v_req.status in ('eingereicht', 'geprueft') then
    return jsonb_build_object('error', 'bereits_eingereicht');
  end if;
  if p_answers is null or jsonb_typeof(p_answers) <> 'object' then
    return jsonb_build_object('error', 'ungueltige_daten');
  end if;
  if pg_column_size(p_answers) > 200000 then
    return jsonb_build_object('error', 'zu_gross');
  end if;

  if p_submit then
    if coalesce(trim(p_name), '') = '' or coalesce(trim(p_email), '') !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
      return jsonb_build_object('error', 'identitaet_fehlt');
    end if;
    for v_field in select value from jsonb_array_elements(coalesce(v_req.form_snapshot -> 'fields', '[]'::jsonb)) loop
      if coalesce((v_field ->> 'required')::boolean, false)
         and coalesce(v_field ->> 'type', 'text') not in ('files', 'heading')
         and (p_answers -> (v_field ->> 'key') is null
              or jsonb_typeof(p_answers -> (v_field ->> 'key')) = 'null'
              or trim(both from coalesce(p_answers ->> (v_field ->> 'key'), '')) in ('', '[]', '{}', '""')) then
        v_missing := v_missing || (v_field ->> 'label');
      end if;
    end loop;
    if array_length(v_missing, 1) > 0 then
      return jsonb_build_object('error', 'pflichtfelder', 'missing', to_jsonb(v_missing));
    end if;
  end if;

  perform set_config('app.actor_label', 'Kunde: ' || coalesce(nullif(trim(p_name), ''), v_req.recipient_name, 'unbekannt'), true);

  insert into public.material_responses (request_id, answers, submitted_by_name, submitted_by_email, revision, updated_at, submitted_at)
  values (v_req.id, p_answers, nullif(trim(p_name), ''), nullif(lower(trim(p_email)), ''), 1, now(),
          case when p_submit then now() end)
  on conflict (request_id) do update
     set answers = excluded.answers,
         submitted_by_name = coalesce(excluded.submitted_by_name, public.material_responses.submitted_by_name),
         submitted_by_email = coalesce(excluded.submitted_by_email, public.material_responses.submitted_by_email),
         revision = public.material_responses.revision + 1,
         updated_at = now(),
         submitted_at = case when p_submit then now() else public.material_responses.submitted_at end
  returning revision into v_revision;

  update public.material_requests
     set last_saved_at = now(),
         status = case when p_submit then 'eingereicht' else 'in_bearbeitung' end,
         submitted_at = case when p_submit then now() else submitted_at end
   where id = v_req.id;

  if p_submit then
    select d.owner_id, d.title into v_owner, v_title from public.dossiers d where d.id = v_req.dossier_id;
    update public.tasks set status = 'erledigt'
     where (auto_key = 'material_warten:' || v_req.id::text or auto_key like 'material_warten:' || v_req.id::text || ':%')
       and status not in ('erledigt', 'abgebrochen');
    perform private.ensure_task('material_pruefen:' || v_req.id::text || ':' || v_revision::text,
                                'Material prüfen: ' || v_title, 'material_pruefen', v_owner,
                                (now() at time zone 'Europe/Berlin')::date + 2, v_req.dossier_id, null,
                                'Eingereicht von ' || trim(p_name) || ' (' || lower(trim(p_email)) || ')', 'offen', 'hoch');
    if v_owner is not null then
      perform private.notify(v_owner, 'material_eingegangen', 'Material eingegangen: ' || v_title,
                             'Eingereicht von ' || trim(p_name), '/beitraege/' || v_req.dossier_id::text,
                             'material_eingegangen:' || v_req.id::text || ':' || v_revision::text);
    else
      perform private.notify_roles(array['admin', 'redaktion'], 'material_eingegangen', 'Material eingegangen: ' || v_title,
                                   'Eingereicht von ' || trim(p_name), '/beitraege/' || v_req.dossier_id::text,
                                   'material_eingegangen:' || v_req.id::text || ':' || v_revision::text);
    end if;
    perform private.log_event('material_eingereicht', 'material_requests', v_req.id, v_req.dossier_id, v_req.client_id,
                              format('Material eingereicht von %s (%s)', trim(p_name), lower(trim(p_email))));
  end if;

  return jsonb_build_object('ok', true, 'submitted', p_submit, 'revision', v_revision);
end;
$$;

-- Prüft den Token und liefert das Upload-Ziel (Pfad-Präfix) für eine Kundendatei.
create or replace function public.public_material_upload_target(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_req public.material_requests;
  v_count integer;
begin
  v_req := private.material_request_by_token(p_token);
  if v_req.id is null or v_req.revoked_at is not null or v_req.expires_at < now()
     or v_req.status in ('eingereicht', 'geprueft') then
    return jsonb_build_object('error', 'ungueltig');
  end if;
  select count(*) into v_count from public.media_assets m where m.material_request_id = v_req.id;
  if v_count >= 40 then
    return jsonb_build_object('error', 'zu_viele_dateien');
  end if;
  return jsonb_build_object('request_id', v_req.id, 'prefix', 'material/' || v_req.id::text || '/');
end;
$$;

create or replace function public.public_register_material_file(
  p_token text,
  p_storage_path text,
  p_file_name text,
  p_mime_type text,
  p_size_bytes bigint,
  p_width integer default null,
  p_height integer default null,
  p_credit text default null,
  p_rights_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_req public.material_requests;
  v_id uuid;
  v_kind text;
begin
  v_req := private.material_request_by_token(p_token);
  if v_req.id is null or v_req.revoked_at is not null or v_req.expires_at < now()
     or v_req.status in ('eingereicht', 'geprueft') then
    return jsonb_build_object('error', 'ungueltig');
  end if;
  if p_storage_path is null or left(p_storage_path, length('material/' || v_req.id::text || '/')) <> 'material/' || v_req.id::text || '/'
     or p_storage_path like '%..%' then
    return jsonb_build_object('error', 'ungueltiger_pfad');
  end if;
  v_kind := case
    when p_mime_type like 'image/%' then 'bild'
    when p_mime_type like 'video/%' then 'video'
    else 'dokument'
  end;
  perform set_config('app.actor_label', 'Kunde (Materialformular)', true);
  insert into public.media_assets (dossier_id, client_id, kind, source, storage_bucket, storage_path, file_name, mime_type,
                                   size_bytes, width, height, credit, rights_note, uploaded_via, material_request_id, created_by)
  values (v_req.dossier_id, v_req.client_id, v_kind, 'upload', 'media', p_storage_path, left(p_file_name, 255), p_mime_type,
          p_size_bytes, p_width, p_height, left(p_credit, 500), left(p_rights_note, 2000), 'kunde', v_req.id, null)
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

create or replace function public.public_remove_material_file(p_token text, p_media_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_req public.material_requests;
  v_path text;
begin
  v_req := private.material_request_by_token(p_token);
  if v_req.id is null or v_req.revoked_at is not null or v_req.expires_at < now()
     or v_req.status in ('eingereicht', 'geprueft') then
    return jsonb_build_object('error', 'ungueltig');
  end if;
  if exists (select 1 from public.content_media cm where cm.media_asset_id = p_media_id) then
    return jsonb_build_object('error', 'in_verwendung');
  end if;
  perform set_config('app.actor_label', 'Kunde (Materialformular)', true);
  delete from public.media_assets
   where id = p_media_id and material_request_id = v_req.id and uploaded_via = 'kunde'
  returning storage_path into v_path;
  if v_path is null then
    return jsonb_build_object('error', 'nicht_gefunden');
  end if;
  return jsonb_build_object('ok', true, 'storage_path', v_path);
end;
$$;

-- Interne Prüfung des eingereichten Materials (inkl. Rückfrage = Formular wieder öffnen)
create or replace function public.review_material_request(p_request_id uuid, p_outcome text, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_req public.material_requests;
begin
  if not private.is_editor() then
    raise exception 'Keine Berechtigung.' using errcode = '42501';
  end if;
  if p_outcome not in ('geprueft', 'rueckfrage') then
    raise exception 'Ungültiges Ergebnis.' using errcode = '22023';
  end if;
  if p_outcome = 'rueckfrage' and coalesce(trim(p_note), '') = '' then
    raise exception 'Bitte die Rückfrage an den Kunden formulieren.' using errcode = '22023';
  end if;
  update public.material_requests
     set status = p_outcome, reviewed_at = now(), reviewed_by = auth.uid(), review_note = p_note
   where id = p_request_id
  returning * into v_req;
  if not found then
    raise exception 'Materialanfrage nicht gefunden.' using errcode = 'P0002';
  end if;
  update public.tasks set status = 'erledigt'
   where task_type = 'material_pruefen' and auto_key like 'material_pruefen:' || p_request_id::text || ':%'
     and status not in ('erledigt', 'abgebrochen');
  if p_outcome = 'rueckfrage' then
    perform private.ensure_task('material_warten:' || p_request_id::text || ':' || extract(epoch from now())::bigint::text,
                                'Rückfrage beim Kunden offen: ' || (select d.title from public.dossiers d where d.id = v_req.dossier_id),
                                'rueckfrage', (select d.owner_id from public.dossiers d where d.id = v_req.dossier_id),
                                (now() at time zone 'Europe/Berlin')::date + 5, v_req.dossier_id, null, p_note, 'wartet_auf_kunde');
  end if;
  perform private.log_event(case when p_outcome = 'geprueft' then 'material_geprueft' else 'material_rueckfrage' end,
                            'material_requests', p_request_id, v_req.dossier_id, v_req.client_id,
                            case when p_outcome = 'geprueft' then 'Material geprüft und übernommen' else 'Rückfrage an den Kunden gestellt' end,
                            null, p_note);
end;
$$;

-- -----------------------------------------------------------------------------
-- Öffentliche Funktionen für Kunden (anon) – Vorschau & Freigabe
-- -----------------------------------------------------------------------------
create or replace function public.public_get_preview(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_preview public.previews;
  v_client_name text;
  v_dossier_title text;
begin
  select * into v_preview from public.previews where token_hash = private.hash_token(p_token);
  if not found then
    return jsonb_build_object('error', 'ungueltig');
  end if;
  if v_preview.revoked_at is not null then
    return jsonb_build_object('error', 'widerrufen');
  end if;
  if v_preview.status = 'ersetzt' then
    return jsonb_build_object('error', 'ersetzt');
  end if;
  if v_preview.expires_at < now() then
    return jsonb_build_object('error', 'abgelaufen');
  end if;

  update public.previews
     set first_viewed_at = coalesce(first_viewed_at, now()),
         last_viewed_at = now(),
         status = case when status in ('erstellt', 'versendet') then 'geoeffnet' else status end
   where id = v_preview.id
  returning * into v_preview;

  select c.name into v_client_name from public.clients c where c.id = v_preview.client_id;
  select d.title into v_dossier_title from public.dossiers d where d.id = v_preview.dossier_id;

  return jsonb_build_object(
    'preview', jsonb_build_object(
      'id', v_preview.id,
      'round', v_preview.round,
      'status', v_preview.status,
      'recipient_name', v_preview.recipient_name,
      'message', v_preview.message,
      'expires_at', v_preview.expires_at,
      'response_due_date', v_preview.response_due_date,
      'client_name', v_client_name,
      'dossier_title', v_dossier_title
    ),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', pi.id,
               'kind', c.kind,
               'channel', c.channel,
               'version_no', v.version_no,
               'snapshot', v.snapshot,
               'proposed_start', pi.proposed_start,
               'proposed_end', pi.proposed_end,
               'proposed_at', pi.proposed_at,
               'decision', pi.decision,
               'decision_comment', pi.decision_comment,
               'decided_at', pi.decided_at)
             order by pi.position)
        from public.preview_items pi
        join public.content_items c on c.id = pi.content_item_id
        join public.content_versions v on v.id = pi.content_version_id
       where pi.preview_id = v_preview.id
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.public_submit_preview_decisions(
  p_token text,
  p_decisions jsonb,
  p_name text,
  p_email text,
  p_position text,
  p_confirmed boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_preview public.previews;
  v_decision jsonb;
  v_pi public.preview_items;
  v_item public.content_items;
  v_approval_id uuid;
  v_kind text;
  v_comment text;
  v_done integer := 0;
  v_open integer;
  v_owner uuid;
  v_title text;
  v_has_change boolean := false;
begin
  select * into v_preview from public.previews where token_hash = private.hash_token(p_token) for update;
  if not found or v_preview.revoked_at is not null or v_preview.expires_at < now() or v_preview.status = 'ersetzt' then
    return jsonb_build_object('error', 'ungueltig');
  end if;
  if coalesce(trim(p_name), '') = '' or coalesce(trim(p_email), '') !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    return jsonb_build_object('error', 'identitaet_fehlt');
  end if;
  if p_decisions is null or jsonb_typeof(p_decisions) <> 'array' or jsonb_array_length(p_decisions) = 0 then
    return jsonb_build_object('error', 'keine_entscheidung');
  end if;

  perform set_config('app.actor_label', 'Kunde: ' || trim(p_name) || ' <' || lower(trim(p_email)) || '>', true);
  select d.owner_id, d.title into v_owner, v_title from public.dossiers d where d.id = v_preview.dossier_id;

  for v_decision in select value from jsonb_array_elements(p_decisions) loop
    v_kind := v_decision ->> 'decision';
    v_comment := nullif(trim(coalesce(v_decision ->> 'comment', '')), '');
    if v_kind not in ('freigegeben', 'aenderung_gewuenscht') then
      return jsonb_build_object('error', 'ungueltige_entscheidung');
    end if;
    if v_kind = 'freigegeben' and not coalesce(p_confirmed, false) then
      return jsonb_build_object('error', 'bestaetigung_fehlt');
    end if;
    if v_kind = 'aenderung_gewuenscht' and v_comment is null then
      return jsonb_build_object('error', 'kommentar_fehlt');
    end if;

    select * into v_pi from public.preview_items
     where id = (v_decision ->> 'item_id')::uuid and preview_id = v_preview.id
     for update;
    if not found then
      return jsonb_build_object('error', 'unbekannter_inhalt');
    end if;
    if v_pi.decision is not null then
      continue; -- bereits entschieden (idempotent)
    end if;

    select * into v_item from public.content_items where id = v_pi.content_item_id;

    insert into public.approvals (content_item_id, content_version_id, dossier_id, kind, decision, comment,
                                  approver_name, approver_email, approver_position, preview_id, preview_item_id)
    values (v_pi.content_item_id, v_pi.content_version_id, v_item.dossier_id, 'kunde', v_kind, left(v_comment, 5000),
            left(trim(p_name), 200), left(lower(trim(p_email)), 320), left(nullif(trim(p_position), ''), 200),
            v_preview.id, v_pi.id)
    returning id into v_approval_id;

    update public.preview_items
       set decision = v_kind, decision_comment = left(v_comment, 5000), decided_at = now(), approval_id = v_approval_id
     where id = v_pi.id;

    if v_kind = 'freigegeben' then
      update public.content_items
         set client_approval_id = v_approval_id,
             status = case
               when status = 'beim_kunden'
                    and private.approval_matches(v_approval_id, id, 'kunde', fingerprint)
                    and (not requires_internal_approval or internal_ok) then 'freigegeben'
               else status
             end
       where id = v_pi.content_item_id;
      perform private.ensure_task('terminierung:' || v_pi.content_item_id::text || ':' || v_approval_id::text,
                                  'Verbindlich terminieren: ' || v_item.title, 'terminierung',
                                  coalesce(v_item.assignee_id, v_owner), (now() at time zone 'Europe/Berlin')::date + 1,
                                  v_item.dossier_id, v_item.id);
    else
      v_has_change := true;
      -- Der Änderungswunsch ersetzt eine frühere Kundenfreigabe: nicht mehr freigegeben,
      -- eine verbindliche Planung wird im Trigger zurückgestuft und offene Aufträge gestoppt.
      update public.content_items
         set client_approval_id = v_approval_id,
             status = case when status in ('beim_kunden', 'intern_freigegeben', 'freigegeben') then 'aenderung_gewuenscht' else status end
       where id = v_pi.content_item_id and status <> 'veroeffentlicht';
      perform private.ensure_task('aenderung:' || v_approval_id::text,
                                  'Änderungswunsch umsetzen: ' || v_item.title, 'aenderungen',
                                  coalesce(v_item.assignee_id, v_owner), (now() at time zone 'Europe/Berlin')::date + 2,
                                  v_item.dossier_id, v_item.id, v_comment, 'offen', 'hoch');
    end if;

    perform private.log_event(case when v_kind = 'freigegeben' then 'kunde_freigegeben' else 'kunde_aenderung_gewuenscht' end,
                              'content_items', v_item.id, v_item.dossier_id, v_preview.client_id,
                              format('%s: „%s“ (Version %s) durch %s <%s>',
                                     case when v_kind = 'freigegeben' then 'Kundenfreigabe' else 'Änderungswunsch' end,
                                     v_item.title,
                                     (select v.version_no from public.content_versions v where v.id = v_pi.content_version_id),
                                     trim(p_name), lower(trim(p_email))),
                              null, v_comment);
    v_done := v_done + 1;
  end loop;

  select count(*) into v_open from public.preview_items where preview_id = v_preview.id and decision is null;
  update public.previews
     set status = case when v_open = 0 then 'beantwortet' else 'teilweise_beantwortet' end,
         responded_at = now()
   where id = v_preview.id;

  if v_open = 0 then
    update public.tasks set status = 'erledigt'
     where auto_key = 'kundenfeedback:' || v_preview.id::text and status not in ('erledigt', 'abgebrochen');
  end if;

  if v_done > 0 then
    if v_owner is not null then
      perform private.notify(v_owner, 'kunde_hat_geantwortet',
                             case when v_has_change then 'Änderungswunsch vom Kunden: ' else 'Kundenfreigabe erhalten: ' end || v_title,
                             trim(p_name) || ' hat ' || v_done || ' Inhalt(e) beantwortet.',
                             '/beitraege/' || v_preview.dossier_id::text,
                             'kunde_antwort:' || v_preview.id::text || ':' || extract(epoch from now())::bigint::text);
    else
      perform private.notify_roles(array['admin', 'redaktion', 'freigabe'], 'kunde_hat_geantwortet',
                                   'Kundenantwort: ' || v_title, trim(p_name) || ' hat ' || v_done || ' Inhalt(e) beantwortet.',
                                   '/beitraege/' || v_preview.dossier_id::text,
                                   'kunde_antwort:' || v_preview.id::text || ':' || extract(epoch from now())::bigint::text);
    end if;
  end if;

  return jsonb_build_object('ok', true, 'decided', v_done, 'open', v_open);
end;
$$;
