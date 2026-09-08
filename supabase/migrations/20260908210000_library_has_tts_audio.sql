-- Expose whether a library story already has TTS audio (for Meine Bücherei cards).

drop function if exists public.list_my_stories();
drop function if exists public.get_my_story(uuid);

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
  parent_story_id uuid,
  book_club_share text,
  has_tts_audio boolean,
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
    s.parent_story_id,
    s.book_club_share,
    (
      s.tts_storage_path is not null
      and length(trim(s.tts_storage_path)) > 0
    ) as has_tts_audio,
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
  parent_story_id uuid,
  book_club_share text,
  has_tts_audio boolean,
  like_count bigint,
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
    s.parent_story_id,
    s.book_club_share,
    (
      s.tts_storage_path is not null
      and length(trim(s.tts_storage_path)) > 0
    ) as has_tts_audio,
    (
      select count(*)::bigint
      from leseno.story_likes as l
      where l.story_id = s.id
    ) as like_count,
    s.created_at
  from leseno.user_stories as s
  left join leseno.child_profiles as p
    on p.id = s.child_profile_id
  where s.user_id = uid
    and s.id = p_id;
end;
$$;

revoke all on function public.list_my_stories() from public;
grant execute on function public.list_my_stories() to authenticated, service_role;

revoke all on function public.get_my_story(uuid) from public;
grant execute on function public.get_my_story(uuid) to authenticated, service_role;
