-- Multi-child Meine Welt: one auth user → many child profiles.
-- Migrates existing leseno.user_world rows into leseno.child_profiles.

create table if not exists leseno.child_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  display_name text not null default '',
  friends jsonb not null default '[]'::jsonb,
  interests jsonb not null default '[]'::jsonb,
  experiences jsonb not null default '[]'::jsonb,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint child_profiles_friends_is_array check (jsonb_typeof(friends) = 'array'),
  constraint child_profiles_interests_is_array check (jsonb_typeof(interests) = 'array'),
  constraint child_profiles_experiences_is_array check (jsonb_typeof(experiences) = 'array')
);

create index if not exists child_profiles_user_id_sort_idx
  on leseno.child_profiles (user_id, sort_order, created_at);

drop trigger if exists child_profiles_set_updated_at on leseno.child_profiles;
create trigger child_profiles_set_updated_at
before update on leseno.child_profiles
for each row
execute function leseno.set_updated_at();

alter table leseno.child_profiles enable row level security;

drop policy if exists child_profiles_select_self on leseno.child_profiles;
create policy child_profiles_select_self
on leseno.child_profiles for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists child_profiles_insert_self on leseno.child_profiles;
create policy child_profiles_insert_self
on leseno.child_profiles for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists child_profiles_update_self on leseno.child_profiles;
create policy child_profiles_update_self
on leseno.child_profiles for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists child_profiles_delete_self on leseno.child_profiles;
create policy child_profiles_delete_self
on leseno.child_profiles for delete
to authenticated
using (auth.uid() = user_id);

grant select, insert, update, delete on leseno.child_profiles to authenticated;
grant all on leseno.child_profiles to service_role;

-- Migrate legacy single-row worlds (skip if a profile already exists for the user)
insert into leseno.child_profiles (
  user_id,
  display_name,
  friends,
  interests,
  experiences,
  sort_order
)
select
  w.user_id,
  w.display_name,
  w.friends,
  w.interests,
  w.experiences,
  0
from leseno.user_world as w
where not exists (
  select 1 from leseno.child_profiles as p where p.user_id = w.user_id
);

create or replace function public.list_my_child_profiles()
returns table (
  id uuid,
  display_name text,
  friends jsonb,
  interests jsonb,
  experiences jsonb,
  sort_order integer
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

  return query
  select
    p.id,
    p.display_name,
    p.friends,
    p.interests,
    p.experiences,
    p.sort_order
  from leseno.child_profiles as p
  where p.user_id = uid
  order by p.sort_order asc, p.created_at asc;
end;
$$;

create or replace function public.upsert_my_child_profile(
  p_id uuid,
  p_display_name text,
  p_friends jsonb,
  p_interests jsonb,
  p_experiences jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, leseno
as $$
declare
  uid uuid := auth.uid();
  result_id uuid;
  next_sort integer;
  profile_count integer;
begin
  if uid is null then
    raise exception 'Nicht angemeldet.';
  end if;

  if jsonb_typeof(p_friends) is distinct from 'array'
     or jsonb_typeof(p_interests) is distinct from 'array'
     or jsonb_typeof(p_experiences) is distinct from 'array' then
    raise exception 'Listen müssen JSON-Arrays sein.';
  end if;

  if p_id is not null then
    update leseno.child_profiles
    set display_name = coalesce(trim(p_display_name), ''),
        friends = p_friends,
        interests = p_interests,
        experiences = p_experiences
    where id = p_id
      and user_id = uid
    returning id into result_id;

    if result_id is null then
      raise exception 'Profil nicht gefunden.';
    end if;

    return result_id;
  end if;

  select count(*)::integer into profile_count
  from leseno.child_profiles
  where user_id = uid;

  if profile_count >= 10 then
    raise exception 'Maximal 10 Kinder-Profile möglich.';
  end if;

  select coalesce(max(sort_order), -1) + 1 into next_sort
  from leseno.child_profiles
  where user_id = uid;

  insert into leseno.child_profiles (
    user_id,
    display_name,
    friends,
    interests,
    experiences,
    sort_order
  )
  values (
    uid,
    coalesce(trim(p_display_name), ''),
    p_friends,
    p_interests,
    p_experiences,
    next_sort
  )
  returning id into result_id;

  return result_id;
end;
$$;

create or replace function public.delete_my_child_profile(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public, leseno
as $$
declare
  uid uuid := auth.uid();
  deleted integer;
begin
  if uid is null then
    raise exception 'Nicht angemeldet.';
  end if;

  delete from leseno.child_profiles
  where id = p_id
    and user_id = uid;

  get diagnostics deleted = row_count;
  if deleted = 0 then
    raise exception 'Profil nicht gefunden.';
  end if;
end;
$$;

grant execute on function public.list_my_child_profiles() to authenticated, service_role;
grant execute on function public.upsert_my_child_profile(uuid, text, jsonb, jsonb, jsonb) to authenticated, service_role;
grant execute on function public.delete_my_child_profile(uuid) to authenticated, service_role;

-- Legacy single-profile RPCs: map to first child profile for soft compatibility
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

  return query
  select
    uid,
    p.display_name,
    p.friends,
    p.interests,
    p.experiences
  from leseno.child_profiles as p
  where p.user_id = uid
  order by p.sort_order asc, p.created_at asc
  limit 1;
end;
$$;
