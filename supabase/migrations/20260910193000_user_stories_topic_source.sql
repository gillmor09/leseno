-- Persist what a library story is based on: Hauptthema, Nebenthema/mix, or personal seed type.

alter table leseno.user_stories
  add column if not exists topic_secondary text,
  add column if not exists topic_mix_pattern text,
  add column if not exists topic_seed_source text;

alter table leseno.user_stories
  drop constraint if exists user_stories_topic_seed_source_check;

alter table leseno.user_stories
  add constraint user_stories_topic_seed_source_check
  check (
    topic_seed_source is null
    or topic_seed_source in ('interest', 'experience')
  );

comment on column leseno.user_stories.topic is
  'Hauptthema keyword, personal seed text, or legacy mix label („A + B“).';
comment on column leseno.user_stories.topic_secondary is
  'Optional Nebenthema when Mehr Tiefgang mix was used.';
comment on column leseno.user_stories.topic_mix_pattern is
  'Mix pattern id (crossover, power_up, …) when topic_secondary is set.';
comment on column leseno.user_stories.topic_seed_source is
  'Personal mode: interest vs experience (Wunsch); null for free topics.';

-- Recreate save RPCs with new optional params.
drop function if exists public.save_my_story(
  text, text, jsonb, text, uuid, text, text, text, boolean, boolean, boolean, integer, uuid
);

