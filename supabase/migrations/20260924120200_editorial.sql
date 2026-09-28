-- =============================================================================
-- Redaktion: Kampagnen, Ideenspeicher, Beitragsakten, Inhalte (Magazinartikel und
-- Social-Fassungen je Kanal), Versionen, Freigaben, Medien, Formatregeln, Aufgaben.
--
-- Zentrale Regel: Eine Freigabe gilt immer für eine konkrete Version (Fingerprint).
-- Jede inhaltliche Änderung erzeugt einen neuen Fingerprint; passt er nicht mehr
-- zur freigegebenen Version, gilt die Freigabe für die aktuelle Fassung nicht mehr.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Kampagnen & Ideen
-- -----------------------------------------------------------------------------
create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  goal text,
  description text,
  start_date date,
  end_date date,
  owner_id uuid references public.profiles (id) on delete set null,
  status text not null default 'planung'
    check (status in ('planung', 'aktiv', 'abgeschlossen', 'archiviert')),
  topics text[] not null default '{}',
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  check (end_date is null or start_date is null or end_date >= start_date)
);

create trigger campaigns_updated_at before update on public.campaigns
  for each row execute function private.set_updated_at();
create trigger campaigns_audit after insert or update or delete on public.campaigns
  for each row execute function private.audit_row();

create table public.ideas (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) > 0),
  description text,
  tags text[] not null default '{}',
  campaign_id uuid references public.campaigns (id) on delete set null,
  client_id uuid references public.clients (id) on delete set null,
  status text not null default 'neu'
    check (status in ('neu', 'vorgemerkt', 'umgesetzt', 'verworfen')),
  is_reusable boolean not null default false,
  use_count integer not null default 0,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.profiles (id) on delete set null
);

create index ideas_status_idx on public.ideas (status);

create trigger ideas_updated_at before update on public.ideas
  for each row execute function private.set_updated_at();

-- -----------------------------------------------------------------------------
-- Beitragsakten
-- -----------------------------------------------------------------------------
create table public.dossiers (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) > 0),
  kind text not null check (kind in ('kunde', 'eigen')),
  client_id uuid references public.clients (id) on delete restrict,
  contract_id uuid references public.contracts (id) on delete set null,
  deliverable_id uuid references public.deliverables (id) on delete set null,
  campaign_id uuid references public.campaigns (id) on delete set null,
  idea_id uuid references public.ideas (id) on delete set null,
  contact_id uuid references public.contacts (id) on delete set null,
  own_category text check (own_category in ('summit', 'speaker', 'aussteller', 'newsletter',
                                            'eventrueckblick', 'netzwerk', 'sonstiges')),
  topic text,
  goal text,
  target_audience text,
  key_message text,
  owner_id uuid references public.profiles (id) on delete set null,
  period_start date,
  period_end date,
  status text not null default 'aktiv'
    check (status in ('aktiv', 'pausiert', 'abgeschlossen', 'abgebrochen')),
  notes text,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  check (kind = 'eigen' or client_id is not null),
  check (period_end is null or period_start is null or period_end >= period_start)
);

create index dossiers_client_idx on public.dossiers (client_id);
create index dossiers_owner_idx on public.dossiers (owner_id);
create index dossiers_campaign_idx on public.dossiers (campaign_id);
create index dossiers_deliverable_idx on public.dossiers (deliverable_id);
create index dossiers_status_idx on public.dossiers (status);

create trigger dossiers_updated_at before update on public.dossiers
  for each row execute function private.set_updated_at();
create trigger dossiers_audit after insert or update or delete on public.dossiers
  for each row execute function private.audit_row();

-- Leistung automatisch "in Arbeit" setzen, sobald eine Akte zugeordnet wird.
create or replace function private.dossiers_mark_deliverable()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.deliverable_id is not null
     and (tg_op = 'INSERT' or new.deliverable_id is distinct from old.deliverable_id) then
    update public.deliverables set status = 'in_arbeit'
     where id = new.deliverable_id and status = 'offen';
  end if;
  return null;
end;
$$;

create trigger dossiers_mark_deliverable after insert or update of deliverable_id on public.dossiers
  for each row execute function private.dossiers_mark_deliverable();

-- Höchstens eine Akte je gebuchter Leistung
create unique index dossiers_one_per_deliverable on public.dossiers (deliverable_id) where deliverable_id is not null;

-- Kunde, Vertrag, Leistung und Verantwortung ändert nur die Redaktion (Mitarbeit hätte sich
-- sonst Zugriff auf fremde Kundendaten verschaffen können). Leistung muss zum Kunden passen.
create or replace function private.dossiers_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and auth.uid() is not null and not private.is_editor()
     and (new.client_id is distinct from old.client_id or new.contract_id is distinct from old.contract_id
          or new.deliverable_id is distinct from old.deliverable_id or new.kind is distinct from old.kind
          or new.owner_id is distinct from old.owner_id or new.is_demo is distinct from old.is_demo) then
    raise exception 'Kunde, Leistung und Verantwortung einer Akte legt die Redaktion fest.' using errcode = '42501';
  end if;
  if new.deliverable_id is not null and (tg_op = 'INSERT' or new.deliverable_id is distinct from old.deliverable_id)
     and not exists (select 1 from public.deliverables dl
                      where dl.id = new.deliverable_id and dl.client_id is not distinct from new.client_id) then
    raise exception 'Die Leistung gehört nicht zum Kunden dieser Akte.' using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger dossiers_before_write before insert or update on public.dossiers
  for each row execute function private.dossiers_before_write();

