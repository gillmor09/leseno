-- Fix ambiguous user_id in get_my_world (RETURNS TABLE vs table column).

create or replace function public.get_my_world()
returns table (
  user_id uuid,
  display_name text,
  friends jsonb,
  interests jsonb,
  experiences jsonb
)
language plpgsql
security definer
set search_path = public, leseno
as $$
#variable_conflict use_column
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Nicht angemeldet.';
  end if;

  insert into leseno.user_world as w (user_id)
  values (uid)
  on conflict (user_id) do nothing;

  return query
  select
    w.user_id,
    w.display_name,
    w.friends,
    w.interests,
    w.experiences
  from leseno.user_world as w
  where w.user_id = uid;
end;
$$;
