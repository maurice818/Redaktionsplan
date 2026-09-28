-- =============================================================================
-- Notizen in der Historie einer Beitragsakte bzw. Kundenakte und manuell
-- erfasste Kennzahlen (nur echte Werte, Herkunft wird gespeichert).
-- =============================================================================

create or replace function public.add_note(p_dossier_id uuid, p_client_id uuid, p_text text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_client uuid := p_client_id;
begin
  if coalesce(trim(p_text), '') = '' then
    raise exception 'Bitte einen Text eingeben.' using errcode = '22023';
  end if;
  if p_dossier_id is not null then
    if not private.can_read_dossier(p_dossier_id) then
      raise exception 'Keine Berechtigung.' using errcode = '42501';
    end if;
    select d.client_id into v_client from public.dossiers d where d.id = p_dossier_id;
  elsif not private.is_editor() then
    raise exception 'Keine Berechtigung.' using errcode = '42501';
  end if;
  perform private.log_event('notiz', case when p_dossier_id is not null then 'dossiers' else 'clients' end,
                            coalesce(p_dossier_id, p_client_id), p_dossier_id, v_client, left(trim(p_text), 4000));
end;
$$;

create or replace function public.record_content_metrics(
  p_content_id uuid,
  p_reach integer,
  p_impressions integer,
  p_clicks integer,
  p_note text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item public.content_items;
begin
  select * into v_item from public.content_items where id = p_content_id;
  if not found then
    raise exception 'Inhalt nicht gefunden.' using errcode = 'P0002';
  end if;
  if not private.can_read_dossier(v_item.dossier_id) then
    raise exception 'Keine Berechtigung.' using errcode = '42501';
  end if;
  if v_item.status <> 'veroeffentlicht' then
    raise exception 'Kennzahlen können erst nach der Veröffentlichung erfasst werden.' using errcode = 'P0001';
  end if;
  if coalesce(p_reach, p_impressions, p_clicks) is null then
    update public.content_items set metrics = null where id = p_content_id;
    return;
  end if;
  if least(coalesce(p_reach, 0), coalesce(p_impressions, 0), coalesce(p_clicks, 0)) < 0 then
    raise exception 'Kennzahlen dürfen nicht negativ sein.' using errcode = '22023';
  end if;
  update public.content_items
     set metrics = jsonb_strip_nulls(jsonb_build_object(
           'reach', p_reach, 'impressions', p_impressions, 'clicks', p_clicks,
           'source', 'manuell', 'note', nullif(trim(coalesce(p_note, '')), ''),
           'recorded_at', now(), 'recorded_by', private.actor_label()))
   where id = p_content_id;
end;
$$;

revoke all on function public.add_note(uuid, uuid, text) from public, anon;
revoke all on function public.record_content_metrics(uuid, integer, integer, integer, text) from public, anon;
grant execute on function public.add_note(uuid, uuid, text) to authenticated;
grant execute on function public.record_content_metrics(uuid, integer, integer, integer, text) to authenticated;