-- -----------------------------------------------------------------------------
-- Medien (Uploads im geschützten Speicher oder externe Links, z. B. Google Drive)
-- -----------------------------------------------------------------------------
create table public.media_assets (
  id uuid primary key default gen_random_uuid(),
  dossier_id uuid references public.dossiers (id) on delete cascade,
  client_id uuid references public.clients (id) on delete set null,
  kind text not null check (kind in ('bild', 'video', 'dokument')),
  source text not null check (source in ('upload', 'link')),
  storage_bucket text,
  storage_path text unique,
  external_url text,
  file_name text not null,
  mime_type text,
  size_bytes bigint check (size_bytes is null or size_bytes >= 0),
  width integer check (width is null or width > 0),
  height integer check (height is null or height > 0),
  duration_seconds numeric check (duration_seconds is null or duration_seconds >= 0),
  title text,
  alt_text text,
  credit text,
  rights_note text,
  internal_note text,
  status text not null default 'entwurf' check (status in ('entwurf', 'final', 'veraltet')),
  supersedes_id uuid references public.media_assets (id) on delete set null,
  uploaded_via text not null default 'intern' check (uploaded_via in ('intern', 'kunde')),
  material_request_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  check ((source = 'upload' and storage_path is not null) or (source = 'link' and external_url is not null))
);

create index media_assets_dossier_idx on public.media_assets (dossier_id);
create index media_assets_request_idx on public.media_assets (material_request_id);

create trigger media_assets_updated_at before update on public.media_assets
  for each row execute function private.set_updated_at();
create trigger media_assets_audit after insert or update or delete on public.media_assets
  for each row execute function private.audit_row();

-- Neue Version ersetzt ältere: alte Datei wird als "veraltet" gekennzeichnet.
create or replace function private.media_supersede()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.supersedes_id is not null and (tg_op = 'INSERT' or new.supersedes_id is distinct from old.supersedes_id) then
    update public.media_assets set status = 'veraltet' where id = new.supersedes_id and status <> 'veraltet';
  end if;
  return null;
end;
$$;

create trigger media_assets_supersede after insert or update of supersedes_id on public.media_assets
  for each row execute function private.media_supersede();

-- Direkte API-Schreibzugriffe: Datei muss im Ordner der eigenen Akte liegen, Herkunft
-- und Zuordnung bleiben unverändert (Kunden-Uploads legt nur public_register_material_file an).
create or replace function private.media_assets_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user::text <> 'authenticated' then
    return new;
  end if;
  if tg_op = 'INSERT' and (new.uploaded_via <> 'intern' or new.material_request_id is not null) then
    raise exception 'Kunden-Uploads entstehen nur über das Materialformular.' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and (new.dossier_id is distinct from old.dossier_id
                           or new.uploaded_via is distinct from old.uploaded_via
                           or new.material_request_id is distinct from old.material_request_id) then
    raise exception 'Zuordnung und Herkunft eines Mediums lassen sich nicht ändern.' using errcode = '42501';
  end if;
  if new.storage_path is not null and (tg_op = 'INSERT' or new.storage_path is distinct from old.storage_path)
     and (new.dossier_id is null
          or left(new.storage_path, length('dossiers/' || new.dossier_id::text || '/')) <> 'dossiers/' || new.dossier_id::text || '/'
          or new.storage_path like '%..%'
          or coalesce(new.storage_bucket, 'media') <> 'media') then
    raise exception 'Ungültiger Speicherpfad für diese Beitragsakte.' using errcode = '42501';
  end if;
  if new.supersedes_id is not null and (tg_op = 'INSERT' or new.supersedes_id is distinct from old.supersedes_id)
     and not exists (select 1 from public.media_assets m where m.id = new.supersedes_id
                      and m.dossier_id is not distinct from new.dossier_id) then
    raise exception 'Eine neue Version muss zur selben Beitragsakte gehören.' using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger media_assets_access_guard before insert or update on public.media_assets
  for each row execute function private.media_assets_guard();

-- -----------------------------------------------------------------------------
-- Inhalte: Magazinartikel und Social-Fassungen (je Kanal eine eigene Zeile)
-- -----------------------------------------------------------------------------
create table public.content_items (
  id uuid primary key default gen_random_uuid(),
  dossier_id uuid not null references public.dossiers (id) on delete cascade,
  kind text not null check (kind in ('magazinartikel', 'social')),
  channel text not null check (channel in ('magazin', 'instagram', 'facebook', 'linkedin')),
  parent_id uuid references public.content_items (id) on delete set null,
  deliverable_id uuid references public.deliverables (id) on delete set null,
  title text not null check (length(trim(title)) > 0),
  -- Magazinartikel
  teaser text,
  body_html text,
  seo_title text,
  meta_description text,
  author_name text,
  -- Social
  caption text,
  cta text,
  hashtags text[] not null default '{}',
  link_url text,
  post_format text check (post_format in ('artikel', 'feed_bild', 'karussell', 'reel', 'story', 'video', 'text', 'link')),
  -- Ablauf & Freigaben
  status text not null default 'entwurf'
    check (status in ('entwurf', 'interne_pruefung', 'intern_freigegeben', 'beim_kunden',
                      'aenderung_gewuenscht', 'freigegeben', 'veroeffentlicht', 'archiviert')),
  assignee_id uuid references public.profiles (id) on delete set null,
  requires_internal_approval boolean not null default true,
  -- Für Kundenakten beim Anlegen immer true (Trigger); bewusst abschaltbar per Update.
  requires_client_approval boolean not null default false,
  fingerprint text not null default '',
  current_version_no integer not null default 0,
  internal_approval_id uuid,
  internal_ok boolean not null default false,
  internal_version_no integer,
  client_approval_id uuid,
  client_ok boolean not null default false,
  client_version_no integer,
  approvals_complete boolean not null default false,
  approval_invalidated_at timestamptz,
  -- Planung
  schedule_status text not null default 'ohne_termin'
    check (schedule_status in ('ohne_termin', 'vorlaeufig', 'verbindlich')),
  scheduled_at timestamptz,
  window_start date,
  window_end date,
  platform_account_id uuid,
  auto_publish boolean not null default false,
  authorized_by uuid references public.profiles (id) on delete set null,
  authorized_at timestamptz,
  -- Ergebnis / Nachweis
  published_at timestamptz,
  published_url text,
  publish_method text check (publish_method in ('api', 'manuell')),
  external_post_id text,
  metrics jsonb,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  updated_by uuid default auth.uid() references public.profiles (id) on delete set null,
  check ((kind = 'magazinartikel' and channel = 'magazin') or (kind = 'social' and channel <> 'magazin')),
  check (window_end is null or window_start is null or window_end >= window_start),
  check (metrics is null or jsonb_typeof(metrics) = 'object')
);

