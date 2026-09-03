-- App-level user profiles and roles synced from Supabase Auth.
-- New users default to "guest"; admins can later promote them in the admin UI.

create or replace function leseno.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists leseno.user_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique,
  role text not null default 'guest',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_profiles_role_chk
    check (role in ('admin', 'guest', 'member_tier_1', 'member_tier_2', 'member_tier_3'))
);

create or replace function leseno.sync_user_profile_from_auth()
returns trigger
language plpgsql
security definer
set search_path = public, auth, leseno
as $$
begin
  insert into leseno.user_profiles (user_id, email)
  values (new.id, new.email)
  on conflict (user_id) do update
  set email = excluded.email;

  return new;
end;
$$;

drop trigger if exists user_profiles_set_updated_at on leseno.user_profiles;
create trigger user_profiles_set_updated_at
before update on leseno.user_profiles
for each row
execute function leseno.set_updated_at();

drop trigger if exists on_auth_user_created_sync_profile on auth.users;
create trigger on_auth_user_created_sync_profile
after insert on auth.users
for each row
execute function leseno.sync_user_profile_from_auth();

drop trigger if exists on_auth_user_updated_sync_profile on auth.users;
create trigger on_auth_user_updated_sync_profile
after update of email on auth.users
for each row
execute function leseno.sync_user_profile_from_auth();

insert into leseno.user_profiles (user_id, email)
select id, email
from auth.users
where email is not null
on conflict (user_id) do update
set email = excluded.email;

alter table leseno.user_profiles enable row level security;

drop policy if exists user_profiles_select_self on leseno.user_profiles;
create policy user_profiles_select_self
on leseno.user_profiles for select
to authenticated
using (auth.uid() = user_id);

grant select on leseno.user_profiles to authenticated;
grant all on leseno.user_profiles to service_role;
