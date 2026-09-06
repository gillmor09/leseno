-- Optional gentle fear incorporation for spannend / motivierend stories.

alter table leseno.child_profiles
  add column if not exists fears_gentle boolean not null default false;

drop function if exists public.list_my_child_profiles();

create function public.list_my_child_profiles()
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
  reading_mode_prefs jsonb,
  fears_gentle boolean
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
    p.reading_mode_prefs,
    p.fears_gentle
  from leseno.child_profiles as p
  where p.user_id = uid
  order by p.sort_order asc, p.created_at asc;
end;
$$;

drop function if exists public.upsert_my_child_profile(
  uuid, text, text, jsonb, jsonb, jsonb, jsonb,
  boolean, boolean, boolean, boolean, text, text, boolean
);

create function public.upsert_my_child_profile(
  p_id uuid,
  p_display_name text,
  p_school_stage text,
  p_friends jsonb,
  p_interests jsonb,
  p_experiences jsonb,
  p_fears jsonb,
  p_include_images boolean,
  p_syllable_help boolean,
  p_word_highlight boolean,
  p_readable_aloud boolean,
  p_length_step text,
  p_mood text,
  p_is_default boolean,
  p_fears_gentle boolean default false
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
  step text := coalesce(nullif(trim(p_length_step), ''), 'mittel');
  story_mood text := coalesce(nullif(trim(p_mood), ''), 'spannend');
  make_default boolean := coalesce(p_is_default, false);
  gentle boolean := coalesce(p_fears_gentle, false);
begin
  if uid is null then
    raise exception 'Nicht angemeldet.';
  end if;

  if stage not in (
    'vorschule', 'klasse_1', 'klasse_2', 'klasse_3', 'klasse_4', 'hoeher'
  ) then
    raise exception 'Ungültige Schulstufe.';
  end if;

  if step not in ('sehr_kurz', 'kurz', 'mittel', 'lang', 'sehr_lang') then
    raise exception 'Ungültige Textlänge.';
  end if;

  if story_mood not in ('lustig', 'spannend', 'motivierend') then
    raise exception 'Ungültige Art der Geschichte.';
  end if;

  if jsonb_typeof(p_friends) is distinct from 'array'
     or jsonb_typeof(p_interests) is distinct from 'array'
     or jsonb_typeof(p_experiences) is distinct from 'array'
     or jsonb_typeof(p_fears) is distinct from 'array' then
    raise exception 'Listen müssen JSON-Arrays sein.';
  end if;

  if make_default then
    update leseno.child_profiles
    set is_default = false
    where user_id = uid
      and (p_id is null or id is distinct from p_id);
  end if;

  if p_id is not null then
    update leseno.child_profiles
    set display_name = coalesce(trim(p_display_name), ''),
        school_stage = stage,
        friends = p_friends,
        interests = p_interests,
        experiences = p_experiences,
        fears = p_fears,
        include_images = coalesce(p_include_images, false),
        syllable_help = coalesce(p_syllable_help, false),
        word_highlight = coalesce(p_word_highlight, false),
        readable_aloud = coalesce(p_readable_aloud, true),
        length_step = step,
        mood = story_mood,
        is_default = make_default,
        fears_gentle = gentle
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
    include_images,
    syllable_help,
    word_highlight,
    readable_aloud,
    length_step,
    mood,
    is_default,
    fears_gentle,
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
    coalesce(p_include_images, false),
    coalesce(p_syllable_help, false),
    coalesce(p_word_highlight, false),
    coalesce(p_readable_aloud, true),
    step,
    story_mood,
    make_default,
    gentle,
    next_sort
  )
  returning id into result_id;

  return result_id;
end;
$$;

revoke all on function public.list_my_child_profiles() from public;
grant execute on function public.list_my_child_profiles()
  to authenticated, service_role;

revoke all on function public.upsert_my_child_profile(
  uuid, text, text, jsonb, jsonb, jsonb, jsonb,
  boolean, boolean, boolean, boolean, text, text, boolean, boolean
) from public;
grant execute on function public.upsert_my_child_profile(
  uuid, text, text, jsonb, jsonb, jsonb, jsonb,
  boolean, boolean, boolean, boolean, text, text, boolean, boolean
) to authenticated, service_role;
