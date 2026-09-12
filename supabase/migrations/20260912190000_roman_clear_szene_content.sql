-- Admin: clear scene writing content (keep row + briefing), not delete scenes.

drop function if exists public.admin_delete_szene(uuid);
drop function if exists public.admin_delete_roman_kapitel(uuid, integer);

create or replace function public.admin_clear_szene_content(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = leseno, public
as $$
begin
  update leseno.szenen s
  set
    status = 'READY_FOR_WRITING',
    entwurf_raw = '',
    feedback_lektor = '',
    feedback_fan = '',
    entwurf_revidiert = ''
  where s.id = p_id;
  return found;
end;
$$;

revoke all on function public.admin_clear_szene_content(uuid) from public;
grant execute on function public.admin_clear_szene_content(uuid) to service_role;

create or replace function public.admin_clear_roman_kapitel_content(
  p_roman_id uuid,
  p_kapitel_nr integer
)
returns integer
language plpgsql
security definer
set search_path = leseno, public
as $$
declare
  v_count integer := 0;
begin
  if p_kapitel_nr is null or p_kapitel_nr < 1 then
    raise exception 'Ungültige Kapitelnummer.';
  end if;

  with updated as (
    update leseno.szenen
    set
      status = 'READY_FOR_WRITING',
      entwurf_raw = '',
      feedback_lektor = '',
      feedback_fan = '',
      entwurf_revidiert = ''
    where roman_id = p_roman_id
      and kapitel_nr = p_kapitel_nr
    returning 1
  )
  select count(*)::integer into v_count from updated;

  return v_count;
end;
$$;

revoke all on function public.admin_clear_roman_kapitel_content(uuid, integer) from public;
grant execute on function public.admin_clear_roman_kapitel_content(uuid, integer)
  to service_role;
