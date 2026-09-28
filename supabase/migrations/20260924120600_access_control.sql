-- =============================================================================
-- Zugriffskontrolle: Row Level Security für alle Tabellen und Rechte-Vergabe.
--
-- Rollen
--   admin      – alles inkl. Einstellungen, Pakete, Team, Integrationen
--   redaktion  – Kunden, Leistungen, Themen, Inhalte, Aufgaben bearbeiten
--   freigabe   – wie Redaktion, zusätzlich interne Freigabe & verbindliche Planung
--   mitarbeit  – nur zugewiesene Akten, Inhalte und Aufgaben
--   anon       – KEIN Tabellenzugriff; Kunden nur über public_*-Funktionen
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Zugriffshilfen für "Mitarbeit"
-- -----------------------------------------------------------------------------
create or replace function private.mitarbeit_can_access_dossier(p_dossier_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_role('mitarbeit') and p_dossier_id is not null and (
    exists (select 1 from public.dossiers d where d.id = p_dossier_id and d.owner_id = auth.uid())
    or exists (select 1 from public.tasks t where t.dossier_id = p_dossier_id and t.assignee_id = auth.uid())
    or exists (select 1 from public.content_items c where c.dossier_id = p_dossier_id and c.assignee_id = auth.uid())
  )
$$;

create or replace function private.can_read_dossier(p_dossier_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_editor() or private.mitarbeit_can_access_dossier(p_dossier_id)
$$;

create or replace function private.mitarbeit_can_access_client(p_client_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_role('mitarbeit') and exists (
    select 1 from public.dossiers d
     where d.client_id = p_client_id and private.mitarbeit_can_access_dossier(d.id)
  )
$$;

-- -----------------------------------------------------------------------------
-- RLS aktivieren
-- -----------------------------------------------------------------------------
alter table public.service_types enable row level security;
alter table public.package_templates enable row level security;
alter table public.package_template_items enable row level security;
alter table public.clients enable row level security;
alter table public.contacts enable row level security;
alter table public.contracts enable row level security;
alter table public.contract_years enable row level security;
alter table public.deliverables enable row level security;
alter table public.campaigns enable row level security;
alter table public.ideas enable row level security;
alter table public.dossiers enable row level security;
alter table public.media_assets enable row level security;
alter table public.content_items enable row level security;
alter table public.content_versions enable row level security;
alter table public.approvals enable row level security;
alter table public.content_media enable row level security;
alter table public.format_rules enable row level security;
alter table public.tasks enable row level security;
alter table public.material_forms enable row level security;
alter table public.material_requests enable row level security;
alter table public.material_responses enable row level security;
alter table public.previews enable row level security;
alter table public.preview_items enable row level security;
alter table public.email_templates enable row level security;
alter table public.email_events enable row level security;
alter table public.reminder_rules enable row level security;
alter table public.reminder_log enable row level security;
alter table public.job_runs enable row level security;
alter table public.platform_accounts enable row level security;
alter table public.publish_jobs enable row level security;
alter table public.publish_attempts enable row level security;

-- -----------------------------------------------------------------------------
-- Konfiguration (alle intern lesen, nur Admin schreibt)
-- -----------------------------------------------------------------------------
create policy "Leistungstypen: intern lesen" on public.service_types for select to authenticated
  using ((select private.is_internal()));
create policy "Leistungstypen: Admin schreibt" on public.service_types for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

create policy "Paketvorlagen: intern lesen" on public.package_templates for select to authenticated
  using ((select private.is_internal()));
create policy "Paketvorlagen: Admin schreibt" on public.package_templates for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

create policy "Paketpositionen: intern lesen" on public.package_template_items for select to authenticated
  using ((select private.is_internal()));
create policy "Paketpositionen: Admin schreibt" on public.package_template_items for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

create policy "Formatregeln: intern lesen" on public.format_rules for select to authenticated
  using ((select private.is_internal()));
create policy "Formatregeln: Admin schreibt" on public.format_rules for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

create policy "E-Mail-Vorlagen: intern lesen" on public.email_templates for select to authenticated
  using ((select private.is_internal()));
create policy "E-Mail-Vorlagen: Admin schreibt" on public.email_templates for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

create policy "Erinnerungsregeln: intern lesen" on public.reminder_rules for select to authenticated
  using ((select private.is_internal()));
create policy "Erinnerungsregeln: Admin schreibt" on public.reminder_rules for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

create policy "Materialformulare: intern lesen" on public.material_forms for select to authenticated
  using ((select private.is_internal()));
create policy "Materialformulare: Admin schreibt" on public.material_forms for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

create policy "Plattformkonten: intern lesen" on public.platform_accounts for select to authenticated
  using ((select private.is_internal()));
create policy "Plattformkonten: Admin schreibt" on public.platform_accounts for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

-- -----------------------------------------------------------------------------
-- Kunden & Leistungskonto
-- -----------------------------------------------------------------------------
create policy "Kunden: lesen" on public.clients for select to authenticated
  using ((select private.is_editor()) or private.mitarbeit_can_access_client(id));
create policy "Kunden: anlegen" on public.clients for insert to authenticated
  with check ((select private.is_editor()));
create policy "Kunden: ändern" on public.clients for update to authenticated
  using ((select private.is_editor())) with check ((select private.is_editor()));
create policy "Kunden: löschen (Admin)" on public.clients for delete to authenticated
  using ((select private.is_admin()));

create policy "Ansprechpartner: lesen" on public.contacts for select to authenticated
  using ((select private.is_editor()) or private.mitarbeit_can_access_client(client_id));
create policy "Ansprechpartner: anlegen" on public.contacts for insert to authenticated
  with check ((select private.is_editor()));
create policy "Ansprechpartner: ändern" on public.contacts for update to authenticated
  using ((select private.is_editor())) with check ((select private.is_editor()));
create policy "Ansprechpartner: löschen" on public.contacts for delete to authenticated
  using ((select private.is_editor()));

create policy "Verträge: lesen" on public.contracts for select to authenticated
  using ((select private.is_editor()) or private.mitarbeit_can_access_client(client_id));
create policy "Verträge: ändern" on public.contracts for update to authenticated
  using ((select private.is_editor())) with check ((select private.is_editor()));
create policy "Verträge: löschen (Admin)" on public.contracts for delete to authenticated
  using ((select private.is_admin()));
-- Anlegen ausschließlich über book_membership()

create policy "Vertragsjahre: lesen" on public.contract_years for select to authenticated
  using ((select private.is_editor()) or exists (
    select 1 from public.contracts c where c.id = contract_id and private.mitarbeit_can_access_client(c.client_id)));
create policy "Vertragsjahre: ändern (Admin)" on public.contract_years for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "Vertragsjahre: löschen (Admin)" on public.contract_years for delete to authenticated
  using ((select private.is_admin()));

create policy "Leistungen: lesen" on public.deliverables for select to authenticated
  using ((select private.is_editor()) or private.mitarbeit_can_access_client(client_id));
create policy "Leistungen: ändern" on public.deliverables for update to authenticated
  using ((select private.is_editor())) with check ((select private.is_editor()));
create policy "Leistungen: löschen (Admin)" on public.deliverables for delete to authenticated
  using ((select private.is_admin()));
-- Anlegen über book_membership(), add_contract_year(), add_deliverable()

-- -----------------------------------------------------------------------------
-- Kampagnen & Ideen
-- -----------------------------------------------------------------------------
create policy "Kampagnen: intern lesen" on public.campaigns for select to authenticated
  using ((select private.is_internal()));
create policy "Kampagnen: anlegen" on public.campaigns for insert to authenticated
  with check ((select private.is_editor()));
create policy "Kampagnen: ändern" on public.campaigns for update to authenticated
  using ((select private.is_editor())) with check ((select private.is_editor()));
create policy "Kampagnen: löschen" on public.campaigns for delete to authenticated
  using ((select private.is_editor()));

create policy "Ideen: intern lesen" on public.ideas for select to authenticated
  using ((select private.is_internal()));
create policy "Ideen: intern anlegen" on public.ideas for insert to authenticated
  with check ((select private.is_internal()));
create policy "Ideen: ändern" on public.ideas for update to authenticated
  using ((select private.is_editor()) or created_by = (select auth.uid()))
  with check ((select private.is_editor()) or created_by = (select auth.uid()));
create policy "Ideen: löschen" on public.ideas for delete to authenticated
  using ((select private.is_editor()) or created_by = (select auth.uid()));

-- -----------------------------------------------------------------------------
-- Beitragsakten & Inhalte
-- -----------------------------------------------------------------------------
create policy "Akten: lesen" on public.dossiers for select to authenticated
  using ((select private.is_editor()) or private.mitarbeit_can_access_dossier(id));
create policy "Akten: anlegen" on public.dossiers for insert to authenticated
  with check ((select private.is_editor()));
create policy "Akten: ändern" on public.dossiers for update to authenticated
  using ((select private.is_editor()) or private.mitarbeit_can_access_dossier(id))
  with check ((select private.is_editor()) or private.mitarbeit_can_access_dossier(id));
create policy "Akten: löschen" on public.dossiers for delete to authenticated
  using ((select private.is_editor()));

create policy "Inhalte: lesen" on public.content_items for select to authenticated
  using ((select private.is_editor()) or private.mitarbeit_can_access_dossier(dossier_id));
create policy "Inhalte: anlegen" on public.content_items for insert to authenticated
  with check ((select private.is_editor()) or private.mitarbeit_can_access_dossier(dossier_id));
create policy "Inhalte: ändern" on public.content_items for update to authenticated
  using ((select private.is_editor()) or private.mitarbeit_can_access_dossier(dossier_id))
  with check ((select private.is_editor()) or private.mitarbeit_can_access_dossier(dossier_id));
create policy "Inhalte: löschen" on public.content_items for delete to authenticated
  using ((select private.is_admin())
         or ((select private.is_editor()) and status in ('entwurf', 'archiviert') and published_at is null));

create policy "Versionen: lesen" on public.content_versions for select to authenticated
  using (exists (select 1 from public.content_items c where c.id = content_item_id
                 and private.can_read_dossier(c.dossier_id)));

create policy "Freigaben: lesen" on public.approvals for select to authenticated
  using (private.can_read_dossier(dossier_id));

create policy "Medienzuordnung: lesen" on public.content_media for select to authenticated
  using (exists (select 1 from public.content_items c where c.id = content_item_id
                 and private.can_read_dossier(c.dossier_id)));
create policy "Medienzuordnung: anlegen" on public.content_media for insert to authenticated
  with check (exists (select 1 from public.content_items c where c.id = content_item_id
                      and private.can_read_dossier(c.dossier_id)));
create policy "Medienzuordnung: ändern" on public.content_media for update to authenticated
  using (exists (select 1 from public.content_items c where c.id = content_item_id and private.can_read_dossier(c.dossier_id)))
  with check (exists (select 1 from public.content_items c where c.id = content_item_id and private.can_read_dossier(c.dossier_id)));
create policy "Medienzuordnung: löschen" on public.content_media for delete to authenticated
  using (exists (select 1 from public.content_items c where c.id = content_item_id
                 and private.can_read_dossier(c.dossier_id)));

create policy "Medien: lesen" on public.media_assets for select to authenticated
  using ((select private.is_editor()) or private.mitarbeit_can_access_dossier(dossier_id));
create policy "Medien: anlegen" on public.media_assets for insert to authenticated
  with check ((select private.is_editor()) or private.mitarbeit_can_access_dossier(dossier_id));
create policy "Medien: ändern" on public.media_assets for update to authenticated
  using ((select private.is_editor()) or private.mitarbeit_can_access_dossier(dossier_id))
  with check ((select private.is_editor()) or private.mitarbeit_can_access_dossier(dossier_id));
create policy "Medien: löschen" on public.media_assets for delete to authenticated
  using ((select private.is_editor()));

-- -----------------------------------------------------------------------------
-- Aufgaben
-- -----------------------------------------------------------------------------
create policy "Aufgaben: lesen" on public.tasks for select to authenticated
  using ((select private.is_editor())
         or ((select private.is_internal()) and (assignee_id = (select auth.uid()) or created_by = (select auth.uid())))
         or private.mitarbeit_can_access_dossier(dossier_id));
create policy "Aufgaben: anlegen" on public.tasks for insert to authenticated
  with check ((select private.is_editor())
              or ((select private.is_internal()) and assignee_id = (select auth.uid()) and dossier_id is null)
              or private.mitarbeit_can_access_dossier(dossier_id));
create policy "Aufgaben: ändern" on public.tasks for update to authenticated
  using ((select private.is_editor())
         or ((select private.is_internal()) and (assignee_id = (select auth.uid()) or created_by = (select auth.uid()))))
  with check ((select private.is_editor())
              or ((select private.is_internal()) and (assignee_id = (select auth.uid()) or created_by = (select auth.uid()))));
create policy "Aufgaben: löschen" on public.tasks for delete to authenticated
  using ((select private.is_editor()) or (origin = 'manuell' and created_by = (select auth.uid())));

-- -----------------------------------------------------------------------------
-- Kundenzugang (intern verwaltet)
-- -----------------------------------------------------------------------------
create policy "Materialanfragen: lesen" on public.material_requests for select to authenticated
  using (private.can_read_dossier(dossier_id));
create policy "Materialanfragen: anlegen" on public.material_requests for insert to authenticated
  with check ((select private.is_editor()));
create policy "Materialanfragen: ändern" on public.material_requests for update to authenticated
  using ((select private.is_editor())) with check ((select private.is_editor()));

create policy "Materialantworten: lesen" on public.material_responses for select to authenticated
  using (exists (select 1 from public.material_requests r where r.id = request_id
                 and private.can_read_dossier(r.dossier_id)));

create policy "Vorschauen: lesen" on public.previews for select to authenticated
  using (private.can_read_dossier(dossier_id));
create policy "Vorschauen: ändern" on public.previews for update to authenticated
  using ((select private.is_editor())) with check ((select private.is_editor()));

create policy "Vorschau-Inhalte: lesen" on public.preview_items for select to authenticated
  using (exists (select 1 from public.previews p where p.id = preview_id and private.can_read_dossier(p.dossier_id)));

-- -----------------------------------------------------------------------------
-- Protokolle & Veröffentlichung
-- -----------------------------------------------------------------------------
create policy "E-Mail-Protokoll: lesen" on public.email_events for select to authenticated
  using ((select private.is_editor()) or (dossier_id is not null and private.mitarbeit_can_access_dossier(dossier_id)));

create policy "Erinnerungsprotokoll: lesen" on public.reminder_log for select to authenticated
  using ((select private.is_editor()));

create policy "Hintergrundläufe: lesen" on public.job_runs for select to authenticated
  using ((select private.is_editor()));

create policy "Aufträge: lesen" on public.publish_jobs for select to authenticated
  using (private.can_read_dossier(dossier_id));

create policy "Versuche: lesen" on public.publish_attempts for select to authenticated
  using (exists (select 1 from public.publish_jobs j where j.id = job_id and private.can_read_dossier(j.dossier_id)));

create policy "Audit-Log: lesen" on public.audit_log for select to authenticated
  using ((select private.is_editor()) or (dossier_id is not null and private.mitarbeit_can_access_dossier(dossier_id)));
