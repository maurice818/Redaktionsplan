-- =============================================================================
-- Grafikaufgaben automatisch abschließen, sobald einem Inhalt ein finales
-- Medium zugeordnet ist (Schritt 7 des Ablaufs).
-- =============================================================================

create or replace function private.close_graphic_tasks_for_content(p_content_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.content_media cm
      join public.media_assets m on m.id = cm.media_asset_id
     where cm.content_item_id = p_content_id and m.status = 'final'
  ) then
    update public.tasks
       set status = 'erledigt'
     where content_item_id = p_content_id
       and task_type = 'grafik'
       and origin = 'ablauf'
       and status in ('offen', 'in_arbeit');
  end if;
end;
$$;

create or replace function private.content_media_close_graphics()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.close_graphic_tasks_for_content(new.content_item_id);
  return null;
end;
$$;

create trigger content_media_close_graphics after insert on public.content_media
  for each row execute function private.content_media_close_graphics();

create or replace function private.media_final_close_graphics()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_content uuid;
begin
  if new.status = 'final' and old.status is distinct from 'final' then
    for v_content in select cm.content_item_id from public.content_media cm where cm.media_asset_id = new.id loop
      perform private.close_graphic_tasks_for_content(v_content);
    end loop;
  end if;
  return null;
end;
$$;

create trigger media_assets_final_close_graphics after update of status on public.media_assets
  for each row execute function private.media_final_close_graphics();

revoke all on function private.close_graphic_tasks_for_content(uuid) from public, anon, authenticated;
revoke all on function private.content_media_close_graphics() from public, anon, authenticated;
revoke all on function private.media_final_close_graphics() from public, anon, authenticated;
