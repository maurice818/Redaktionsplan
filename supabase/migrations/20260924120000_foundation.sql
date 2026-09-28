-- =============================================================================
-- MEET GERMANY Redaktionszentrale – Grundlagen
-- Schemas, Profile & Rollen, Rollen-Hilfsfunktionen, Audit-Log, Einstellungen,
-- Benachrichtigungen und gespeicherte Filter.
--
-- Konventionen
--  * Zeitpunkte: timestamptz (UTC gespeichert, Anzeige in Europe/Berlin)
--  * Kalendertage (Fälligkeiten, Vertragsdaten): date (Berliner Kalendertag)
--  * Statuswerte: text + CHECK (leicht erweiterbar), Anzeige-Labels im Frontend
--  * Hilfsfunktionen für RLS liegen im nicht per API exponierten Schema "private"
-- =============================================================================

create schema if not exists private;
grant usage on schema private to authenticated, service_role;

-- Funktionen sollen nie automatisch für anon/public ausführbar sein.
alter default privileges in schema public revoke execute on functions from public;
alter default privileges in schema private revoke execute on functions from public;

-- -----------------------------------------------------------------------------
-- Allgemeine Trigger-Funktionen
-- -----------------------------------------------------------------------------
create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Profile & Rollen
-- -----------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null default '',
  full_name text not null default '',
  role text not null default 'mitarbeit'
    check (role in ('admin', 'redaktion', 'freigabe', 'mitarbeit')),
  -- Neue Konten sind inaktiv, bis ein Admin sie freischaltet (Einladungsablauf).
  is_active boolean not null default false,
  job_title text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is 'Interne Nutzer der Redaktionszentrale (1:1 zu auth.users).';
comment on column public.profiles.role is 'admin | redaktion | freigabe (Leitung) | mitarbeit';

create trigger profiles_updated_at before update on public.profiles
  for each row execute function private.set_updated_at();

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'full_name', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

create or replace function private.handle_user_email_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email is distinct from old.email then
    update public.profiles set email = coalesce(new.email, '') where id = new.id;
  end if;
  return new;
end;
$$;

create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row execute function private.handle_user_email_change();

-- Rolle des aktuellen Nutzers (nur aktive Profile)
create or replace function private.current_role_key()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select p.role
  from public.profiles p
  where p.id = auth.uid() and p.is_active
$$;

create or replace function private.is_internal()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.current_role_key() is not null
$$;

create or replace function private.has_role(variadic p_roles text[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(private.current_role_key() = any (p_roles), false)
$$;

-- Admin, Redaktion, Freigabe/Leitung dürfen redaktionelle Daten bearbeiten.
create or replace function private.is_editor()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_role('admin', 'redaktion', 'freigabe')
$$;

-- Interne Freigaben und verbindliche Terminierung: nur Admin und Freigabe/Leitung.
create or replace function private.is_approver()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_role('admin', 'freigabe')
$$;

create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_role('admin')
$$;

-- Schützt Rollen-/Aktivierungsfelder vor Selbstbearbeitung und verhindert,
-- dass der letzte aktive Admin entfernt wird.
create or replace function private.protect_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is not null and not private.is_admin() then
    if new.role is distinct from old.role
       or new.is_active is distinct from old.is_active
       or new.email is distinct from old.email then
      raise exception 'Nur Admins dürfen Rolle, Aktivierung oder E-Mail ändern.'
        using errcode = '42501';
    end if;
  end if;

  if old.role = 'admin' and old.is_active
     and (new.role <> 'admin' or not new.is_active) then
    if not exists (
      select 1 from public.profiles p
      where p.id <> old.id and p.role = 'admin' and p.is_active
    ) then
      raise exception 'Der letzte aktive Admin kann nicht entfernt werden.'
        using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

create trigger profiles_protect before update on public.profiles
  for each row execute function private.protect_profile();

alter table public.profiles enable row level security;

create policy "Profile: interne Nutzer lesen"
  on public.profiles for select to authenticated
  using ((select private.is_internal()) or id = (select auth.uid()));

create policy "Profile: eigenes Profil oder Admin bearbeitet"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()) or (select private.is_admin()))
  with check (id = (select auth.uid()) or (select private.is_admin()));

-- -----------------------------------------------------------------------------
-- Audit-Log (chronologische Historie, unveränderlich)
-- -----------------------------------------------------------------------------
create table public.audit_log (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  actor_id uuid references public.profiles (id) on delete set null,
  actor_label text,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  dossier_id uuid,
  client_id uuid,
  summary text,
  changes jsonb,
  reason text
);

