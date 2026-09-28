-- =============================================================================
-- Veröffentlichung: Plattformkonten (MEET-GERMANY-eigene Seiten), geschützte
-- Zugangsdaten, Veröffentlichungsaufträge und -versuche.
--
-- Schutz vor Doppelveröffentlichung
--  * Pro Inhalt existiert höchstens ein aktiver oder erfolgreicher Auftrag
--    (partieller Unique-Index).
--  * Hintergrundläufe reservieren Aufträge mit FOR UPDATE SKIP LOCKED.
--  * Hängt ein Auftrag im Status "in_bearbeitung", wird er NICHT automatisch
--    wiederholt, sondern als "unklar" markiert und muss geprüft werden.
--  * "Veröffentlicht" nur nach Plattformbestätigung oder manueller Bestätigung.
-- =============================================================================

create table public.platform_accounts (
  id uuid primary key default gen_random_uuid(),
  platform text not null check (platform in ('instagram', 'facebook', 'linkedin')),
  display_name text not null,
  external_id text,
  auth_type text check (auth_type in ('facebook_login', 'instagram_login', 'linkedin_oauth', 'manuell')),
  api_enabled boolean not null default false,
  connection_status text not null default 'nicht_verbunden'
    check (connection_status in ('nicht_verbunden', 'verbunden', 'abgelaufen', 'fehler')),
  token_expires_at timestamptz,
  scopes text[] not null default '{}',
  last_checked_at timestamptz,
  last_error text,
  connected_by uuid references public.profiles (id) on delete set null,
  connected_at timestamptz,
  is_default boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index platform_accounts_default_idx on public.platform_accounts (platform) where is_default;

create trigger platform_accounts_updated_at before update on public.platform_accounts
  for each row execute function private.set_updated_at();
create trigger platform_accounts_audit after insert or update or delete on public.platform_accounts
  for each row execute function private.audit_row();

alter table public.content_items
  add constraint content_items_platform_account_fk foreign key (platform_account_id)
  references public.platform_accounts (id) on delete set null;

-- Zugangsdaten: AES-256-GCM-verschlüsselt (Schlüssel nur in der Server-Umgebung).
-- Keine RLS-Policies → ausschließlich über die Service-Rolle erreichbar.
create table public.platform_credentials (
  account_id uuid primary key references public.platform_accounts (id) on delete cascade,
  access_token_enc text not null,
  refresh_token_enc text,
  expires_at timestamptz,
  refresh_expires_at timestamptz,
  meta jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.platform_credentials enable row level security;

create table public.publish_jobs (
  id uuid primary key default gen_random_uuid(),
  content_item_id uuid not null references public.content_items (id) on delete cascade,
  dossier_id uuid not null references public.dossiers (id) on delete cascade,
  content_version_id uuid references public.content_versions (id),
  channel text not null,
  platform_account_id uuid references public.platform_accounts (id) on delete set null,
  method text not null check (method in ('api', 'manuell')),
  status text not null default 'geplant'
    check (status in ('geplant', 'in_bearbeitung', 'wartet_auf_plattform', 'veroeffentlicht',
                      'fehlgeschlagen', 'unklar', 'manuell_offen', 'abgebrochen')),
  scheduled_at timestamptz not null,
  locked_at timestamptz,
  locked_by uuid,
  attempt_count integer not null default 0,
  next_check_at timestamptz,
  external_container_id text,
  external_post_id text,
  published_url text,
  published_at timestamptz,
  last_error text,
  manual_reason text,
  cancel_reason text,
  confirmed_by uuid references public.profiles (id) on delete set null,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.profiles (id) on delete set null
);

create unique index publish_jobs_one_active_idx on public.publish_jobs (content_item_id)
  where status in ('geplant', 'in_bearbeitung', 'wartet_auf_plattform', 'veroeffentlicht',
                   'fehlgeschlagen', 'unklar', 'manuell_offen');
create index publish_jobs_due_idx on public.publish_jobs (status, scheduled_at);
create index publish_jobs_dossier_idx on public.publish_jobs (dossier_id);

create trigger publish_jobs_updated_at before update on public.publish_jobs
  for each row execute function private.set_updated_at();
create trigger publish_jobs_audit after insert or update or delete on public.publish_jobs
  for each row execute function private.audit_row();

alter table public.tasks
  add constraint tasks_publish_job_fk foreign key (publish_job_id)
  references public.publish_jobs (id) on delete set null;

create table public.publish_attempts (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.publish_jobs (id) on delete cascade,
  run_id uuid,
  step text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  outcome text not null check (outcome in ('erfolg', 'fehler', 'unklar', 'laufend')),
  http_status integer,
  request_summary jsonb,
  response jsonb,
  error_message text,
  actor_id uuid references public.profiles (id) on delete set null
);

create index publish_attempts_job_idx on public.publish_attempts (job_id, started_at desc);

-- -----------------------------------------------------------------------------
-- Hilfsfunktionen
-- -----------------------------------------------------------------------------
create or replace function private.fulfill_deliverable_for_content(p_content_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item public.content_items;
begin
  select * into v_item from public.content_items where id = p_content_id;
  if v_item.deliverable_id is null or v_item.published_at is null then
    return;
  end if;
  update public.deliverables
     set status = 'erbracht',
         fulfilled_at = v_item.published_at,
         evidence_url = coalesce(evidence_url, v_item.published_url),
         fulfillment_note = coalesce(fulfillment_note,
           format('Automatisch erfasst: veröffentlicht am %s (%s)',
                  to_char(v_item.published_at at time zone 'Europe/Berlin', 'DD.MM.YYYY HH24:MI'),
                  v_item.channel))
   where id = v_item.deliverable_id and status in ('offen', 'in_arbeit');
  if found then
    perform private.log_event('leistung_erbracht', 'deliverables', v_item.deliverable_id, v_item.dossier_id, null,
                              'Leistung automatisch als erbracht markiert (Veröffentlichungsnachweis)');
  end if;
end;
$$;

create or replace function private.publish_method_for(p_item public.content_items)
returns table (method text, reason text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_acc public.platform_accounts;
begin
  if p_item.channel = 'magazin' then
    return query select 'manuell'::text, 'Für das MICE Magazin ist keine Veröffentlichungsschnittstelle eingerichtet.'::text;
    return;
  end if;
  if not p_item.auto_publish then
    return query select 'manuell'::text, 'Automatische Veröffentlichung ist für diesen Beitrag nicht aktiviert.'::text;
    return;
  end if;
  select * into v_acc from public.platform_accounts where id = p_item.platform_account_id;
  if not found then
    return query select 'manuell'::text, 'Kein Zielkonto zugeordnet.'::text;
    return;
  end if;
  if v_acc.platform <> p_item.channel then
    return query select 'manuell'::text, 'Das Zielkonto passt nicht zum Kanal.'::text;
    return;
  end if;
  if not v_acc.api_enabled then
    return query select 'manuell'::text, 'API-Veröffentlichung ist für dieses Konto nicht aktiviert (Einrichtung erforderlich).'::text;
    return;
  end if;
  if v_acc.connection_status <> 'verbunden' then
    return query select 'manuell'::text, 'Das Konto ist nicht (mehr) verbunden.'::text;
    return;
  end if;
  if not exists (
    select 1 from public.format_rules r
     where r.channel = p_item.channel and r.post_format = p_item.post_format and r.is_active and r.api_supported
  ) then
    return query select 'manuell'::text, 'Dieses Format wird per API nicht unterstützt.'::text;
    return;
  end if;
  return query select 'api'::text, null::text;
end;
$$;

create or replace function private.sync_publish_job(p_content_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item public.content_items;
  v_job public.publish_jobs;
  v_method text;
  v_reason text;
  v_version uuid;
  v_task_key text;
  v_owner uuid;
  v_channel_label text;
begin
  select * into v_item from public.content_items where id = p_content_id;
  if v_item.status = 'veroeffentlicht' then
    return null;
  end if;
  select m.method, m.reason into v_method, v_reason from private.publish_method_for(v_item) m;
  v_version := private.ensure_version(p_content_id, 'veroeffentlichung');

  select * into v_job from public.publish_jobs
   where content_item_id = p_content_id
     and status in ('geplant', 'in_bearbeitung', 'wartet_auf_plattform', 'unklar', 'manuell_offen', 'fehlgeschlagen')
   for update;

  if found and v_job.status in ('in_bearbeitung', 'wartet_auf_plattform', 'unklar') then
    raise exception 'Für diesen Inhalt läuft bereits eine Veröffentlichung oder ihr Ergebnis ist unklar. Bitte zuerst klären.'
      using errcode = 'P0001';
  end if;

  if found then
    update public.publish_jobs
       set scheduled_at = v_item.scheduled_at,
           method = v_method,
           status = case when v_method = 'api' then 'geplant' else 'manuell_offen' end,
           platform_account_id = v_item.platform_account_id,
           content_version_id = v_version,
           manual_reason = v_reason,
           last_error = case when status = 'fehlgeschlagen' then last_error else null end,
           locked_at = null,
           locked_by = null
     where id = v_job.id
    returning * into v_job;
  else
    insert into public.publish_jobs (content_item_id, dossier_id, content_version_id, channel, platform_account_id,
                                     method, status, scheduled_at, manual_reason, created_by)
    values (p_content_id, v_item.dossier_id, v_version, v_item.channel, v_item.platform_account_id, v_method,
            case when v_method = 'api' then 'geplant' else 'manuell_offen' end, v_item.scheduled_at, v_reason, auth.uid())
    returning * into v_job;
  end if;

  v_task_key := 'manuell:' || v_job.id::text;
  if v_method = 'manuell' then
    select coalesce(v_item.assignee_id, d.owner_id) into v_owner from public.dossiers d where d.id = v_item.dossier_id;
    v_channel_label := case v_item.channel when 'magazin' then 'MICE Magazin' when 'instagram' then 'Instagram'
                                             when 'facebook' then 'Facebook' else 'LinkedIn' end;
    perform private.ensure_task(v_task_key, 'Manuell veröffentlichen (' || v_channel_label || '): ' || v_item.title,
                                'manuelle_veroeffentlichung', v_owner,
                                (v_item.scheduled_at at time zone 'Europe/Berlin')::date,
                                v_item.dossier_id, p_content_id, v_reason, 'offen', 'hoch', v_job.id);
    update public.tasks
       set due_date = (v_item.scheduled_at at time zone 'Europe/Berlin')::date,
           status = case when status in ('erledigt', 'abgebrochen') then 'offen' else status end,
           description = v_reason
     where auto_key = v_task_key;
  else
    update public.tasks set status = 'abgebrochen'
     where auto_key = v_task_key and status not in ('erledigt', 'abgebrochen');
  end if;

  perform private.close_tasks('terminierung', v_item.dossier_id, p_content_id);
  return v_job.id;
end;
$$;

create or replace function private.cancel_open_jobs(p_content_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.publish_jobs;
begin
  for v_job in
    update public.publish_jobs
       set status = 'abgebrochen', cancel_reason = p_reason, locked_at = null, locked_by = null
     where content_item_id = p_content_id and status in ('geplant', 'manuell_offen', 'fehlgeschlagen')
    returning *
  loop
    update public.tasks set status = 'abgebrochen'
     where auto_key = 'manuell:' || v_job.id::text and status not in ('erledigt', 'abgebrochen');
  end loop;
end;
$$;

-- Freigabe durch Inhaltsänderung ungültig → offene Aufträge stoppen & informieren
create or replace function private.content_items_after_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
begin
  if new.approval_invalidated_at is distinct from old.approval_invalidated_at and new.approval_invalidated_at is not null then
    perform private.cancel_open_jobs(new.id, 'Inhalt nach Freigabe geändert – Freigabe gilt nicht für die neue Fassung.');
    select coalesce(new.assignee_id, d.owner_id) into v_owner from public.dossiers d where d.id = new.dossier_id;
    perform private.log_event('freigabe_ungueltig', 'content_items', new.id, new.dossier_id, null,
                              'Inhalt nach Prüfung/Freigabe geändert – erneute Prüfung und Freigabe erforderlich');
    perform private.notify(v_owner, 'freigabe_ungueltig', 'Freigabe ungültig: ' || new.title,
                           'Der Inhalt wurde nach der Freigabe geändert. Bitte erneut prüfen und freigeben lassen.',
                           '/beitraege/' || new.dossier_id::text || '/inhalte/' || new.id::text,
                           'freigabe_ungueltig:' || new.id::text || ':' || extract(epoch from new.approval_invalidated_at)::bigint::text);
  end if;
  if new.schedule_status = 'verbindlich' and old.schedule_status = 'verbindlich' then
    if new.scheduled_at is distinct from old.scheduled_at then
      -- Termin verschoben → Auftrag & Aufgabe nachziehen
      perform private.sync_publish_job(new.id);
    elsif (new.auto_publish is distinct from old.auto_publish
           or new.platform_account_id is distinct from old.platform_account_id)
          and not exists (select 1 from public.publish_jobs j
                           where j.content_item_id = new.id
                             and j.status in ('in_bearbeitung', 'wartet_auf_plattform', 'unklar')) then
      -- z. B. API-Veröffentlichung abgeschaltet → Auftrag wird manuell, mit Aufgabe
      -- (laufende Versuche bricht der Hintergrundprozess selbst ab und stellt auf manuell um)
      perform private.sync_publish_job(new.id);
    end if;
  elsif old.schedule_status = 'verbindlich' then
    -- Nicht mehr verbindlich (z. B. archiviert oder Freigabe entzogen) → offene Aufträge und Aufgaben stoppen
    perform private.cancel_open_jobs(new.id, 'Termin ist nicht mehr verbindlich.');
  end if;
  -- Archiviert → offene Aufgaben zu diesem Inhalt sind hinfällig
  if new.status = 'archiviert' and old.status is distinct from 'archiviert' then
    update public.tasks set status = 'abgebrochen'
     where content_item_id = new.id and status in ('offen', 'in_arbeit', 'wartet_auf_kunde');
  end if;
  return null;
end;
$$;

create trigger content_items_after_update after update on public.content_items
  for each row execute function private.content_items_after_update();

-- -----------------------------------------------------------------------------
-- Planung
-- -----------------------------------------------------------------------------
create or replace function public.schedule_content(
  p_content_id uuid,
  p_mode text,
  p_scheduled_at timestamptz,
  p_auto_publish boolean default false,
  p_platform_account_id uuid default null,
  p_window_start date default null,
  p_window_end date default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item public.content_items;
  v_job_id uuid;
  v_job public.publish_jobs;
begin
  if p_mode not in ('ohne_termin', 'vorlaeufig', 'verbindlich') then
    raise exception 'Ungültiger Planungsstatus.' using errcode = '22023';
  end if;
  select * into v_item from public.content_items where id = p_content_id;
  if not found then
    raise exception 'Inhalt nicht gefunden.' using errcode = 'P0002';
  end if;
  if not (private.is_editor() or private.mitarbeit_can_access_dossier(v_item.dossier_id)) then
    raise exception 'Keine Berechtigung.' using errcode = '42501';
  end if;
  if v_item.status = 'veroeffentlicht' then
    raise exception 'Der Inhalt ist bereits veröffentlicht.' using errcode = 'P0001';
  end if;
  if p_mode <> 'ohne_termin' and p_scheduled_at is null then
    raise exception 'Bitte einen Termin angeben.' using errcode = '22023';
  end if;
  if p_mode = 'verbindlich' and p_scheduled_at < now() - interval '5 minutes' then
    raise exception 'Ein verbindlicher Termin darf nicht in der Vergangenheit liegen.' using errcode = '22023';
  end if;

  if exists (select 1 from public.publish_jobs j where j.content_item_id = p_content_id
              and j.status in ('in_bearbeitung', 'wartet_auf_plattform', 'unklar')) then
    raise exception 'Für diesen Inhalt läuft bereits eine Veröffentlichung oder ihr Ergebnis ist unklar.' using errcode = 'P0001';
  end if;

  update public.content_items
     set schedule_status = p_mode,
         scheduled_at = p_scheduled_at,
         auto_publish = (p_mode = 'verbindlich' and coalesce(p_auto_publish, false)),
         platform_account_id = coalesce(p_platform_account_id, platform_account_id),
         window_start = coalesce(p_window_start, window_start),
         window_end = coalesce(p_window_end, window_end)
   where id = p_content_id
  returning * into v_item;

  if p_mode = 'verbindlich' then
    v_job_id := private.sync_publish_job(p_content_id);
    select * into v_job from public.publish_jobs where id = v_job_id;
    perform private.log_event('verbindlich_eingeplant', 'content_items', p_content_id, v_item.dossier_id, null,
                              format('Verbindlich eingeplant für %s (%s)',
                                     to_char(p_scheduled_at at time zone 'Europe/Berlin', 'DD.MM.YYYY HH24:MI'),
                                     case when v_job.method = 'api' then 'automatische Veröffentlichung' else 'manuelle Veröffentlichung' end));
  else
    perform private.cancel_open_jobs(p_content_id, 'Termin ist nicht mehr verbindlich.');
  end if;

  return jsonb_build_object('job_id', v_job.id, 'method', v_job.method, 'manual_reason', v_job.manual_reason,
                            'schedule_status', v_item.schedule_status);
end;
$$;

-- -----------------------------------------------------------------------------
-- Hintergrundprozess (nur Service-Rolle)
-- -----------------------------------------------------------------------------
create or replace function public.claim_due_publish_jobs(p_run_id uuid, p_limit integer default 5)
returns setof public.publish_jobs
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  with due as (
    select j.id
      from public.publish_jobs j
     where j.method = 'api'
       and ((j.status = 'geplant' and j.scheduled_at <= now())
            or (j.status = 'wartet_auf_plattform' and coalesce(j.next_check_at, now()) <= now()))
     order by j.scheduled_at
     for update skip locked
     limit greatest(1, least(p_limit, 25))
  )
  update public.publish_jobs j
     set status = 'in_bearbeitung',
         locked_at = now(),
         locked_by = p_run_id,
         attempt_count = j.attempt_count + 1
    from due
   where j.id = due.id
  returning j.*;
end;
$$;

create or replace function public.mark_stale_publish_jobs(p_minutes integer default 15)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  update public.publish_jobs
     set status = 'unklar',
         last_error = 'Der Veröffentlichungsversuch wurde nicht sauber abgeschlossen. Bitte auf der Plattform prüfen, ob der Beitrag erschienen ist.',
         locked_by = null
   where status = 'in_bearbeitung' and locked_at < now() - make_interval(mins => p_minutes);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.record_publish_attempt(
  p_job_id uuid,
  p_run_id uuid,
  p_step text,
  p_outcome text,
  p_http_status integer,
  p_request_summary jsonb,
  p_response jsonb,
  p_error text
)
returns uuid
language sql
security definer
set search_path = ''
as $$
  insert into public.publish_attempts (job_id, run_id, step, outcome, http_status, request_summary, response,
                                       error_message, finished_at)
  values (p_job_id, p_run_id, p_step, p_outcome, p_http_status, p_request_summary, p_response, left(p_error, 4000), now())
  returning id
$$;

create or replace function public.finish_publish_job(
  p_job_id uuid,
  p_run_id uuid,
  p_outcome text,
  p_external_post_id text default null,
  p_published_url text default null,
  p_published_at timestamptz default null,
  p_container_id text default null,
  p_next_check_at timestamptz default null,
  p_error text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.publish_jobs;
  v_item public.content_items;
  v_owner uuid;
begin
  select * into v_job from public.publish_jobs where id = p_job_id for update;
  if not found or v_job.status <> 'in_bearbeitung' or v_job.locked_by is distinct from p_run_id then
    return false;
  end if;
  select * into v_item from public.content_items where id = v_job.content_item_id;
  select coalesce(v_item.assignee_id, d.owner_id) into v_owner from public.dossiers d where d.id = v_job.dossier_id;
  perform set_config('app.actor_label', 'System (Veröffentlichung)', true);

  if p_outcome = 'veroeffentlicht' then
    if p_external_post_id is null and p_published_url is null then
      raise exception 'Erfolg ohne Plattform-ID oder Link kann nicht als veröffentlicht gelten.' using errcode = 'P0001';
    end if;
    update public.publish_jobs
       set status = 'veroeffentlicht', external_post_id = p_external_post_id, published_url = p_published_url,
           published_at = coalesce(p_published_at, now()), last_error = null, locked_by = null,
           external_container_id = coalesce(p_container_id, external_container_id)
     where id = p_job_id;
    update public.content_items
       set status = 'veroeffentlicht', published_at = coalesce(p_published_at, now()), published_url = p_published_url,
           external_post_id = p_external_post_id, publish_method = 'api'
     where id = v_job.content_item_id;
    perform private.fulfill_deliverable_for_content(v_job.content_item_id);
    perform private.notify(v_owner, 'veroeffentlicht', 'Veröffentlicht: ' || v_item.title, p_published_url,
                           '/beitraege/' || v_job.dossier_id::text || '/inhalte/' || v_job.content_item_id::text,
                           'veroeffentlicht:' || p_job_id::text);
    perform private.log_event('veroeffentlicht', 'content_items', v_job.content_item_id, v_job.dossier_id, null,
                              format('Per API veröffentlicht (%s)', coalesce(p_published_url, p_external_post_id)));
  elsif p_outcome = 'wartet_auf_plattform' then
    update public.publish_jobs
       set status = 'wartet_auf_plattform', external_container_id = coalesce(p_container_id, external_container_id),
           next_check_at = coalesce(p_next_check_at, now() + interval '1 minute'), locked_by = null
     where id = p_job_id;
  elsif p_outcome = 'fehlgeschlagen' then
    update public.publish_jobs
       set status = 'fehlgeschlagen', last_error = left(p_error, 4000), locked_by = null,
           external_container_id = coalesce(p_container_id, external_container_id)
     where id = p_job_id;
    perform private.ensure_task('publish_fehler:' || p_job_id::text || ':' || v_job.attempt_count::text,
                                'Veröffentlichung fehlgeschlagen: ' || v_item.title, 'manuelle_veroeffentlichung',
                                v_owner, (now() at time zone 'Europe/Berlin')::date, v_job.dossier_id, v_job.content_item_id,
                                left(p_error, 2000), 'offen', 'dringend', p_job_id);
    perform private.notify(v_owner, 'veroeffentlichung_fehlgeschlagen', 'Veröffentlichung fehlgeschlagen: ' || v_item.title,
                           left(p_error, 300), '/veroeffentlichungen?auftrag=' || p_job_id::text,
                           'publish_fehler:' || p_job_id::text || ':' || v_job.attempt_count::text);
    perform private.log_event('veroeffentlichung_fehlgeschlagen', 'publish_jobs', p_job_id, v_job.dossier_id, null,
                              'Veröffentlichung fehlgeschlagen', null, left(p_error, 1000));
  elsif p_outcome = 'unklar' then
    update public.publish_jobs
       set status = 'unklar', last_error = left(p_error, 4000), locked_by = null,
           external_container_id = coalesce(p_container_id, external_container_id)
     where id = p_job_id;
    perform private.notify(v_owner, 'veroeffentlichung_unklar', 'Veröffentlichung prüfen: ' || v_item.title,
                           left(p_error, 300), '/veroeffentlichungen?auftrag=' || p_job_id::text,
                           'publish_unklar:' || p_job_id::text || ':' || v_job.attempt_count::text);
    perform private.log_event('veroeffentlichung_unklar', 'publish_jobs', p_job_id, v_job.dossier_id, null,
                              'Ergebnis der Veröffentlichung unklar – manuelle Prüfung nötig', null, left(p_error, 1000));
  elsif p_outcome = 'abgebrochen' then
    update public.publish_jobs
       set status = 'abgebrochen', cancel_reason = left(p_error, 2000), locked_by = null
     where id = p_job_id;
    perform private.log_event('veroeffentlichung_abgebrochen', 'publish_jobs', p_job_id, v_job.dossier_id, null,
                              'Veröffentlichung vor dem Versand abgebrochen', null, left(p_error, 1000));
    -- Weiterhin verbindlich und freigegeben (z. B. API-Veröffentlichung inzwischen abgeschaltet)?
    -- Dann nicht stillschweigend liegen lassen: neuer Auftrag, ggf. manuell mit Aufgabe.
    if v_item.id is not null and v_item.status <> 'veroeffentlicht'
       and v_item.schedule_status = 'verbindlich' and v_item.approvals_complete then
      perform private.sync_publish_job(v_item.id);
    end if;
  else
    raise exception 'Unbekanntes Ergebnis: %', p_outcome using errcode = '22023';
  end if;
  return true;
end;
$$;

-- -----------------------------------------------------------------------------
-- Manuelle Veröffentlichung & gezielte Wiederholung
-- -----------------------------------------------------------------------------
create or replace function public.confirm_manual_publication(
  p_content_id uuid,
  p_url text,
  p_published_at timestamptz,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item public.content_items;
  v_job public.publish_jobs;
begin
  select * into v_item from public.content_items where id = p_content_id for update;
  if not found then
    raise exception 'Inhalt nicht gefunden.' using errcode = 'P0002';
  end if;
  if not (private.is_editor() or private.mitarbeit_can_access_dossier(v_item.dossier_id)) then
    raise exception 'Keine Berechtigung.' using errcode = '42501';
  end if;
  if v_item.status = 'veroeffentlicht' then
    raise exception 'Der Inhalt ist bereits als veröffentlicht erfasst.' using errcode = 'P0001';
  end if;
  if coalesce(p_url, '') !~* '^https?://[^\s]+$' then
    raise exception 'Bitte den vollständigen Link zur Veröffentlichung angeben (https://…).' using errcode = '22023';
  end if;
  if p_published_at is null or p_published_at > now() + interval '10 minutes' then
    raise exception 'Der Veröffentlichungszeitpunkt darf nicht in der Zukunft liegen.' using errcode = '22023';
  end if;
  if exists (select 1 from public.publish_jobs j where j.content_item_id = p_content_id and j.status = 'in_bearbeitung') then
    raise exception 'Die automatische Veröffentlichung läuft gerade. Bitte das Ergebnis abwarten und danach erneut prüfen.'
      using errcode = 'P0001';
  end if;

  select * into v_job from public.publish_jobs
   where content_item_id = p_content_id
     and status in ('geplant', 'manuell_offen', 'fehlgeschlagen', 'unklar', 'wartet_auf_plattform')
   for update;

  if found then
    update public.publish_jobs
       set status = 'veroeffentlicht', published_url = p_url, published_at = p_published_at,
           confirmed_by = auth.uid(), confirmed_at = now(), locked_by = null
     where id = v_job.id
    returning * into v_job;
  else
    insert into public.publish_jobs (content_item_id, dossier_id, content_version_id, channel, platform_account_id,
                                     method, status, scheduled_at, published_url, published_at, confirmed_by, confirmed_at,
                                     manual_reason, created_by)
    values (p_content_id, v_item.dossier_id,
            (select v.id from public.content_versions v where v.content_item_id = p_content_id and v.fingerprint = v_item.fingerprint
              order by v.version_no desc limit 1),
            v_item.channel, v_item.platform_account_id, 'manuell', 'veroeffentlicht',
            coalesce(v_item.scheduled_at, p_published_at), p_url, p_published_at, auth.uid(), now(),
            'Manuell veröffentlicht und bestätigt', auth.uid())
    returning * into v_job;
  end if;

  insert into public.publish_attempts (job_id, step, outcome, request_summary, finished_at, actor_id)
  values (v_job.id, 'manuelle_bestaetigung', 'erfolg', jsonb_build_object('url', p_url, 'note', p_note), now(), auth.uid());

  update public.content_items
     set status = 'veroeffentlicht', published_at = p_published_at, published_url = p_url,
         publish_method = case when v_job.method = 'api' and v_job.external_post_id is not null then 'api' else 'manuell' end
   where id = p_content_id;

  update public.tasks set status = 'erledigt'
   where content_item_id = p_content_id and task_type = 'manuelle_veroeffentlichung'
     and status not in ('erledigt', 'abgebrochen');

  if not v_item.approvals_complete then
    perform private.log_event('veroeffentlicht_ohne_freigabe', 'content_items', p_content_id, v_item.dossier_id, null,
                              'Achtung: Veröffentlichung bestätigt, obwohl nicht alle erforderlichen Freigaben für die aktuelle Fassung vorlagen');
  end if;
  perform private.fulfill_deliverable_for_content(p_content_id);
  perform private.log_event('veroeffentlichung_bestaetigt', 'content_items', p_content_id, v_item.dossier_id, null,
                            format('Veröffentlichung bestätigt: %s (%s)', p_url,
                                   to_char(p_published_at at time zone 'Europe/Berlin', 'DD.MM.YYYY HH24:MI')),
                            null, p_note);
  return v_job.id;
end;
$$;

create or replace function public.retry_publish_job(p_job_id uuid, p_confirm_not_published boolean default false)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.publish_jobs;
  v_item public.content_items;
begin
  if not private.is_editor() then
    raise exception 'Keine Berechtigung.' using errcode = '42501';
  end if;
  select * into v_job from public.publish_jobs where id = p_job_id for update;
  if not found then
    raise exception 'Auftrag nicht gefunden.' using errcode = 'P0002';
  end if;
  if v_job.status = 'unklar' and not coalesce(p_confirm_not_published, false) then
    raise exception 'Bitte zuerst auf der Plattform prüfen und bestätigen, dass der Beitrag NICHT erschienen ist.' using errcode = 'P0001';
  end if;
  if v_job.status not in ('fehlgeschlagen', 'unklar') then
    raise exception 'Nur fehlgeschlagene oder unklare Aufträge können erneut versucht werden.' using errcode = 'P0001';
  end if;
  select * into v_item from public.content_items where id = v_job.content_item_id;
  if not v_item.approvals_complete or v_item.schedule_status <> 'verbindlich' then
    raise exception 'Erneuter Versuch nicht möglich: Freigaben oder verbindliche Planung fehlen.' using errcode = 'P0001';
  end if;
  if v_job.method = 'api' and not v_item.auto_publish then
    raise exception 'Automatische Veröffentlichung ist für diesen Inhalt nicht mehr aktiviert.' using errcode = 'P0001';
  end if;

  update public.publish_jobs
     set status = case when method = 'api' then 'geplant' else 'manuell_offen' end,
         scheduled_at = greatest(now(), least(scheduled_at, now())),
         locked_at = null, locked_by = null, last_error = null,
         external_container_id = case when v_job.status = 'unklar' then null else external_container_id end
   where id = p_job_id;
  perform private.log_event('veroeffentlichung_wiederholt', 'publish_jobs', p_job_id, v_job.dossier_id, null,
                            case when v_job.status = 'unklar'
                                 then 'Erneuter Versuch nach Prüfung (Beitrag war nicht erschienen)'
                                 else 'Erneuter Veröffentlichungsversuch eingeplant' end);
end;
$$;

create or replace function public.cancel_publish_job(p_job_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.publish_jobs;
begin
  if not private.is_editor() then
    raise exception 'Keine Berechtigung.' using errcode = '42501';
  end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'Bitte einen Grund angeben.' using errcode = '22023';
  end if;
  update public.publish_jobs
     set status = 'abgebrochen', cancel_reason = p_reason, locked_by = null
   where id = p_job_id and status in ('geplant', 'manuell_offen', 'fehlgeschlagen', 'unklar')
  returning * into v_job;
  if not found then
    raise exception 'Auftrag kann in diesem Status nicht abgebrochen werden.' using errcode = 'P0001';
  end if;
  update public.tasks set status = 'abgebrochen'
   where publish_job_id = p_job_id and status not in ('erledigt', 'abgebrochen');
  update public.content_items
     set schedule_status = 'vorlaeufig', auto_publish = false
   where id = v_job.content_item_id and schedule_status = 'verbindlich';
  perform private.log_event('veroeffentlichung_abgebrochen', 'publish_jobs', p_job_id, v_job.dossier_id, null,
                            'Veröffentlichungsauftrag abgebrochen', null, p_reason);
end;
$$;
