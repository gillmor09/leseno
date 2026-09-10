-- Expose story length on library list cards (already stored on user_stories).

drop function if exists public.list_my_stories();

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
  topic text,
  topic_secondary text,
  topic_mix_pattern text,
  topic_seed_source text,
  length_step text,
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
    s.topic,
    s.topic_secondary,
    s.topic_mix_pattern,
    s.topic_seed_source,
    s.length_step,
    s.created_at
  from leseno.user_stories as s
  left join leseno.child_profiles as p
    on p.id = s.child_profile_id
  where s.user_id = uid
  order by s.is_favorite desc, s.created_at desc;
end;
$$;

revoke all on function public.list_my_stories() from public;
grant execute on function public.list_my_stories() to authenticated, service_role;
