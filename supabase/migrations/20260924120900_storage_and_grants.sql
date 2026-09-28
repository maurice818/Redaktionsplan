-- =============================================================================
-- Geschützter Dateispeicher und abschließende Rechtevergabe.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Storage-Bucket "media" (privat). Pfade:
--   dossiers/{dossier_id}/{uuid}-{dateiname}   – interne Uploads
--   material/{material_request_id}/{uuid}-…     – Kunden-Uploads (signierte Upload-URL)
-- Kein öffentlicher Zugriff; Anzeige nur über kurzlebige signierte URLs.
-- Größenlimit: bewusst ohne Bucket-Limit (es gilt das Projektlimit, auf dem
-- Free-Plan 50 MB). Die App prüft Größe/Typ je Formatregel zusätzlich.
-- -----------------------------------------------------------------------------
create or replace function private.try_uuid(p_value text)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
begin
  return p_value::uuid;
exception when others then
  return null;
end;
$$;

insert into storage.buckets (id, name, public, allowed_mime_types)
values ('media', 'media', false,
        array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/tiff', 'image/bmp',
              'video/mp4', 'video/quicktime', 'application/pdf'])
on conflict (id) do update
  set public = false,
      allowed_mime_types = excluded.allowed_mime_types;

create policy "Medien-Speicher: lesen"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'media' and (
      (select private.is_editor())
      or ((storage.foldername(name))[1] = 'dossiers'
          and private.mitarbeit_can_access_dossier(private.try_uuid((storage.foldername(name))[2])))
      or ((storage.foldername(name))[1] = 'material' and exists (
            select 1 from public.material_requests r
             where r.id::text = (storage.foldername(name))[2]
               and private.mitarbeit_can_access_dossier(r.dossier_id)))
    )
  );

create policy "Medien-Speicher: hochladen"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'media'
    and (storage.foldername(name))[1] = 'dossiers'
    and ((select private.is_editor())
         or private.mitarbeit_can_access_dossier(private.try_uuid((storage.foldername(name))[2])))
  );

create policy "Medien-Speicher: ersetzen"
  on storage.objects for update to authenticated
  using (bucket_id = 'media' and (select private.is_editor()))
  with check (bucket_id = 'media' and (select private.is_editor()));

create policy "Medien-Speicher: löschen"
  on storage.objects for delete to authenticated
  using (bucket_id = 'media' and (select private.is_editor()));

-- -----------------------------------------------------------------------------
-- Tabellenrechte: anon erhält keinerlei direkten Tabellenzugriff.
-- -----------------------------------------------------------------------------
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;

grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;

-- Geheimnisse & interne Sperren: nur Service-Rolle
revoke all on public.platform_credentials from authenticated;
revoke all on public.job_locks from authenticated;

-- -----------------------------------------------------------------------------
-- Funktionsrechte: zunächst alles entziehen, dann gezielt vergeben.
-- Supabase vergibt für neue Funktionen standardmäßig EXECUTE an anon und
-- authenticated – das wird hier für künftige Migrationen abgeschaltet, sodass
-- jede neue Funktion ausdrücklich freigegeben werden muss.
-- -----------------------------------------------------------------------------
alter default privileges in schema public revoke execute on functions from anon, authenticated;
alter default privileges in schema private revoke execute on functions from anon, authenticated;
do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as sig
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname in ('public', 'private')
       and p.prokind = 'f'
  loop
    execute format('revoke all on function %s from public', r.sig);
    execute format('revoke all on function %s from anon', r.sig);
    execute format('revoke all on function %s from authenticated', r.sig);
  end loop;
end;
$$;

