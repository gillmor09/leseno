-- Mark library stories as read (analogous to favorites).

alter table leseno.user_stories
  add column if not exists is_read boolean not null default false;

create index if not exists user_stories_user_read_idx
  on leseno.user_stories (user_id, is_read, created_at desc)
  where is_read = true;

-- Return type gains `is_read` → must drop before recreate.
drop function if exists public.list_my_stories() cascade;
drop function if exists public.get_my_story(uuid) cascade;

create function public.list_my_stories()
returns table (
  id uuid,
  title text,
  child_profile_id uuid,
  profile_display_name text,
  is_favorite boolean,
  is_read boolean,
  school_stage text,
  personal_mode boolean,
  created_at timestamptz
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
    s.id,
    s.title,
    s.child_profile_id,
    p.display_name as profile_display_name,
    s.is_favorite,
    s.is_read,
    s.school_stage,
    s.personal_mode,
    s.created_at
  from leseno.user_stories as s
  left join leseno.child_profiles as p
    on p.id = s.child_profile_id
  where s.user_id = uid
  order by s.is_favorite desc, s.created_at desc;
end;
$$;

create function public.get_my_story(p_id uuid)
returns table (
  id uuid,
  title text,
  child_profile_id uuid,
  profile_display_name text,
  story_html text,
  facts jsonb,
  school_stage text,
  length_step text,
  mood text,
  topic text,
  personal_mode boolean,
  syllable_help boolean,
  include_images boolean,
  is_favorite boolean,
  is_read boolean,
  credits_charged integer,
  created_at timestamptz
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
    s.id,
    s.title,
    s.child_profile_id,
    p.display_name as profile_display_name,
    s.story_html,
    s.facts,
    s.school_stage,
    s.length_step,
    s.mood,
    s.topic,
    s.personal_mode,
    s.syllable_help,
    s.include_images,
    s.is_favorite,
    s.is_read,
    s.credits_charged,
    s.created_at
  from leseno.user_stories as s
  left join leseno.child_profiles as p
    on p.id = s.child_profile_id
  where s.user_id = uid
    and s.id = p_id;
end;
$$;

revoke all on function public.list_my_stories() from public;
grant execute on function public.list_my_stories() to authenticated;
grant execute on function public.list_my_stories() to service_role;

revoke all on function public.get_my_story(uuid) from public;
grant execute on function public.get_my_story(uuid) to authenticated;
grant execute on function public.get_my_story(uuid) to service_role;

create or replace function public.set_my_story_read(
  p_id uuid,
  p_is_read boolean
)
returns boolean
language plpgsql
security definer
set search_path = public, leseno
as $$
declare
  uid uuid := auth.uid();
  v_ok boolean := false;
begin
  if uid is null then
    raise exception 'Nicht angemeldet.';
  end if;

  update leseno.user_stories
  set is_read = coalesce(p_is_read, false)
  where id = p_id
    and user_id = uid
  returning true into v_ok;

  if not coalesce(v_ok, false) then
    raise exception 'Geschichte nicht gefunden.';
  end if;

  return true;
end;
$$;

comment on function public.set_my_story_read(uuid, boolean) is
  'Toggles read flag on an owned library story.';

revoke all on function public.set_my_story_read(uuid, boolean) from public;
grant execute on function public.set_my_story_read(uuid, boolean) to authenticated;
grant execute on function public.set_my_story_read(uuid, boolean) to service_role;
