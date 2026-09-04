-- Extend child profiles: school_stage + fears ("Davor habe ich Angst").

alter table leseno.child_profiles
  add column if not exists school_stage text not null default 'klasse_3',
  add column if not exists fears jsonb not null default '[]'::jsonb;

alter table leseno.child_profiles
  drop constraint if exists child_profiles_fears_is_array;

alter table leseno.child_profiles
  add constraint child_profiles_fears_is_array
  check (jsonb_typeof(fears) = 'array');

alter table leseno.child_profiles
  drop constraint if exists child_profiles_school_stage_chk;

alter table leseno.child_profiles
  add constraint child_profiles_school_stage_chk
  check (
    school_stage in (
      'vorschule',
      'klasse_1',
      'klasse_2',
      'klasse_3',
      'klasse_4',
      'hoeher'
    )
  );

-- Return row shape changed (school_stage + fears) — replace requires DROP first.
drop function if exists public.list_my_child_profiles();

create or replace function public.list_my_child_profiles()
returns table (
  id uuid,
  display_name text,
  school_stage text,
  friends jsonb,
  interests jsonb,
  experiences jsonb,
  fears jsonb,
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
    p.school_stage,
    p.friends,
    p.interests,
    p.experiences,
    p.fears,
    p.sort_order
  from leseno.child_profiles as p
  where p.user_id = uid
  order by p.sort_order asc, p.created_at asc;
end;
$$;

drop function if exists public.upsert_my_child_profile(uuid, text, jsonb, jsonb, jsonb);

create or replace function public.upsert_my_child_profile(
  p_id uuid,
  p_display_name text,
  p_school_stage text,
  p_friends jsonb,
  p_interests jsonb,
  p_experiences jsonb,
  p_fears jsonb
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
  stage text := coalesce(nullif(trim(p_school_stage), ''), 'klasse_3');
begin
  if uid is null then
    raise exception 'Nicht angemeldet.';
  end if;

  if stage not in (
    'vorschule', 'klasse_1', 'klasse_2', 'klasse_3', 'klasse_4', 'hoeher'
  ) then
    raise exception 'Ungültige Schulstufe.';
  end if;

  if jsonb_typeof(p_friends) is distinct from 'array'
     or jsonb_typeof(p_interests) is distinct from 'array'
     or jsonb_typeof(p_experiences) is distinct from 'array'
     or jsonb_typeof(p_fears) is distinct from 'array' then
    raise exception 'Listen müssen JSON-Arrays sein.';
  end if;

  if p_id is not null then
    update leseno.child_profiles
    set display_name = coalesce(trim(p_display_name), ''),
        school_stage = stage,
        friends = p_friends,
        interests = p_interests,
        experiences = p_experiences,
        fears = p_fears
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
    school_stage,
    friends,
    interests,
    experiences,
    fears,
    sort_order
  )
  values (
    uid,
    coalesce(trim(p_display_name), ''),
    stage,
    p_friends,
    p_interests,
    p_experiences,
    p_fears,
    next_sort
  )
  returning id into result_id;

  return result_id;
end;
$$;

grant execute on function public.list_my_child_profiles() to authenticated, service_role;
grant execute on function public.upsert_my_child_profile(uuid, text, text, jsonb, jsonb, jsonb, jsonb) to authenticated, service_role;