-- Hilfsfunktionen, die in RLS-Policies verwendet werden (Schema "private" ist nicht per API erreichbar)
grant execute on function private.current_role_key() to authenticated, service_role;
grant execute on function private.is_internal() to authenticated, service_role;
grant execute on function private.has_role(text[]) to authenticated, service_role;
grant execute on function private.is_editor() to authenticated, service_role;
grant execute on function private.is_approver() to authenticated, service_role;
grant execute on function private.is_admin() to authenticated, service_role;
grant execute on function private.mitarbeit_can_access_dossier(uuid) to authenticated, service_role;
grant execute on function private.mitarbeit_can_access_client(uuid) to authenticated, service_role;
grant execute on function private.can_read_dossier(uuid) to authenticated, service_role;
grant execute on function private.try_uuid(text) to authenticated, service_role;

-- Interne Funktionen (angemeldete Teammitglieder; Rollenprüfung erfolgt in der Funktion)
grant execute on function public.book_membership(uuid, uuid, date, date, uuid, boolean, date, text) to authenticated;
grant execute on function public.add_contract_year(uuid) to authenticated;
grant execute on function public.add_deliverable(uuid, uuid, uuid, uuid, text, integer, text, text, date, uuid, text) to authenticated;
grant execute on function public.correct_deliverable(uuid, text, text, uuid, date, text, text, text, text) to authenticated;
grant execute on function public.create_content_version(uuid, text) to authenticated;
grant execute on function public.request_internal_review(uuid, text) to authenticated;
grant execute on function public.decide_internal_review(uuid, text, text) to authenticated;
grant execute on function public.create_preview(uuid, uuid[], text, text, uuid, text, text, text, timestamptz, date) to authenticated;
grant execute on function public.revoke_preview(uuid) to authenticated;
grant execute on function public.revoke_material_request(uuid) to authenticated;
grant execute on function public.review_material_request(uuid, text, text) to authenticated;
grant execute on function public.schedule_content(uuid, text, timestamptz, boolean, uuid, date, date) to authenticated;
grant execute on function public.confirm_manual_publication(uuid, text, timestamptz, text) to authenticated;
grant execute on function public.retry_publish_job(uuid, boolean) to authenticated;
grant execute on function public.cancel_publish_job(uuid, text) to authenticated;
grant execute on function public.search_all(text, integer) to authenticated;
grant execute on function public.admin_load_demo_data() to authenticated;
grant execute on function public.admin_remove_demo_data() to authenticated;

-- Kundenzugang per Token (ohne Konto)
grant execute on function public.public_get_material_request(text) to anon, authenticated;
grant execute on function public.public_save_material_response(text, jsonb, boolean, text, text) to anon, authenticated;
grant execute on function public.public_material_upload_target(text) to anon, authenticated;
grant execute on function public.public_register_material_file(text, text, text, text, bigint, integer, integer, text, text) to anon, authenticated;
grant execute on function public.public_remove_material_file(text, uuid) to anon, authenticated;
grant execute on function public.public_get_preview(text) to anon, authenticated;
grant execute on function public.public_submit_preview_decisions(text, jsonb, text, text, text, boolean) to anon, authenticated;

-- Hintergrundprozess (nur Service-Rolle, serverseitig)
grant execute on function public.acquire_job_lock(text, uuid, integer) to service_role;
grant execute on function public.release_job_lock(text, uuid) to service_role;
grant execute on function public.claim_reminder(text, uuid, integer, uuid) to service_role;
grant execute on function public.record_reminder_outcome(text, uuid, integer, jsonb) to service_role;
grant execute on function public.system_notify(uuid, text, text, text, text, text) to service_role;
grant execute on function public.system_ensure_task(text, text, text, uuid, date, uuid, uuid, text, text) to service_role;
grant execute on function public.claim_due_publish_jobs(uuid, integer) to service_role;
grant execute on function public.mark_stale_publish_jobs(integer) to service_role;
grant execute on function public.record_publish_attempt(uuid, uuid, text, text, integer, jsonb, jsonb, text) to service_role;
grant execute on function public.finish_publish_job(uuid, uuid, text, text, text, timestamptz, text, timestamptz, text) to service_role;