comment on column public.content_items.fingerprint is 'SHA-256 über alle veröffentlichungsrelevanten Felder inkl. Medienzuordnung.';
comment on column public.content_items.metrics is 'Optional: nur echte (API) oder ausdrücklich manuell eingetragene Werte, z. B. {"reach":123,"clicks":4,"source":"manuell"}';

create index content_items_dossier_idx on public.content_items (dossier_id);
create index content_items_schedule_idx on public.content_items (scheduled_at) where scheduled_at is not null;
create index content_items_status_idx on public.content_items (status);
create index content_items_assignee_idx on public.content_items (assignee_id);
create index content_items_deliverable_idx on public.content_items (deliverable_id);
create index content_items_parent_idx on public.content_items (parent_id);

create table public.content_versions (
  id uuid primary key default gen_random_uuid(),
  content_item_id uuid not null references public.content_items (id) on delete cascade,
  version_no integer not null check (version_no > 0),
  fingerprint text not null,
  snapshot jsonb not null,
  reason text,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  unique (content_item_id, version_no)
);

create index content_versions_fp_idx on public.content_versions (content_item_id, fingerprint);

create trigger content_versions_immutable before update on public.content_versions
  for each row execute function private.prevent_modification();

create table public.approvals (
  id uuid primary key default gen_random_uuid(),
  content_item_id uuid not null references public.content_items (id) on delete cascade,
  content_version_id uuid not null references public.content_versions (id),
  dossier_id uuid not null,
  kind text not null check (kind in ('intern', 'kunde')),
  decision text not null check (decision in ('freigegeben', 'aenderung_gewuenscht')),
  comment text,
  decided_at timestamptz not null default now(),
  decided_by uuid references public.profiles (id) on delete set null,
  approver_name text,
  approver_email text,
  approver_position text,
  preview_id uuid,
  preview_item_id uuid,
  created_at timestamptz not null default now(),
  check (kind = 'intern' or (approver_name is not null and approver_email is not null))
);

create index approvals_content_idx on public.approvals (content_item_id, decided_at desc);
create index approvals_dossier_idx on public.approvals (dossier_id);

create trigger approvals_immutable before update on public.approvals
  for each row execute function private.prevent_modification();

alter table public.content_items
  add constraint content_items_internal_approval_fk foreign key (internal_approval_id) references public.approvals (id) on delete set null,
  add constraint content_items_client_approval_fk foreign key (client_approval_id) references public.approvals (id) on delete set null;

create table public.content_media (
  id uuid primary key default gen_random_uuid(),
  content_item_id uuid not null references public.content_items (id) on delete cascade,
  -- Erst beim Commit geprüft: verwendete Medien lassen sich nicht einzeln löschen,
  -- beim Löschen der ganzen Akte greift aber die Kaskade (Reihenfolge-unabhängig).
  media_asset_id uuid not null references public.media_assets (id) on delete no action deferrable initially deferred,
  position integer not null default 0,
  role text not null default 'medium' check (role in ('medium', 'titelbild', 'cover')),
  created_at timestamptz not null default now(),
  unique (content_item_id, media_asset_id)
);

create index content_media_asset_idx on public.content_media (media_asset_id);

-- -----------------------------------------------------------------------------
-- Fingerprint, Snapshot und Freigabe-Logik
-- -----------------------------------------------------------------------------
create or replace function private.compute_fingerprint(p_item public.content_items)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select encode(sha256(convert_to(concat_ws(chr(31),
    p_item.kind, p_item.channel, p_item.title,
    coalesce(p_item.teaser, ''), coalesce(p_item.body_html, ''),
    coalesce(p_item.seo_title, ''), coalesce(p_item.meta_description, ''), coalesce(p_item.author_name, ''),
    coalesce(p_item.caption, ''), coalesce(p_item.cta, ''), array_to_string(p_item.hashtags, ' '),
    coalesce(p_item.link_url, ''), coalesce(p_item.post_format, ''),
    coalesce((
      select string_agg(cm.media_asset_id::text || ':' || cm.position::text || ':' || cm.role || ':' ||
                        coalesce(ma.storage_path, ma.external_url, ''), ',' order by cm.position, cm.media_asset_id)
        from public.content_media cm
        join public.media_assets ma on ma.id = cm.media_asset_id
       where cm.content_item_id = p_item.id
    ), '')
  ), 'UTF8')), 'hex')
$$;

