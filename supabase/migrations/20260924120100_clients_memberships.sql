-- =============================================================================
-- Kunden, Ansprechpartner, Leistungstypen, Paketvorlagen, Verträge (Memberships),
-- Vertragsjahre und zugesagte Leistungen (Leistungskonto).
--
-- Grundsatz: Beim Buchen wird ein Snapshot der Paketvorlage im Vertrag
-- gespeichert. Spätere Änderungen an Vorlagen verändern gebuchte Verträge nicht.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Leistungstypen (konfigurierbar)
-- -----------------------------------------------------------------------------
create table public.service_types (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  name text not null,
  description text,
  category text not null default 'sonstiges'
    check (category in ('redaktion', 'social', 'profil', 'community', 'event', 'reichweite',
                        'vernetzung', 'vorteil', 'circle', 'sonstiges')),
  -- Welche Art Inhalt erfüllt diese Leistung? null = keine Redaktionseinheit.
  content_kind text check (content_kind in ('magazinartikel', 'social')),
  is_active boolean not null default true,
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger service_types_updated_at before update on public.service_types
  for each row execute function private.set_updated_at();

-- -----------------------------------------------------------------------------
-- Paketvorlagen
-- -----------------------------------------------------------------------------
create table public.package_templates (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  name text not null,
  description text,
  is_active boolean not null default true,
  revision integer not null default 1,
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null default auth.uid()
);

create trigger package_templates_updated_at before update on public.package_templates
  for each row execute function private.set_updated_at();

create table public.package_template_items (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.package_templates (id) on delete cascade,
  service_type_id uuid not null references public.service_types (id),
  label text,
  -- null = ohne feste Stückzahl (z. B. Firmenprofil, Community-Zugang)
  quantity integer check (quantity is null or quantity > 0),
  period text not null default 'vertragsjahr'
    check (period in ('vertragsjahr', 'vertragslaufzeit')),
  -- Abgeleitete Leistung: je Einheit der Eltern-Position (z. B. 1 Social-Beitrag je Artikel)
  per_parent_item_id uuid references public.package_template_items (id) on delete set null,
  quantity_per_parent integer check (quantity_per_parent is null or quantity_per_parent > 0),
  notes text,
  sort_order integer not null default 100,
  check (per_parent_item_id is null or quantity_per_parent is not null),
  check (per_parent_item_id is null or per_parent_item_id <> id)
);

create index package_template_items_template_idx on public.package_template_items (template_id, sort_order);

-- Jede Änderung an Positionen erhöht die Revision der Vorlage (Nachvollziehbarkeit).
create or replace function private.bump_template_revision()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.package_templates
     set revision = revision + 1
   where id = coalesce(new.template_id, old.template_id);
  return null;
end;
$$;

create trigger package_template_items_bump after insert or update or delete on public.package_template_items
  for each row execute function private.bump_template_revision();

-- -----------------------------------------------------------------------------
-- Kunden & Ansprechpartner
-- -----------------------------------------------------------------------------
create table public.clients (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  legal_name text,
  category text,
  website text,
  email text,
  phone text,
  street text,
  postal_code text,
  city text,
  country text default 'Deutschland',
  owner_id uuid references public.profiles (id) on delete set null,
  status text not null default 'aktiv'
    check (status in ('interessent', 'aktiv', 'pausiert', 'beendet')),
  notes text,
  links jsonb not null default '[]'::jsonb check (jsonb_typeof(links) = 'array'),
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.profiles (id) on delete set null
);

create index clients_name_idx on public.clients (lower(name));
create index clients_owner_idx on public.clients (owner_id);

create trigger clients_updated_at before update on public.clients
  for each row execute function private.set_updated_at();
create trigger clients_audit after insert or update or delete on public.clients
  for each row execute function private.audit_row();

create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  first_name text,
  last_name text not null,
  position text,
  email text,
  phone text,
  is_primary boolean not null default false,
  can_approve boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index contacts_client_idx on public.contacts (client_id);

create trigger contacts_updated_at before update on public.contacts
  for each row execute function private.set_updated_at();
create trigger contacts_audit after insert or update or delete on public.contacts
  for each row execute function private.audit_row();

-- -----------------------------------------------------------------------------
-- Verträge (Memberships) und Vertragsjahre
-- -----------------------------------------------------------------------------
create table public.contracts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  package_template_id uuid references public.package_templates (id) on delete set null,
  package_key text,
  package_name text not null,
  package_revision integer,
  -- Stand der zugesagten Leistungen zum Buchungszeitpunkt (unveränderlich)
  package_snapshot jsonb not null default '{}'::jsonb,
  start_date date not null,
  end_date date not null,
  renewal_date date,
  auto_renew boolean not null default false,
  status text not null default 'aktiv'
    check (status in ('entwurf', 'aktiv', 'gekuendigt', 'beendet')),
  owner_id uuid references public.profiles (id) on delete set null,
  notes text,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  check (end_date >= start_date)
);

