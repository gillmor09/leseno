-- Replace guest / member_tier_* with membership page roles.
-- Keep admin. Roles: admin, basis, paket1, paket2, paket3 (1:1 with pages).

alter table leseno.user_profiles
  drop constraint if exists user_profiles_role_chk;

update leseno.user_profiles
set role = case role
  when 'guest' then 'basis'
  when 'member_tier_1' then 'paket1'
  when 'member_tier_2' then 'paket2'
  when 'member_tier_3' then 'paket3'
  when 'admin' then 'admin'
  else 'basis'
end;

alter table leseno.user_profiles
  alter column role set default 'basis';

alter table leseno.user_profiles
  add constraint user_profiles_role_chk
  check (role in ('admin', 'basis', 'paket1', 'paket2', 'paket3'));

-- Sync Auth app_metadata.role for existing users
update auth.users
set raw_app_meta_data =
  coalesce(raw_app_meta_data, '{}'::jsonb)
  || jsonb_build_object(
    'role',
    case coalesce(raw_app_meta_data->>'role', '')
      when 'admin' then 'admin'
      when 'guest' then 'basis'
      when 'member_tier_1' then 'paket1'
      when 'member_tier_2' then 'paket2'
      when 'member_tier_3' then 'paket3'
      when 'basis' then 'basis'
      when 'paket1' then 'paket1'
      when 'paket2' then 'paket2'
      when 'paket3' then 'paket3'
      else 'basis'
    end
  );

-- Keep profile.role aligned with Auth on insert/update of metadata-driven signups
create or replace function leseno.sync_user_profile_from_auth()
returns trigger
language plpgsql
security definer
set search_path = public, auth, leseno
as $$
declare
  auth_role text;
begin
  auth_role := coalesce(new.raw_app_meta_data->>'role', 'basis');
  if auth_role not in ('admin', 'basis', 'paket1', 'paket2', 'paket3') then
    auth_role := 'basis';
  end if;

  insert into leseno.user_profiles (user_id, email, role)
  values (new.id, new.email, auth_role)
  on conflict (user_id) do update
  set
    email = excluded.email,
    role = excluded.role;

  return new;
end;
$$;

drop trigger if exists on_auth_user_updated_sync_profile on auth.users;
create trigger on_auth_user_updated_sync_profile
after update of email, raw_app_meta_data on auth.users
for each row
execute function leseno.sync_user_profile_from_auth();