comment on table public.audit_log is 'Unveränderliches Änderungsprotokoll. Einträge entstehen ausschließlich über Trigger und Datenbankfunktionen.';

create index audit_log_dossier_idx on public.audit_log (dossier_id, occurred_at desc);
create index audit_log_client_idx on public.audit_log (client_id, occurred_at desc);
create index audit_log_entity_idx on public.audit_log (entity_type, entity_id, occurred_at desc);
create index audit_log_time_idx on public.audit_log (occurred_at desc);

create or replace function private.actor_label()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    nullif(current_setting('app.actor_label', true), ''),
    (select nullif(p.full_name, '') from public.profiles p where p.id = auth.uid()),
    (select p.email from public.profiles p where p.id = auth.uid()),
    'System'
  )
$$;

-- Fachliches Ereignis protokollieren (z. B. "Vorschau versendet").
create or replace function private.log_event(
  p_action text,
  p_entity_type text,
  p_entity_id uuid,
  p_dossier_id uuid,
  p_client_id uuid,
  p_summary text,
  p_changes jsonb default null,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.audit_log (actor_id, actor_label, action, entity_type, entity_id, dossier_id, client_id, summary, changes, reason)
  values (
    auth.uid(),
    private.actor_label(),
    p_action,
    p_entity_type,
    p_entity_id,
    p_dossier_id,
    p_client_id,
    p_summary,
    p_changes,
    coalesce(p_reason, nullif(current_setting('app.change_reason', true), ''))
  );
end;
$$;

-- Generischer Audit-Trigger. Große Textfelder werden nur als "geändert" markiert.
create or replace function private.audit_row()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_new jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end;
  v_old jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end;
  v_row jsonb := coalesce(v_new, v_old);
  v_changes jsonb := '{}'::jsonb;
  v_key text;
  v_dossier uuid;
  v_client uuid;
  v_ignored text[] := array['updated_at', 'fingerprint', 'internal_ok', 'client_ok', 'approvals_complete',
                            'last_viewed_at', 'token_hash', 'token_encrypted', 'locked_at', 'locked_by'];
begin
  if tg_op = 'UPDATE' then
    for v_key in select jsonb_object_keys(v_new) loop
      if v_key = any (v_ignored) then
        continue;
      end if;
      if (v_new -> v_key) is distinct from (v_old -> v_key) then
        if length(coalesce(v_new ->> v_key, '')) > 400 or length(coalesce(v_old ->> v_key, '')) > 400 then
          v_changes := v_changes || jsonb_build_object(v_key, jsonb_build_object('geaendert', true));
        else
          v_changes := v_changes || jsonb_build_object(v_key, jsonb_build_array(v_old -> v_key, v_new -> v_key));
        end if;
      end if;
    end loop;
    if v_changes = '{}'::jsonb then
      return null;
    end if;
  elsif tg_op = 'INSERT' then
    v_changes := null;
  end if;

  v_dossier := case
    when tg_table_name = 'dossiers' then (v_row ->> 'id')::uuid
    when v_row ? 'dossier_id' then (v_row ->> 'dossier_id')::uuid
    else null
  end;
  v_client := case
    when tg_table_name = 'clients' then (v_row ->> 'id')::uuid
    when v_row ? 'client_id' then (v_row ->> 'client_id')::uuid
    else null
  end;

  insert into public.audit_log (actor_id, actor_label, action, entity_type, entity_id, dossier_id, client_id, changes, reason, summary)
  values (
    auth.uid(),
    private.actor_label(),
    lower(tg_op),
    tg_table_name,
    (v_row ->> 'id')::uuid,
    v_dossier,
    v_client,
    v_changes,
    nullif(current_setting('app.change_reason', true), ''),
    case
      when v_row ? 'title' then v_row ->> 'title'
      when v_row ? 'name' then v_row ->> 'name'
      else null
    end
  );
  return null;
end;
$$;

alter table public.audit_log enable row level security;
-- Leserechte werden in der Redaktions-Migration ergänzt (Zugriff je Beitragsakte).

-- Unveränderlichkeit technisch absichern. Einzige Ausnahme: Wird ein Nutzerkonto
-- gelöscht, setzt die Datenbank Verweise auf diese Person auf NULL (ON DELETE SET NULL);
-- der Name bleibt im Protokoll als actor_label erhalten. Direkte Änderungen verhindert
-- zusätzlich RLS (keine Update-Policies auf diesen Tabellen).
create or replace function private.prevent_modification()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_new jsonb;
  v_old jsonb;
  v_key text;
begin
  if tg_op = 'UPDATE' then
    v_new := to_jsonb(new);
    v_old := to_jsonb(old);
    for v_key in select jsonb_object_keys(v_new) loop
      if (v_new -> v_key) is distinct from (v_old -> v_key)
         and not (v_key = any (array['actor_id', 'created_by', 'decided_by']) and jsonb_typeof(v_new -> v_key) = 'null') then
        raise exception 'Datensätze in % sind unveränderlich.', tg_table_name using errcode = '42501';
      end if;
    end loop;
    return new;
  end if;
  raise exception 'Datensätze in % sind unveränderlich.', tg_table_name using errcode = '42501';
end;
$$;

create trigger audit_log_immutable before update or delete on public.audit_log
  for each row execute function private.prevent_modification();

-- -----------------------------------------------------------------------------
-- Einstellungen (Schlüssel/Wert)
-- -----------------------------------------------------------------------------
create table public.app_settings (
  key text primary key,
  value jsonb not null,
  label text,
  description text,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null
);

create trigger app_settings_updated_at before update on public.app_settings
  for each row execute function private.set_updated_at();

alter table public.app_settings enable row level security;

create policy "Einstellungen: intern lesen" on public.app_settings for select to authenticated
  using ((select private.is_internal()));
create policy "Einstellungen: Admin schreibt" on public.app_settings for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

create or replace function private.setting_int(p_key text, p_default integer)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select (s.value #>> '{}')::integer from public.app_settings s where s.key = p_key), p_default)
$$;

-- -----------------------------------------------------------------------------
-- Benachrichtigungen (in der App)
-- -----------------------------------------------------------------------------
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null,
  title text not null,
  body text,
  link text,
  dedupe_key text,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  unique (recipient_id, dedupe_key)
);

create index notifications_recipient_idx on public.notifications (recipient_id, read_at, created_at desc);

alter table public.notifications enable row level security;

create policy "Benachrichtigungen: eigene lesen" on public.notifications for select to authenticated
  using (recipient_id = (select auth.uid()));
create policy "Benachrichtigungen: eigene als gelesen markieren" on public.notifications for update to authenticated
  using (recipient_id = (select auth.uid())) with check (recipient_id = (select auth.uid()));
create policy "Benachrichtigungen: eigene löschen" on public.notifications for delete to authenticated
  using (recipient_id = (select auth.uid()));

create or replace function private.notify(
  p_recipient uuid,
  p_kind text,
  p_title text,
  p_body text,
  p_link text,
  p_dedupe_key text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_recipient is null then
    return;
  end if;
  insert into public.notifications (recipient_id, kind, title, body, link, dedupe_key)
  select p_recipient, p_kind, p_title, p_body, p_link, p_dedupe_key
  where exists (select 1 from public.profiles p where p.id = p_recipient and p.is_active)
  on conflict (recipient_id, dedupe_key) do nothing;
end;
$$;

create or replace function private.notify_roles(
  p_roles text[],
  p_kind text,
  p_title text,
  p_body text,
  p_link text,
  p_dedupe_key text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  for v_id in select p.id from public.profiles p where p.is_active and p.role = any (p_roles) loop
    perform private.notify(v_id, p_kind, p_title, p_body, p_link, p_dedupe_key);
  end loop;
end;
$$;

-- -----------------------------------------------------------------------------
-- Gespeicherte Filter
-- -----------------------------------------------------------------------------
create table public.saved_filters (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  view text not null,
  name text not null,
  params jsonb not null default '{}'::jsonb,
  is_shared boolean not null default false,
  created_at timestamptz not null default now()
);

create index saved_filters_owner_idx on public.saved_filters (owner_id, view);

alter table public.saved_filters enable row level security;

create policy "Filter: eigene und geteilte lesen" on public.saved_filters for select to authenticated
  using ((select private.is_internal()) and (owner_id = (select auth.uid()) or is_shared));
create policy "Filter: eigene anlegen" on public.saved_filters for insert to authenticated
  with check ((select private.is_internal()) and owner_id = (select auth.uid()));
create policy "Filter: eigene ändern" on public.saved_filters for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "Filter: eigene löschen" on public.saved_filters for delete to authenticated
  using (owner_id = (select auth.uid()));