-- Gilt die Freigabe p_approval_id (Art p_kind) für genau diesen Inhalt in der Fassung p_fingerprint?
create or replace function private.approval_matches(p_approval_id uuid, p_content_id uuid, p_kind text, p_fingerprint text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select a.decision = 'freigegeben' and a.kind = p_kind
           and a.content_item_id = p_content_id and v.content_item_id = p_content_id
           and v.fingerprint = p_fingerprint
      from public.approvals a
      join public.content_versions v on v.id = a.content_version_id
     where a.id = p_approval_id
  ), false)
$$;

create or replace function private.content_snapshot(p_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'kind', c.kind, 'channel', c.channel, 'title', c.title, 'teaser', c.teaser, 'body_html', c.body_html,
    'seo_title', c.seo_title, 'meta_description', c.meta_description, 'author_name', c.author_name,
    'caption', c.caption, 'cta', c.cta, 'hashtags', to_jsonb(c.hashtags), 'link_url', c.link_url,
    'post_format', c.post_format,
    'media', coalesce((
      select jsonb_agg(jsonb_build_object(
               'media_asset_id', m.id, 'position', cm.position, 'role', cm.role, 'kind', m.kind,
               'source', m.source, 'storage_path', m.storage_path, 'external_url', m.external_url,
               'file_name', m.file_name, 'mime_type', m.mime_type, 'width', m.width, 'height', m.height,
               'duration_seconds', m.duration_seconds, 'alt_text', m.alt_text, 'credit', m.credit)
             order by cm.position, m.id)
        from public.content_media cm
        join public.media_assets m on m.id = cm.media_asset_id
       where cm.content_item_id = c.id
    ), '[]'::jsonb)
  )
  from public.content_items c
  where c.id = p_id
$$;

create or replace function private.content_items_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_kind text;
begin
  if tg_op = 'INSERT' then
    select d.kind into v_kind from public.dossiers d where d.id = new.dossier_id;
    if v_kind = 'kunde' then
      new.requires_client_approval := true;
    end if;
    if new.post_format is null then
      new.post_format := case when new.kind = 'magazinartikel' then 'artikel' else 'feed_bild' end;
    end if;
  end if;

  -- Leistung muss zum Kunden der Akte gehören (sonst würde eine fremde Leistung als erbracht gelten)
  if new.deliverable_id is not null and (tg_op = 'INSERT' or new.deliverable_id is distinct from old.deliverable_id) then
    if not exists (select 1 from public.deliverables dl
                     join public.dossiers d on d.id = new.dossier_id
                    where dl.id = new.deliverable_id and dl.client_id = d.client_id) then
      raise exception 'Die Leistung gehört nicht zum Kunden dieser Beitragsakte.' using errcode = '22023';
    end if;
  end if;

  new.updated_by := coalesce(auth.uid(), new.updated_by);
  new.fingerprint := private.compute_fingerprint(new);

  -- Inhalt nach Prüfung/Freigabe geändert → Freigabe gilt nicht mehr stillschweigend
  if tg_op = 'UPDATE' and new.fingerprint is distinct from old.fingerprint
     and old.status in ('interne_pruefung', 'intern_freigegeben', 'beim_kunden', 'freigegeben') then
    new.status := 'entwurf';
    new.approval_invalidated_at := now();
    if new.schedule_status = 'verbindlich' then
      new.schedule_status := 'vorlaeufig';
    end if;
    new.auto_publish := false;
    new.authorized_by := null;
    new.authorized_at := null;
  end if;

  new.internal_ok := private.approval_matches(new.internal_approval_id, new.id, 'intern', new.fingerprint);
  new.client_ok := private.approval_matches(new.client_approval_id, new.id, 'kunde', new.fingerprint);
  new.approvals_complete := (not new.requires_internal_approval or new.internal_ok)
                        and (not new.requires_client_approval or new.client_ok);

  -- Freigabe entzogen (z. B. Änderungswunsch in einer späteren Runde) → nicht mehr verbindlich
  if tg_op = 'UPDATE' and old.approvals_complete and not new.approvals_complete
     and new.status <> 'veroeffentlicht' then
    new.approval_invalidated_at := now();
    if new.schedule_status = 'verbindlich' then
      new.schedule_status := 'vorlaeufig';
    end if;
    new.auto_publish := false;
  end if;

  -- Status-Konsistenz
  if new.status = 'freigegeben' and not new.approvals_complete then
    raise exception 'Status „Freigegeben“ erfordert gültige Freigaben für die aktuelle Fassung.' using errcode = 'P0001';
  end if;
  if new.status = 'intern_freigegeben' and not (new.internal_ok or not new.requires_internal_approval) then
    raise exception 'Status „Intern freigegeben“ erfordert eine gültige interne Freigabe.' using errcode = 'P0001';
  end if;
  if new.status = 'veroeffentlicht'
     and (tg_op = 'INSERT' or old.status is distinct from 'veroeffentlicht')
     and (new.published_at is null or (new.published_url is null and new.external_post_id is null)) then
    raise exception 'Als veröffentlicht gilt ein Beitrag nur mit Veröffentlichungszeitpunkt und Link bzw. Plattform-ID.' using errcode = 'P0001';
  end if;

  -- Planung: verbindlich nur mit vollständigen Freigaben und Termin
  if new.schedule_status = 'verbindlich' then
    if new.scheduled_at is null then
      raise exception 'Für eine verbindliche Planung ist ein Termin erforderlich.' using errcode = 'P0001';
    end if;
    if not new.approvals_complete and new.status <> 'veroeffentlicht' then
      raise exception 'Verbindlich einplanen ist erst möglich, wenn alle erforderlichen Freigaben vorliegen.' using errcode = 'P0001';
    end if;
    if tg_op = 'INSERT' or old.schedule_status is distinct from 'verbindlich'
       or old.scheduled_at is distinct from new.scheduled_at then
      if auth.uid() is not null and not private.is_approver() then
        raise exception 'Nur Freigabe/Leitung oder Admin darf Veröffentlichungen verbindlich einplanen.' using errcode = '42501';
      end if;
      new.authorized_by := coalesce(auth.uid(), new.authorized_by);
      new.authorized_at := now();
    end if;
  else
    new.authorized_by := null;
    new.authorized_at := null;
  end if;

  if new.schedule_status = 'ohne_termin' then
    new.scheduled_at := null;
  end if;

  if new.auto_publish then
    if new.schedule_status <> 'verbindlich' then
      raise exception 'Automatische Veröffentlichung setzt eine verbindliche Planung voraus.' using errcode = 'P0001';
    end if;
    if new.channel = 'magazin' then
      raise exception 'Für das MICE Magazin ist keine Schnittstelle eingerichtet – bitte manuell veröffentlichen.' using errcode = 'P0001';
    end if;
    if new.platform_account_id is null then
      raise exception 'Automatische Veröffentlichung erfordert ein zugeordnetes Zielkonto.' using errcode = 'P0001';
    end if;
  end if;

  return new;
