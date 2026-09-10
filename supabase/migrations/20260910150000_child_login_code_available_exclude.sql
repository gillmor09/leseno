-- Availability check may exclude the current profile (Kennung edit).

drop function if exists public.is_child_login_code_available(text);

create function public.is_child_login_code_available(
  p_code text,
  p_exclude_id uuid default null
)
returns boolean
language plpgsql
security definer
set search_path = public, leseno
as $$
declare
  uid uuid := auth.uid();
  code text := lower(trim(coalesce(p_code, '')));
begin
  if uid is null then
    raise exception 'Nicht angemeldet.';
  end if;
  if code = '' then
    return false;
  end if;

  return not exists (
    select 1
    from leseno.child_profiles as p
    where p.login_code = code
      and (p_exclude_id is null or p.id is distinct from p_exclude_id)
  );
end;
$$;

revoke all on function public.is_child_login_code_available(text, uuid) from public;
grant execute on function public.is_child_login_code_available(text, uuid) to authenticated;