create index contracts_client_idx on public.contracts (client_id);
create index contracts_end_idx on public.contracts (end_date);

create trigger contracts_updated_at before update on public.contracts
  for each row execute function private.set_updated_at();
create trigger contracts_audit after insert or update or delete on public.contracts
  for each row execute function private.audit_row();

create or replace function private.protect_contract_snapshot()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.package_snapshot is distinct from old.package_snapshot then
    raise exception 'Der gebuchte Leistungsstand (Snapshot) ist unveränderlich. Bitte Korrekturen als Zusatzbuchung oder Korrektur erfassen.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger contracts_protect_snapshot before update on public.contracts
  for each row execute function private.protect_contract_snapshot();

create table public.contract_years (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.contracts (id) on delete cascade,
  year_no integer not null check (year_no > 0),
  start_date date not null,
  end_date date not null,
  created_at timestamptz not null default now(),
  unique (contract_id, year_no),
  check (end_date >= start_date)
);

create index contract_years_end_idx on public.contract_years (end_date);

-- -----------------------------------------------------------------------------
-- Zugesagte Leistungen (je Einheit eine Zeile, z. B. "Artikel 2 von 4")
-- -----------------------------------------------------------------------------
create table public.deliverables (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  contract_id uuid references public.contracts (id) on delete cascade,
  contract_year_id uuid references public.contract_years (id) on delete cascade,
  service_type_id uuid not null references public.service_types (id),
  title text not null,
  description text,
  source text not null default 'paket'
    check (source in ('paket', 'zusatzbuchung', 'korrektur', 'manuell')),
  template_item_id uuid,
  unit_no integer,
  unit_count integer,
  parent_deliverable_id uuid references public.deliverables (id) on delete set null,
  content_kind text check (content_kind in ('magazinartikel', 'social')),
  status text not null default 'offen'
    check (status in ('offen', 'in_arbeit', 'erbracht', 'entfallen')),
  owner_id uuid references public.profiles (id) on delete set null,
  due_date date,
  fulfilled_at timestamptz,
  fulfillment_note text,
  evidence_url text,
  cancel_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  check (status <> 'entfallen' or cancel_reason is not null)
);

create index deliverables_client_idx on public.deliverables (client_id, status);
create index deliverables_contract_idx on public.deliverables (contract_id, contract_year_id);
create index deliverables_owner_idx on public.deliverables (owner_id);
create index deliverables_parent_idx on public.deliverables (parent_deliverable_id);
create index deliverables_due_idx on public.deliverables (due_date) where status in ('offen', 'in_arbeit');

create or replace function private.deliverables_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'erbracht' and new.fulfilled_at is null then
    new.fulfilled_at := now();
  end if;
  if new.status <> 'erbracht' then
    new.fulfilled_at := null;
  end if;
  return new;
end;
$$;

create trigger deliverables_before_write before insert or update on public.deliverables
  for each row execute function private.deliverables_before_write();
create trigger deliverables_updated_at before update on public.deliverables
  for each row execute function private.set_updated_at();
create trigger deliverables_audit after insert or update or delete on public.deliverables
  for each row execute function private.audit_row();

-- -----------------------------------------------------------------------------
-- Buchungslogik
-- -----------------------------------------------------------------------------