end;
$$;

-- Direkte Schreibzugriffe über die API (Rolle "authenticated") dürfen Freigaben,
-- Status, verbindliche Planung und Veröffentlichungsnachweis nicht selbst setzen.
-- Diese Felder ändern ausschließlich die geprüften Funktionen (SECURITY DEFINER;
-- dort ist current_user der Eigentümer, nicht "authenticated").
-- Bewusst SECURITY INVOKER, damit current_user den tatsächlichen Aufrufer zeigt.
create or replace function private.content_items_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user::text <> 'authenticated' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.status <> 'entwurf' or new.internal_approval_id is not null or new.client_approval_id is not null
       or not new.requires_internal_approval or new.schedule_status = 'verbindlich' or new.auto_publish
       or new.published_at is not null or new.published_url is not null or new.external_post_id is not null
       or new.publish_method is not null or new.metrics is not null then
      raise exception 'Freigaben, verbindliche Planung und Veröffentlichung werden über den Ablauf gesetzt.'
        using errcode = '42501';
    end if;
    return new;
  end if;

  if new.dossier_id is distinct from old.dossier_id or new.kind is distinct from old.kind
     or new.channel is distinct from old.channel then
    raise exception 'Akte, Art und Kanal eines Inhalts lassen sich nachträglich nicht ändern.' using errcode = '42501';
  end if;
  if new.internal_approval_id is distinct from old.internal_approval_id
     or new.client_approval_id is distinct from old.client_approval_id
     or new.requires_internal_approval is distinct from old.requires_internal_approval
     or new.requires_client_approval is distinct from old.requires_client_approval
     or new.approval_invalidated_at is distinct from old.approval_invalidated_at
     or new.authorized_by is distinct from old.authorized_by
     or new.authorized_at is distinct from old.authorized_at
     or new.current_version_no is distinct from old.current_version_no
     or new.published_at is distinct from old.published_at
     or new.published_url is distinct from old.published_url
     or new.external_post_id is distinct from old.external_post_id
     or new.publish_method is distinct from old.publish_method
     or new.metrics is distinct from old.metrics then
    raise exception 'Freigaben und Veröffentlichungsnachweise lassen sich nur über den Ablauf ändern.' using errcode = '42501';
  end if;
  if new.status is distinct from old.status
     and (old.status = 'veroeffentlicht' or new.status not in ('entwurf', 'archiviert')) then
    raise exception 'Der Status ergibt sich aus Prüfung, Kundenfreigabe und Veröffentlichung.' using errcode = '42501';
  end if;
  if new.schedule_status = 'verbindlich' and old.schedule_status is distinct from 'verbindlich' then
    raise exception 'Verbindlich eingeplant wird über die Planung des Inhalts.' using errcode = '42501';
  end if;
  if new.auto_publish and not old.auto_publish then
    raise exception 'Die automatische Veröffentlichung wird über die Planung aktiviert.' using errcode = '42501';
  end if;
  return new;
end;
$$;

-- Name mit "access" → läuft vor content_items_before_write (alphabetische Reihenfolge)
create trigger content_items_access_guard before insert or update on public.content_items
  for each row execute function private.content_items_guard();
create trigger content_items_before_write before insert or update on public.content_items
  for each row execute function private.content_items_before_write();
create trigger content_items_updated_at before update on public.content_items
  for each row execute function private.set_updated_at();
create trigger content_items_audit after insert or update or delete on public.content_items
  for each row execute function private.audit_row();

-- Medienzuordnung ändert den Fingerprint des Inhalts
create or replace function private.content_media_touch()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.content_items set updated_at = now()
   where id in (coalesce(new.content_item_id, old.content_item_id), coalesce(old.content_item_id, new.content_item_id));
  return null;
end;
$$;

create trigger content_media_touch after insert or update or delete on public.content_media
  for each row execute function private.content_media_touch();

-- Nur Medien derselben Beitragsakte zuordnen (sonst würden fremde Dateien sichtbar bzw. veröffentlicht)
create or replace function private.content_media_check()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.content_items c
                   join public.media_assets m on m.id = new.media_asset_id
                  where c.id = new.content_item_id and m.dossier_id = c.dossier_id) then
    raise exception 'Das Medium gehört nicht zu dieser Beitragsakte.' using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger content_media_check before insert or update on public.content_media
  for each row execute function private.content_media_check();

