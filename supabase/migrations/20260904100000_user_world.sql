-- Personal "Meine Welt" profile: display name, friends, interests,
-- and wish-list experiences ("Das möchte ich mal erleben", not past events).
-- Accessed via public RPCs because PostgREST does not expose schema `leseno`.

create table if not exists leseno.user_world (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '',
  friends jsonb not null default '[]'::jsonb,
  interests jsonb not null default '[]'::jsonb,
  experiences jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  constraint user_world_friends_is_array check (jsonb_typeof(friends) = 'array'),
  constraint user_world_interests_is_array check (jsonb_typeof(interests) = 'array'),
  constraint user_world_experiences_is_array check (jsonb_typeof(experiences) = 'array')
);

drop trigger if exists user_world_set_updated_at on leseno.user_world;
create trigger user_world_set_updated_at
before update on leseno.user_world
for each row
execute function leseno.set_updated_at();

alter table leseno.user_world enable row level security;

drop policy if exists user_world_select_self on leseno.user_world;
create policy user_world_select_self
on leseno.user_world for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists user_world_insert_self on leseno.user_world;
create policy user_world_insert_self
on leseno.user_world for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists user_world_update_self on leseno.user_world;
create policy user_world_update_self
on leseno.user_world for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

grant select, insert, update on leseno.user_world to authenticated;
grant all on leseno.user_world to service_role;

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

create or replace function public.upsert_my_world(
  p_display_name text,
  p_friends jsonb,
  p_interests jsonb,
  p_experiences jsonb
)
returns void
language plpgsql
security definer
set search_path = public, leseno
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Nicht angemeldet.';
  end if;

  if jsonb_typeof(p_friends) is distinct from 'array'
     or jsonb_typeof(p_interests) is distinct from 'array'
     or jsonb_typeof(p_experiences) is distinct from 'array' then
    raise exception 'Listen müssen JSON-Arrays sein.';
  end if;

  insert into leseno.user_world (
    user_id,
    display_name,
    friends,
    interests,
    experiences
  )
  values (
    uid,
    coalesce(trim(p_display_name), ''),
    p_friends,
    p_interests,
    p_experiences
  )
  on conflict (user_id) do update
  set display_name = excluded.display_name,
      friends = excluded.friends,
      interests = excluded.interests,
      experiences = excluded.experiences;
end;
$$;

grant execute on function public.get_my_world() to authenticated, service_role;
grant execute on function public.upsert_my_world(text, jsonb, jsonb, jsonb) to authenticated, service_role;