create function public.save_my_story(
  p_title text,
  p_story_html text,
  p_facts jsonb,
  p_school_stage text,
  p_child_profile_id uuid default null,
  p_length_step text default null,
  p_mood text default null,
  p_topic text default null,
  p_personal_mode boolean default false,
  p_syllable_help boolean default false,
  p_include_images boolean default false,
  p_credits_charged integer default null,
  p_parent_story_id uuid default null,
  p_topic_secondary text default null,
  p_topic_mix_pattern text default null,
  p_topic_seed_source text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, leseno
as $$
declare
  uid uuid := auth.uid();
  v_id uuid;
  v_title text := trim(coalesce(p_title, ''));
  v_html text := coalesce(p_story_html, '');
  v_facts jsonb := coalesce(p_facts, '[]'::jsonb);
  v_secondary text := nullif(trim(coalesce(p_topic_secondary, '')), '');
  v_pattern text := nullif(trim(coalesce(p_topic_mix_pattern, '')), '');
  v_seed text := nullif(trim(coalesce(p_topic_seed_source, '')), '');
begin
  if uid is null then
    raise exception 'Nicht angemeldet.';
  end if;

  if v_title = '' then
    v_title := 'Ohne Titel';
  end if;

  if length(trim(v_html)) = 0 then
    raise exception 'Geschichte fehlt.';
  end if;

  if jsonb_typeof(v_facts) is distinct from 'array' then
    raise exception 'Fakten müssen ein Array sein.';
  end if;

  if p_child_profile_id is not null then
    if not exists (
      select 1
      from leseno.child_profiles as p
      where p.id = p_child_profile_id
        and p.user_id = uid
    ) then
      raise exception 'Profil nicht gefunden.';
    end if;
  end if;

  if p_parent_story_id is not null then
    if not exists (
      select 1
      from leseno.user_stories as s
      where s.id = p_parent_story_id
        and s.user_id = uid
    ) then
      raise exception 'Vorgeschichte nicht gefunden.';
    end if;
  end if;

  -- Mix only when both secondary and pattern are set together.
  if v_secondary is null or v_pattern is null then
    v_secondary := null;
    v_pattern := null;
  end if;

  if v_seed is not null and v_seed not in ('interest', 'experience') then
    raise exception 'Ungültige Themen-Quelle.';
  end if;

  insert into leseno.user_stories (
    user_id,
    child_profile_id,
    title,
    story_html,
    facts,
    school_stage,
    length_step,
    mood,
    topic,
    topic_secondary,
    topic_mix_pattern,
    topic_seed_source,
    personal_mode,
    syllable_help,
    include_images,
    credits_charged,
    parent_story_id
  )
  values (
    uid,
    p_child_profile_id,
    v_title,
    v_html,
    v_facts,
    coalesce(nullif(trim(p_school_stage), ''), 'klasse_3'),
    nullif(trim(p_length_step), ''),
    nullif(trim(p_mood), ''),
    nullif(trim(p_topic), ''),
    v_secondary,
    v_pattern,
    v_seed,
    coalesce(p_personal_mode, false),
    coalesce(p_syllable_help, false),
    coalesce(p_include_images, false),
    p_credits_charged,
    p_parent_story_id
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.save_my_story(
  text, text, jsonb, text, uuid, text, text, text, boolean, boolean, boolean, integer, uuid, text, text, text
) from public;
grant execute on function public.save_my_story(
  text, text, jsonb, text, uuid, text, text, text, boolean, boolean, boolean, integer, uuid, text, text, text
) to authenticated, service_role;

drop function if exists public.save_story_for_user(
  uuid, text, text, jsonb, text, uuid, text, text, text, boolean, boolean, boolean, integer, uuid
);

create function public.save_story_for_user(
  p_user_id uuid,
  p_title text,
  p_story_html text,
  p_facts jsonb,
  p_school_stage text,
  p_child_profile_id uuid default null,
  p_length_step text default null,
  p_mood text default null,
  p_topic text default null,
  p_personal_mode boolean default false,
  p_syllable_help boolean default false,
  p_include_images boolean default false,
  p_credits_charged integer default null,
  p_parent_story_id uuid default null,
  p_topic_secondary text default null,
  p_topic_mix_pattern text default null,
  p_topic_seed_source text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, leseno
as $$
declare
  v_id uuid;
  v_title text := trim(coalesce(p_title, ''));
  v_html text := coalesce(p_story_html, '');
  v_facts jsonb := coalesce(p_facts, '[]'::jsonb);
  v_secondary text := nullif(trim(coalesce(p_topic_secondary, '')), '');
  v_pattern text := nullif(trim(coalesce(p_topic_mix_pattern, '')), '');
  v_seed text := nullif(trim(coalesce(p_topic_seed_source, '')), '');
begin
  if p_user_id is null then
    raise exception 'Benutzer fehlt.';
  end if;

  if v_title = '' then
    v_title := 'Ohne Titel';
  end if;

  if length(trim(v_html)) = 0 then
    raise exception 'Geschichte fehlt.';
  end if;

  if jsonb_typeof(v_facts) is distinct from 'array' then
    raise exception 'Fakten müssen ein Array sein.';
  end if;

  if p_child_profile_id is not null then
    if not exists (
      select 1
      from leseno.child_profiles as p
      where p.id = p_child_profile_id
        and p.user_id = p_user_id
    ) then
      raise exception 'Profil nicht gefunden.';
    end if;
  end if;

  if p_parent_story_id is not null then
    if not exists (
      select 1
      from leseno.user_stories as s
      where s.id = p_parent_story_id
        and s.user_id = p_user_id
    ) then
      raise exception 'Vorgeschichte nicht gefunden.';
    end if;
  end if;

  if v_secondary is null or v_pattern is null then
    v_secondary := null;
    v_pattern := null;
  end if;

  if v_seed is not null and v_seed not in ('interest', 'experience') then
    raise exception 'Ungültige Themen-Quelle.';
  end if;

  insert into leseno.user_stories (
    user_id,
    child_profile_id,
    title,
    story_html,
    facts,
    school_stage,
    length_step,
    mood,
    topic,
    topic_secondary,
    topic_mix_pattern,
    topic_seed_source,
    personal_mode,
    syllable_help,
    include_images,
    credits_charged,
    parent_story_id
  )
  values (
    p_user_id,
    p_child_profile_id,
    v_title,
    v_html,
    v_facts,
    coalesce(nullif(trim(p_school_stage), ''), 'klasse_3'),
    nullif(trim(p_length_step), ''),
    nullif(trim(p_mood), ''),
    nullif(trim(p_topic), ''),
    v_secondary,
    v_pattern,
    v_seed,
    coalesce(p_personal_mode, false),
    coalesce(p_syllable_help, false),
    coalesce(p_include_images, false),
    p_credits_charged,
    p_parent_story_id
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.save_story_for_user(
  uuid, text, text, jsonb, text, uuid, text, text, text, boolean, boolean, boolean, integer, uuid, text, text, text
) from public;
grant execute on function public.save_story_for_user(
  uuid, text, text, jsonb, text, uuid, text, text, text, boolean, boolean, boolean, integer, uuid, text, text, text
) to service_role;

-- Expose based-on fields on list + detail.
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
  topic text,
  topic_secondary text,
  topic_mix_pattern text,
  topic_seed_source text,
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
  topic_secondary text,
  topic_mix_pattern text,
  topic_seed_source text,
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
    s.topic_secondary,
    s.topic_mix_pattern,
    s.topic_seed_source,
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

revoke all on function public.get_my_story(uuid) from public;
grant execute on function public.get_my_story(uuid) to authenticated, service_role;