-- Datei eines Mediums ersetzt → betroffene Inhalte neu berechnen
create or replace function private.media_assets_touch_content()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.storage_path is distinct from old.storage_path or new.external_url is distinct from old.external_url then
    update public.content_items set updated_at = now()
     where id in (select cm.content_item_id from public.content_media cm where cm.media_asset_id = new.id);
  end if;
  return null;
end;
$$;

create trigger media_assets_touch_content after update on public.media_assets
  for each row execute function private.media_assets_touch_content();

-- -----------------------------------------------------------------------------
-- Formatregeln (konfigurierbar, mit Prüfdatum und Quelle)
-- -----------------------------------------------------------------------------
create table public.format_rules (
  id uuid primary key default gen_random_uuid(),
  channel text not null check (channel in ('instagram', 'facebook', 'linkedin', 'magazin')),
  post_format text not null check (post_format in ('artikel', 'feed_bild', 'karussell', 'reel', 'story', 'video', 'text', 'link')),
  media_kind text not null check (media_kind in ('bild', 'video', 'keins')),
  label text not null,
  media_required boolean not null default true,
  allowed_mime_types text[] not null default '{}',
  max_file_size_mb numeric,
  min_width integer,
  max_width integer,
  max_pixels bigint,
  recommended_width integer,
  recommended_height integer,
  min_aspect_ratio numeric,
  max_aspect_ratio numeric,
  min_duration_seconds numeric,
  max_duration_seconds numeric,
  min_items integer,
  max_items integer,
  caption_max_length integer,
  hashtags_max integer,
  api_supported boolean not null default true,
  notes text,
  source_url text,
  verified_at date,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid() references public.profiles (id) on delete set null,
  unique (channel, post_format, media_kind)
);

create trigger format_rules_updated_at before update on public.format_rules
  for each row execute function private.set_updated_at();
create trigger format_rules_audit after insert or update or delete on public.format_rules
  for each row execute function private.audit_row();

-- -----------------------------------------------------------------------------
-- Aufgaben
-- -----------------------------------------------------------------------------
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) > 0),
  description text,
  task_type text not null default 'allgemein'
    check (task_type in ('allgemein', 'material_anfordern', 'material_pruefen', 'rueckfrage', 'entwurf',
                         'social_vorbereiten', 'grafik', 'interne_pruefung', 'kundenvorschau',
                         'kundenfeedback', 'aenderungen', 'terminierung', 'manuelle_veroeffentlichung',
                         'nachweis', 'erinnerung')),
  status text not null default 'offen'
    check (status in ('offen', 'in_arbeit', 'wartet_auf_kunde', 'erledigt', 'abgebrochen')),
  priority text not null default 'normal' check (priority in ('niedrig', 'normal', 'hoch', 'dringend')),
  assignee_id uuid references public.profiles (id) on delete set null,
  due_date date,
  dossier_id uuid references public.dossiers (id) on delete cascade,
  content_item_id uuid references public.content_items (id) on delete cascade,
  client_id uuid references public.clients (id) on delete cascade,
  campaign_id uuid references public.campaigns (id) on delete set null,
  deliverable_id uuid references public.deliverables (id) on delete set null,
  publish_job_id uuid,
  origin text not null default 'manuell' check (origin in ('manuell', 'ablauf', 'erinnerung')),
  auto_key text unique,
  waiting_since timestamptz,
  completed_at timestamptz,
  completed_by uuid references public.profiles (id) on delete set null,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.profiles (id) on delete set null
);

create index tasks_assignee_idx on public.tasks (assignee_id, status, due_date);
create index tasks_status_due_idx on public.tasks (status, due_date);
create index tasks_dossier_idx on public.tasks (dossier_id);
create index tasks_content_idx on public.tasks (content_item_id);
create index tasks_client_idx on public.tasks (client_id);

create or replace function private.tasks_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Bezüge immer aus dem Inhalt bzw. der Akte ableiten (konsistent und nicht frei wählbar)
  if new.content_item_id is not null then
    select c.dossier_id into new.dossier_id from public.content_items c where c.id = new.content_item_id;
  end if;
  if new.dossier_id is not null then
    select d.client_id into new.client_id from public.dossiers d where d.id = new.dossier_id;
  end if;
  if new.campaign_id is null and new.dossier_id is not null then
    select d.campaign_id into new.campaign_id from public.dossiers d where d.id = new.dossier_id;
  end if;

  -- Eine eigene Aufgabe darf nicht nachträglich an eine fremde Akte gehängt werden
  -- (die Zuweisung würde sonst Zugriff auf diese Akte gewähren).
  if tg_op = 'UPDATE' and new.dossier_id is distinct from old.dossier_id and new.dossier_id is not null
     and auth.uid() is not null and not private.is_editor()
     and not private.mitarbeit_can_access_dossier(new.dossier_id) then
    raise exception 'Keine Berechtigung für diese Beitragsakte.' using errcode = '42501';
  end if;

  if new.status = 'erledigt' and (tg_op = 'INSERT' or old.status is distinct from 'erledigt') then
    new.completed_at := now();
    new.completed_by := auth.uid();
  elsif new.status <> 'erledigt' then
    new.completed_at := null;
    new.completed_by := null;
  end if;

  if new.status = 'wartet_auf_kunde' and (tg_op = 'INSERT' or old.status is distinct from 'wartet_auf_kunde') then
    new.waiting_since := now();
  elsif new.status <> 'wartet_auf_kunde' then
    new.waiting_since := null;
  end if;
  return new;
