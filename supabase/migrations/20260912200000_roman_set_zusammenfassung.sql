-- Set / replace the running manuscript summary (after clearing scene content).

create or replace function public.admin_set_roman_zusammenfassung(
  p_roman_id uuid,
  p_text text
)
returns text
language plpgsql
security definer
set search_path = leseno, public
as $$
declare
  v_result text;
begin
  update leseno.roman_kontext r
  set aktuelle_zusammenfassung = coalesce(p_text, '')
  where r.id = p_roman_id
  returning r.aktuelle_zusammenfassung into v_result;

  if not found then
    raise exception 'Roman nicht gefunden.';
  end if;

  return coalesce(v_result, '');
end;
$$;

revoke all on function public.admin_set_roman_zusammenfassung(uuid, text)
  from public;
grant execute on function public.admin_set_roman_zusammenfassung(uuid, text)
  to service_role;
