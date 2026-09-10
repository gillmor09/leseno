-- Check whether a child Kennung is free (for onboarding blur validation).

create or replace function public.is_child_login_code_available(p_code text)
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
  );
end;
$$;

revoke all on function public.is_child_login_code_available(text) from public;
grant execute on function public.is_child_login_code_available(text) to authenticated;
