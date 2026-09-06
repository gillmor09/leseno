-- Lesemodus typography prefs per child profile (JSON object).

alter table leseno.child_profiles
  add column if not exists reading_mode_prefs jsonb not null default '{}'::jsonb;

alter table leseno.child_profiles
  drop constraint if exists child_profiles_reading_mode_prefs_is_object;

alter table leseno.child_profiles
  add constraint child_profiles_reading_mode_prefs_is_object
  check (jsonb_typeof(reading_mode_prefs) = 'object');

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
  include_images boolean,
  syllable_help boolean,
  word_highlight boolean,
  readable_aloud boolean,
  length_step text,
  mood text,
  is_default boolean,
  sort_order integer,
  reading_mode_prefs jsonb
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
    p.include_images,
    p.syllable_help,
    p.word_highlight,
    p.readable_aloud,
    p.length_step,
    p.mood,
    p.is_default,
    p.sort_order,
    p.reading_mode_prefs
  from leseno.child_profiles as p
  where p.user_id = uid
  order by p.sort_order asc, p.created_at asc;
end;
$$;

-- Immediate Lesemodus prefs save from the typography overlay.
create or replace function public.save_my_child_reading_mode_prefs(
  p_id uuid,
  p_prefs jsonb
)
returns void
language plpgsql
security definer
set search_path = public, leseno
as $$
declare
  uid uuid := auth.uid();
  updated_id uuid;
begin
  if uid is null then
    raise exception 'Nicht angemeldet.';
  end if;

  if p_id is null then
    raise exception 'Profil-ID fehlt.';
  end if;

  if jsonb_typeof(p_prefs) is distinct from 'object' then
    raise exception 'Darstellung muss ein JSON-Objekt sein.';
  end if;

  update leseno.child_profiles
  set reading_mode_prefs = p_prefs
  where id = p_id
    and user_id = uid
  returning id into updated_id;

  if updated_id is null then
    raise exception 'Profil nicht gefunden.';
  end if;
end;
$$;

grant execute on function public.list_my_child_profiles() to authenticated, service_role;
grant execute on function public.save_my_child_reading_mode_prefs(uuid, jsonb)
  to authenticated, service_role;