-- Erzeugt die Leistungseinheiten eines Vertragsjahres aus dem Vertrags-Snapshot.
create or replace function private.generate_year_deliverables(p_contract_id uuid, p_year_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_contract public.contracts;
  v_year public.contract_years;
  v_item jsonb;
  v_parent_unit record;
  v_count integer := 0;
  v_i integer;
  v_title text;
  v_qty integer;
  v_parent_count integer;
begin
  select * into v_contract from public.contracts where id = p_contract_id;
  select * into v_year from public.contract_years where id = p_year_id;

  -- 1. Durchlauf: Positionen ohne Eltern-Position
  for v_item in
    select value from jsonb_array_elements(coalesce(v_contract.package_snapshot -> 'items', '[]'::jsonb))
    where (value ->> 'per_parent_item_id') is null
    order by coalesce((value ->> 'sort_order')::integer, 100)
  loop
    if v_item ->> 'period' = 'vertragslaufzeit' and v_year.year_no > 1 then
      continue;
    end if;
    v_title := coalesce(nullif(v_item ->> 'label', ''), v_item ->> 'service_type_name');
    v_qty := (v_item ->> 'quantity')::integer;
    if v_qty is null then
      insert into public.deliverables (client_id, contract_id, contract_year_id, service_type_id, title, description,
                                       source, template_item_id, content_kind, owner_id, due_date, created_by)
      values (v_contract.client_id, v_contract.id, v_year.id, (v_item ->> 'service_type_id')::uuid, v_title,
              v_item ->> 'notes', 'paket', (v_item ->> 'id')::uuid, v_item ->> 'content_kind',
              v_contract.owner_id, null, auth.uid());
      v_count := v_count + 1;
    else
      for v_i in 1 .. v_qty loop
        insert into public.deliverables (client_id, contract_id, contract_year_id, service_type_id, title, description,
                                         source, template_item_id, unit_no, unit_count, content_kind, owner_id, due_date, created_by)
        values (v_contract.client_id, v_contract.id, v_year.id, (v_item ->> 'service_type_id')::uuid,
                v_title, v_item ->> 'notes', 'paket', (v_item ->> 'id')::uuid, v_i, v_qty,
                v_item ->> 'content_kind', v_contract.owner_id, v_year.end_date, auth.uid());
        v_count := v_count + 1;
      end loop;
    end if;
  end loop;

  -- 2. Durchlauf: abgeleitete Positionen (z. B. Social-Beitrag je Artikel)
  for v_item in
    select value from jsonb_array_elements(coalesce(v_contract.package_snapshot -> 'items', '[]'::jsonb))
    where (value ->> 'per_parent_item_id') is not null
    order by coalesce((value ->> 'sort_order')::integer, 100)
  loop
    v_title := coalesce(nullif(v_item ->> 'label', ''), v_item ->> 'service_type_name');
    v_qty := coalesce((v_item ->> 'quantity_per_parent')::integer, 1);
    select count(*) into v_parent_count
      from public.deliverables d
     where d.contract_year_id = v_year.id
       and d.template_item_id = (v_item ->> 'per_parent_item_id')::uuid;

    for v_parent_unit in
      select d.* from public.deliverables d
       where d.contract_year_id = v_year.id
         and d.template_item_id = (v_item ->> 'per_parent_item_id')::uuid
       order by d.unit_no nulls first
    loop
      for v_i in 1 .. v_qty loop
        insert into public.deliverables (client_id, contract_id, contract_year_id, service_type_id, title, description,
                                         source, template_item_id, unit_no, unit_count, parent_deliverable_id,
                                         content_kind, owner_id, due_date, created_by)
        values (v_contract.client_id, v_contract.id, v_year.id, (v_item ->> 'service_type_id')::uuid,
                v_title, v_item ->> 'notes', 'paket', (v_item ->> 'id')::uuid,
                (coalesce(v_parent_unit.unit_no, 1) - 1) * v_qty + v_i,
                v_parent_count * v_qty,
                v_parent_unit.id, v_item ->> 'content_kind', v_contract.owner_id, v_parent_unit.due_date, auth.uid());
        v_count := v_count + 1;
      end loop;
    end loop;
  end loop;

  return v_count;
end;
$$;

-- Membership buchen: Vertrag + Snapshot + Vertragsjahre + Leistungseinheiten.
create or replace function public.book_membership(
  p_client_id uuid,
  p_template_id uuid,
  p_start_date date,
  p_end_date date,
  p_owner_id uuid default null,
  p_auto_renew boolean default false,
  p_renewal_date date default null,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_template public.package_templates;
  v_snapshot jsonb;
  v_contract_id uuid;
  v_year_start date;
  v_year_end date;
  v_year_no integer := 0;
  v_year_id uuid;
  v_is_demo boolean;
begin
  if not private.is_editor() then
    raise exception 'Keine Berechtigung zum Buchen von Memberships.' using errcode = '42501';
  end if;
  if p_end_date < p_start_date then
    raise exception 'Das Vertragsende liegt vor dem Vertragsbeginn.' using errcode = '22023';
  end if;

  select * into v_template from public.package_templates where id = p_template_id;
  if not found then
    raise exception 'Paketvorlage nicht gefunden.' using errcode = 'P0002';
  end if;
  select c.is_demo into v_is_demo from public.clients c where c.id = p_client_id;
  if not found then
    raise exception 'Kunde nicht gefunden.' using errcode = 'P0002';
  end if;

  select jsonb_build_object(
           'template_id', v_template.id,
           'key', v_template.key,
           'name', v_template.name,
           'description', v_template.description,
           'revision', v_template.revision,
           'booked_at', now(),
           'items', coalesce(jsonb_agg(jsonb_build_object(
               'id', i.id,
               'service_type_id', i.service_type_id,
               'service_type_key', st.key,
               'service_type_name', st.name,
               'category', st.category,
               'content_kind', st.content_kind,
               'label', i.label,
               'quantity', i.quantity,
               'period', i.period,
               'per_parent_item_id', i.per_parent_item_id,
               'quantity_per_parent', i.quantity_per_parent,
               'notes', i.notes,
               'sort_order', i.sort_order
             ) order by i.sort_order) filter (where i.id is not null), '[]'::jsonb)
         )
    into v_snapshot
    from public.package_template_items i
    join public.service_types st on st.id = i.service_type_id
   where i.template_id = v_template.id;

  if v_snapshot is null then
    v_snapshot := jsonb_build_object('template_id', v_template.id, 'key', v_template.key, 'name', v_template.name,
                                     'revision', v_template.revision, 'booked_at', now(), 'items', '[]'::jsonb);
  end if;

  insert into public.contracts (client_id, package_template_id, package_key, package_name, package_revision,
                                package_snapshot, start_date, end_date, renewal_date, auto_renew, owner_id, notes,
                                is_demo, created_by)
  values (p_client_id, v_template.id, v_template.key, v_template.name, v_template.revision, v_snapshot,
          p_start_date, p_end_date, p_renewal_date, coalesce(p_auto_renew, false),
          coalesce(p_owner_id, (select c.owner_id from public.clients c where c.id = p_client_id)),
          p_notes, coalesce(v_is_demo, false), auth.uid())
  returning id into v_contract_id;

  v_year_start := p_start_date;
  while v_year_start <= p_end_date loop
    v_year_no := v_year_no + 1;
    v_year_end := least((v_year_start + interval '1 year' - interval '1 day')::date, p_end_date);
    insert into public.contract_years (contract_id, year_no, start_date, end_date)
    values (v_contract_id, v_year_no, v_year_start, v_year_end)
    returning id into v_year_id;
    perform private.generate_year_deliverables(v_contract_id, v_year_id);
    v_year_start := v_year_end + 1;
  end loop;

  perform private.log_event('membership_gebucht', 'contracts', v_contract_id, null, p_client_id,
                            format('Membership „%s“ gebucht (%s – %s)', v_template.name,
                                   to_char(p_start_date, 'DD.MM.YYYY'), to_char(p_end_date, 'DD.MM.YYYY')));
  return v_contract_id;
end;
$$;

-- Weiteres Vertragsjahr (Verlängerung) auf Basis des gebuchten Snapshots.
create or replace function public.add_contract_year(p_contract_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_contract public.contracts;
  v_last public.contract_years;
  v_year_id uuid;
  v_start date;
  v_end date;
begin
  if not private.is_editor() then
    raise exception 'Keine Berechtigung.' using errcode = '42501';
  end if;
  select * into v_contract from public.contracts where id = p_contract_id for update;
  if not found then
    raise exception 'Vertrag nicht gefunden.' using errcode = 'P0002';
  end if;
  select * into v_last from public.contract_years where contract_id = p_contract_id order by year_no desc limit 1;

  v_start := coalesce(v_last.end_date + 1, v_contract.start_date);
  v_end := (v_start + interval '1 year' - interval '1 day')::date;

  insert into public.contract_years (contract_id, year_no, start_date, end_date)
  values (p_contract_id, coalesce(v_last.year_no, 0) + 1, v_start, v_end)
  returning id into v_year_id;

  update public.contracts
     set end_date = greatest(end_date, v_end),
         status = case when status in ('beendet', 'gekuendigt') then 'aktiv' else status end
   where id = p_contract_id;

  perform private.generate_year_deliverables(p_contract_id, v_year_id);
  perform private.log_event('vertragsjahr_hinzugefuegt', 'contracts', p_contract_id, null, v_contract.client_id,
                            format('Vertragsjahr %s ergänzt (%s – %s)', coalesce(v_last.year_no, 0) + 1,
                                   to_char(v_start, 'DD.MM.YYYY'), to_char(v_end, 'DD.MM.YYYY')));
  return v_year_id;
end;
$$;

-- Zusatzbuchung oder Korrektur (mit Begründung im Änderungsprotokoll).
create or replace function public.add_deliverable(
  p_client_id uuid,
  p_contract_id uuid,
  p_contract_year_id uuid,
  p_service_type_id uuid,
  p_title text,
  p_quantity integer,
  p_source text,
  p_reason text,
  p_due_date date default null,
  p_owner_id uuid default null,
  p_description text default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_kind text;
  v_i integer;
  v_qty integer := p_quantity;
begin
  if not private.is_editor() then
    raise exception 'Keine Berechtigung.' using errcode = '42501';
  end if;
  if p_source not in ('zusatzbuchung', 'korrektur', 'manuell') then
    raise exception 'Ungültige Herkunft der Leistung.' using errcode = '22023';
  end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'Bitte eine Begründung für die Zusatzbuchung/Korrektur angeben.' using errcode = '22023';
  end if;
  if p_contract_year_id is not null and not exists (
    select 1 from public.contract_years y join public.contracts c on c.id = y.contract_id
     where y.id = p_contract_year_id and c.client_id = p_client_id
       and (p_contract_id is null or c.id = p_contract_id)
  ) then
    raise exception 'Vertragsjahr passt nicht zum Kunden/Vertrag.' using errcode = '22023';
  end if;

  select st.content_kind into v_kind from public.service_types st where st.id = p_service_type_id;
  perform set_config('app.change_reason', p_reason, true);

  if v_qty is null then
    insert into public.deliverables (client_id, contract_id, contract_year_id, service_type_id, title, description, source,
                                     content_kind, owner_id, due_date)
    values (p_client_id, p_contract_id, p_contract_year_id, p_service_type_id, p_title, p_description, p_source,
            v_kind, p_owner_id, p_due_date);
    return 1;
  end if;

  for v_i in 1 .. v_qty loop
    insert into public.deliverables (client_id, contract_id, contract_year_id, service_type_id, title, description, source,
                                     unit_no, unit_count, content_kind, owner_id, due_date)
    values (p_client_id, p_contract_id, p_contract_year_id, p_service_type_id, p_title, p_description, p_source,
            v_i, v_qty, v_kind, p_owner_id, p_due_date);
  end loop;
  return v_qty;
end;
$$;

-- Manuelle Korrektur einer zugesagten Leistung – Begründung ist Pflicht.
create or replace function public.correct_deliverable(
  p_id uuid,
  p_status text,
  p_title text,
  p_owner_id uuid,
  p_due_date date,
  p_evidence_url text,
  p_fulfillment_note text,
  p_cancel_reason text,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_editor() then
    raise exception 'Keine Berechtigung.' using errcode = '42501';
  end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'Bitte eine Begründung für die Korrektur angeben.' using errcode = '22023';
  end if;
  perform set_config('app.change_reason', p_reason, true);
  update public.deliverables
     set status = coalesce(p_status, status),
         title = coalesce(nullif(trim(p_title), ''), title),
         owner_id = p_owner_id,
         due_date = p_due_date,
         evidence_url = p_evidence_url,
         fulfillment_note = p_fulfillment_note,
         cancel_reason = case when coalesce(p_status, status) = 'entfallen' then p_cancel_reason else null end
   where id = p_id;
  if not found then
    raise exception 'Leistung nicht gefunden.' using errcode = 'P0002';
  end if;
end;
$$;