end;
$$;

create trigger tasks_before_write before insert or update on public.tasks
  for each row execute function private.tasks_before_write();
create trigger tasks_updated_at before update on public.tasks
  for each row execute function private.set_updated_at();
create trigger tasks_audit after insert or update or delete on public.tasks
  for each row execute function private.audit_row();

-- Benachrichtigung bei Zuweisung
create or replace function private.tasks_notify_assignee()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.assignee_id is not null
     and new.assignee_id is distinct from auth.uid()
     and (tg_op = 'INSERT' or new.assignee_id is distinct from old.assignee_id)
     and new.status not in ('erledigt', 'abgebrochen') then
    perform private.notify(new.assignee_id, 'aufgabe_zugewiesen', 'Neue Aufgabe: ' || new.title,
                           case when new.due_date is not null then 'Fällig am ' || to_char(new.due_date, 'DD.MM.YYYY') end,
                           '/aufgaben?aufgabe=' || new.id::text,
                           'aufgabe_zugewiesen:' || new.id::text || ':' || new.assignee_id::text);
  end if;
  return null;
end;
$$;

create trigger tasks_notify_assignee after insert or update of assignee_id on public.tasks
  for each row execute function private.tasks_notify_assignee();

-- Automatisch erzeugte Aufgabe genau einmal anlegen (auto_key).
create or replace function private.ensure_task(
  p_auto_key text,
  p_title text,
  p_task_type text,
  p_assignee uuid,
  p_due_date date,
  p_dossier_id uuid,
  p_content_item_id uuid default null,
  p_description text default null,
  p_status text default 'offen',
  p_priority text default 'normal',
  p_publish_job_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  insert into public.tasks (auto_key, title, task_type, assignee_id, due_date, dossier_id, content_item_id,
                            description, status, priority, origin, publish_job_id,
                            is_demo)
  values (p_auto_key, p_title, p_task_type, p_assignee, p_due_date, p_dossier_id, p_content_item_id,
          p_description, p_status, p_priority, 'ablauf', p_publish_job_id,
          coalesce((select d.is_demo from public.dossiers d where d.id = p_dossier_id), false))
  on conflict (auto_key) do nothing
  returning id into v_id;
  if v_id is null then
    select t.id into v_id from public.tasks t where t.auto_key = p_auto_key;
  end if;
  return v_id;
end;
$$;

-- Offene Aufgaben eines Typs abschließen
create or replace function private.close_tasks(
  p_task_type text,
  p_dossier_id uuid,
  p_content_item_id uuid default null,
  p_status text default 'erledigt'
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.tasks t
     set status = p_status
   where t.task_type = p_task_type
     and t.status in ('offen', 'in_arbeit', 'wartet_auf_kunde')
     and (p_dossier_id is null or t.dossier_id = p_dossier_id)
     and (p_content_item_id is null or t.content_item_id = p_content_item_id);
end;
$$;

-- -----------------------------------------------------------------------------
-- Versionen & interne Prüfung
-- -----------------------------------------------------------------------------
create or replace function private.ensure_version(p_content_id uuid, p_reason text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item public.content_items;
  v_version public.content_versions;
  v_no integer;
begin
  select * into v_item from public.content_items where id = p_content_id for update;
  if not found then
    raise exception 'Inhalt nicht gefunden.' using errcode = 'P0002';
  end if;
  select * into v_version from public.content_versions
   where content_item_id = p_content_id order by version_no desc limit 1;
  if found and v_version.fingerprint = v_item.fingerprint then
    return v_version.id;
  end if;
  v_no := coalesce(v_version.version_no, 0) + 1;
  insert into public.content_versions (content_item_id, version_no, fingerprint, snapshot, reason, created_by)
  values (p_content_id, v_no, v_item.fingerprint, private.content_snapshot(p_content_id), p_reason, auth.uid())
  returning * into v_version;
  update public.content_items set current_version_no = v_no where id = p_content_id;
  return v_version.id;
end;
$$;

create or replace function public.create_content_version(p_content_id uuid, p_reason text default 'manuell')
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_dossier uuid;
begin
  select c.dossier_id into v_dossier from public.content_items c where c.id = p_content_id;
  if not (private.is_editor() or private.mitarbeit_can_access_dossier(v_dossier)) then
    raise exception 'Keine Berechtigung.' using errcode = '42501';
  end if;
  return private.ensure_version(p_content_id, p_reason);
end;
$$;

create or replace function public.request_internal_review(p_content_id uuid, p_note text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item public.content_items;
  v_version_id uuid;
  v_version_no integer;
begin
  select * into v_item from public.content_items where id = p_content_id;
  if not found then
    raise exception 'Inhalt nicht gefunden.' using errcode = 'P0002';
  end if;
  if not (private.is_editor() or private.mitarbeit_can_access_dossier(v_item.dossier_id)) then
    raise exception 'Keine Berechtigung.' using errcode = '42501';
  end if;
  if v_item.status not in ('entwurf', 'aenderung_gewuenscht', 'interne_pruefung') then
    raise exception 'Der Inhalt befindet sich nicht im Entwurf.' using errcode = 'P0001';
  end if;
  if not v_item.requires_internal_approval then
    raise exception 'Für diesen Inhalt ist keine interne Prüfung vorgesehen.' using errcode = 'P0001';
  end if;

  v_version_id := private.ensure_version(p_content_id, 'interne_pruefung');
  select version_no into v_version_no from public.content_versions where id = v_version_id;
  update public.content_items set status = 'interne_pruefung' where id = p_content_id;

  perform private.close_tasks('entwurf', v_item.dossier_id, p_content_id);
  perform private.close_tasks('aenderungen', v_item.dossier_id, p_content_id);
  perform private.ensure_task('interne_pruefung:' || p_content_id::text || ':' || v_version_id::text,
                              'Interne Prüfung: ' || v_item.title, 'interne_pruefung', null,
                              (now() at time zone 'Europe/Berlin')::date + 2, v_item.dossier_id, p_content_id, p_note);
  perform private.notify_roles(array['admin', 'freigabe'], 'interne_pruefung',
                               'Wartet auf interne Prüfung: ' || v_item.title, p_note,
                               '/beitraege/' || v_item.dossier_id::text || '/inhalte/' || p_content_id::text,
                               'interne_pruefung:' || v_version_id::text);
  perform private.log_event('interne_pruefung_angefordert', 'content_items', p_content_id, v_item.dossier_id, null,
                            format('Interne Prüfung angefordert (Version %s)', v_version_no), null, p_note);
  return v_version_id;
end;
$$;

create or replace function public.decide_internal_review(
  p_content_id uuid,
  p_decision text,
  p_comment text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item public.content_items;
  v_version_id uuid;
  v_version_no integer;
  v_approval_id uuid;
begin
  if not private.is_approver() then
    raise exception 'Nur Freigabe/Leitung oder Admin kann intern freigeben.' using errcode = '42501';
  end if;
  if p_decision not in ('freigegeben', 'aenderung_gewuenscht') then
    raise exception 'Ungültige Entscheidung.' using errcode = '22023';
  end if;
  select * into v_item from public.content_items where id = p_content_id;
  if not found then
    raise exception 'Inhalt nicht gefunden.' using errcode = 'P0002';
  end if;
  if v_item.status not in ('entwurf', 'interne_pruefung', 'aenderung_gewuenscht', 'intern_freigegeben') then
    raise exception 'Der Inhalt kann in diesem Status nicht intern geprüft werden.' using errcode = 'P0001';
  end if;
  if p_decision = 'aenderung_gewuenscht' and coalesce(trim(p_comment), '') = '' then
    raise exception 'Bitte beschreiben Sie die gewünschten Änderungen.' using errcode = '22023';
  end if;

  v_version_id := private.ensure_version(p_content_id, 'interne_pruefung');
  select version_no into v_version_no from public.content_versions where id = v_version_id;

  insert into public.approvals (content_item_id, content_version_id, dossier_id, kind, decision, comment, decided_by)
  values (p_content_id, v_version_id, v_item.dossier_id, 'intern', p_decision, p_comment, auth.uid())
  returning id into v_approval_id;

  if p_decision = 'freigegeben' then
    update public.content_items
       set internal_approval_id = v_approval_id,
           status = case
             when not requires_client_approval then 'freigegeben'
             when private.approval_matches(client_approval_id, id, 'kunde', fingerprint) then 'freigegeben'
             else 'intern_freigegeben'
           end
     where id = p_content_id;
    if v_item.requires_client_approval then
      perform private.ensure_task('kundenvorschau:' || p_content_id::text || ':' || v_version_id::text,
                                  'Kundenvorschau senden: ' || v_item.title, 'kundenvorschau',
                                  coalesce(v_item.assignee_id, (select d.owner_id from public.dossiers d where d.id = v_item.dossier_id)),
                                  (now() at time zone 'Europe/Berlin')::date + 1, v_item.dossier_id, p_content_id);
    else
      perform private.ensure_task('terminierung:' || p_content_id::text || ':' || v_version_id::text,
                                  'Verbindlich terminieren: ' || v_item.title, 'terminierung',
                                  coalesce(v_item.assignee_id, (select d.owner_id from public.dossiers d where d.id = v_item.dossier_id)),
                                  (now() at time zone 'Europe/Berlin')::date + 1, v_item.dossier_id, p_content_id);
    end if;
  else
    -- Die Ablehnung ersetzt eine frühere interne Freigabe derselben Fassung (sie passt nie → nicht freigegeben)
    update public.content_items set status = 'entwurf', internal_approval_id = v_approval_id where id = p_content_id;
    perform private.ensure_task('interne_aenderungen:' || v_approval_id::text,
                                'Interne Anmerkungen umsetzen: ' || v_item.title, 'aenderungen',
                                coalesce(v_item.assignee_id, (select d.owner_id from public.dossiers d where d.id = v_item.dossier_id)),
                                (now() at time zone 'Europe/Berlin')::date + 2, v_item.dossier_id, p_content_id, p_comment,
                                'offen', 'hoch');
  end if;

  perform private.close_tasks('interne_pruefung', v_item.dossier_id, p_content_id);
  perform private.notify(coalesce(v_item.assignee_id, (select d.owner_id from public.dossiers d where d.id = v_item.dossier_id)),
                         'interne_pruefung_entschieden',
                         case when p_decision = 'freigegeben' then 'Intern freigegeben: ' else 'Änderungen gewünscht (intern): ' end || v_item.title,
                         p_comment,
                         '/beitraege/' || v_item.dossier_id::text || '/inhalte/' || p_content_id::text,
                         'interne_entscheidung:' || v_approval_id::text);
  perform private.log_event(case when p_decision = 'freigegeben' then 'intern_freigegeben' else 'intern_aenderung_gewuenscht' end,
                            'content_items', p_content_id, v_item.dossier_id, null,
                            format('%s (Version %s)', case when p_decision = 'freigegeben' then 'Intern freigegeben' else 'Interne Änderungswünsche' end, v_version_no),
                            null, p_comment);
  return v_approval_id;
end;
$$;
