-- Allow parents to set a custom child Kennung (username) after create / onboarding.

create or replace function public.set_my_child_login_code(
  p_id uuid,
  p_code text
)
returns void
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
  if p_id is null then
    raise exception 'Profil-ID fehlt.';
  end if;
  if char_length(code) < 4 or char_length(code) > 24 then
    raise exception 'Kennung: 4 bis 24 Zeichen.';
  end if;
  if code !~ '^[a-z0-9_-]+$' then
    raise exception 'Kennung: nur Buchstaben, Zahlen, _ und -.';
  end if;

  if exists (
    select 1
    from leseno.child_profiles as p
    where p.login_code = code
      and p.id is distinct from p_id
  ) then
    raise exception 'Diese Kennung ist schon vergeben.';
  end if;

  update leseno.child_profiles
  set login_code = code,
      updated_at = now()
  where id = p_id
    and user_id = uid;

  if not found then
    raise exception 'Profil nicht gefunden.';
  end if;
end;
$$;

revoke all on function public.set_my_child_login_code(uuid, text) from public;
grant execute on function public.set_my_child_login_code(uuid, text) to authenticated;
