-- =============================================================================
-- E-Mail-Vorlagen, E-Mail-Protokoll, Erinnerungsregeln, Duplikatschutz für
-- Erinnerungen und Protokoll der Hintergrundläufe.
-- =============================================================================

create table public.email_templates (
  key text primary key,
  name text not null,
  description text,
  audience text not null check (audience in ('kunde', 'team')),
  subject text not null,
  body text not null,
  placeholders text[] not null default '{}',
  is_active boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid() references public.profiles (id) on delete set null
);

create trigger email_templates_updated_at before update on public.email_templates
  for each row execute function private.set_updated_at();
create trigger email_templates_audit after update on public.email_templates
  for each row execute function private.audit_row();

-- Protokoll aller E-Mails. Der Link-Token wird nie im Klartext gespeichert.
create table public.email_events (
  id uuid primary key default gen_random_uuid(),
  template_key text,
  to_email text not null,
  to_name text,
  subject text not null,
  status text not null default 'ausstehend'
    check (status in ('ausstehend', 'versendet', 'fehlgeschlagen', 'nicht_konfiguriert')),
  provider text,
  provider_message_id text,
  error text,
  idempotency_key text unique,
  dossier_id uuid references public.dossiers (id) on delete set null,
  client_id uuid references public.clients (id) on delete set null,
  material_request_id uuid references public.material_requests (id) on delete set null,
  preview_id uuid references public.previews (id) on delete set null,
  task_id uuid references public.tasks (id) on delete set null,
  triggered_by text not null default 'manuell' check (triggered_by in ('manuell', 'erinnerung', 'system')),
  attempts integer not null default 1,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null
);

create index email_events_status_idx on public.email_events (status, created_at desc);
create index email_events_dossier_idx on public.email_events (dossier_id, created_at desc);

create table public.reminder_rules (
  key text primary key,
  name text not null,
  description text,
  is_active boolean not null default true,
  -- Bedeutung je Regel: Tage nach Versand bzw. Tage vor Termin/Vertragsjahresende
  days integer not null default 3 check (days >= 0),
  repeat_days integer check (repeat_days is null or repeat_days > 0),
  max_reminders integer not null default 1 check (max_reminders >= 1),
  notify_customer boolean not null default false,
  notify_team boolean not null default true,
  customer_template_key text references public.email_templates (key) on delete set null,
  team_template_key text references public.email_templates (key) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid() references public.profiles (id) on delete set null
);

create trigger reminder_rules_updated_at before update on public.reminder_rules
  for each row execute function private.set_updated_at();
create trigger reminder_rules_audit after update on public.reminder_rules
  for each row execute function private.audit_row();

-- Jede Erinnerung (Regel × Objekt × Nummer) wird genau einmal ausgelöst.
create table public.reminder_log (
  id uuid primary key default gen_random_uuid(),
  rule_key text not null,
  entity_id uuid not null,
  occurrence integer not null default 1,
  fired_at timestamptz not null default now(),
  run_id uuid,
  outcome jsonb,
  unique (rule_key, entity_id, occurrence)
);

create table public.job_runs (
  id uuid primary key default gen_random_uuid(),
  job text not null,
  trigger text not null default 'cron',
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'laeuft' check (status in ('laeuft', 'ok', 'fehler', 'uebersprungen')),
  summary jsonb,
  error text
);

create index job_runs_started_idx on public.job_runs (job, started_at desc);

create table public.job_locks (
  job text primary key,
  run_id uuid not null,
  locked_until timestamptz not null
);

alter table public.job_locks enable row level security;

-- Sperre für einen Hintergrundlauf (verhindert parallele Läufe bei doppeltem Cron-Aufruf).
create or replace function public.acquire_job_lock(p_job text, p_run_id uuid, p_ttl_seconds integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ok boolean;
begin
  insert into public.job_locks (job, run_id, locked_until)
  values (p_job, p_run_id, now() + make_interval(secs => p_ttl_seconds))
  on conflict (job) do update
     set run_id = excluded.run_id, locked_until = excluded.locked_until
   where public.job_locks.locked_until < now()
  returning true into v_ok;
  return coalesce(v_ok, false);
end;
$$;

create or replace function public.release_job_lock(p_job text, p_run_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.job_locks where job = p_job and run_id = p_run_id
$$;

-- Erinnerung reservieren: true nur beim ersten Aufruf für (Regel, Objekt, Nummer).
create or replace function public.claim_reminder(p_rule_key text, p_entity_id uuid, p_occurrence integer, p_run_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  insert into public.reminder_log (rule_key, entity_id, occurrence, run_id)
  values (p_rule_key, p_entity_id, p_occurrence, p_run_id)
  on conflict (rule_key, entity_id, occurrence) do nothing
  returning id into v_id;
  return v_id is not null;
end;
$$;

create or replace function public.record_reminder_outcome(p_rule_key text, p_entity_id uuid, p_occurrence integer, p_outcome jsonb)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.reminder_log set outcome = p_outcome
   where rule_key = p_rule_key and entity_id = p_entity_id and occurrence = p_occurrence
$$;

-- Team-Benachrichtigung aus dem Hintergrundlauf (Service-Rolle)
create or replace function public.system_notify(
  p_recipient uuid,
  p_kind text,
  p_title text,
  p_body text,
  p_link text,
  p_dedupe_key text
)
returns void
language sql
security definer
set search_path = ''
as $$
  select private.notify(p_recipient, p_kind, p_title, p_body, p_link, p_dedupe_key)
$$;

create or replace function public.system_ensure_task(
  p_auto_key text,
  p_title text,
  p_task_type text,
  p_assignee uuid,
  p_due_date date,
  p_dossier_id uuid,
  p_content_item_id uuid,
  p_description text,
  p_priority text default 'normal'
)
returns uuid
language sql
security definer
set search_path = ''
as $$
  select private.ensure_task(p_auto_key, p_title, p_task_type, p_assignee, p_due_date, p_dossier_id,
                             p_content_item_id, p_description, 'offen', p_priority)
$$;
