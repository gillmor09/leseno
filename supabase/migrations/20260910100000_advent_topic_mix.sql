-- Optional Hauptthema + Nebenthema mix for Advent calendar books.
-- topic stays the Hauptthema (or personal label); secondary + pattern drive the LLM mix.

alter table leseno.advent_books
  add column if not exists topic_secondary text,
  add column if not exists topic_mix_pattern text;

-- Replace create RPC: drop old signature, then create with mix params.
drop function if exists public.create_my_advent_book(
  text, integer, text, text, text, text, text, uuid, boolean, boolean, boolean, integer
);

-- Return-type changes require drop + recreate.
drop function if exists public.list_my_advent_books();
drop function if exists public.get_my_advent_book(uuid);

create or replace function public.create_my_advent_book(
  p_title text,
  p_year integer,
  p_topic text,
  p_school_stage text,
  p_length_step text,
  p_mood text,
  p_pin_hash text,
  p_child_profile_id uuid default null,
  p_personal_mode boolean default false,
  p_syllable_help boolean default false,
  p_include_images boolean default false,
  p_credits_charged integer default null,
  p_topic_secondary text default null,
  p_topic_mix_pattern text default null
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
  v_secondary text := nullif(trim(coalesce(p_topic_secondary, '')), '');
  v_pattern text := nullif(trim(coalesce(p_topic_mix_pattern, '')), '');
begin
  if uid is null then
    raise exception 'Nicht angemeldet.';
  end if;

  if v_title = '' then
    v_title := 'Adventskalenderbuch';
  end if;

  if p_year is null or p_year < 2024 or p_year > 2100 then
    raise exception 'Ungültiges Adventsjahr.';
  end if;

  if length(trim(coalesce(p_pin_hash, ''))) = 0 then
    raise exception 'PIN fehlt.';
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

  -- Mix only when both secondary and pattern are set together.
  if v_secondary is null or v_pattern is null then
    v_secondary := null;
    v_pattern := null;
  end if;

  insert into leseno.advent_books (
    user_id,
    child_profile_id,
    title,
    year,
    topic,
    topic_secondary,
    topic_mix_pattern,
    school_stage,
    length_step,
    mood,
    personal_mode,
    syllable_help,
    include_images,
    pin_hash,
    days_ready,
    credits_charged,
    status
  )
  values (
    uid,
    p_child_profile_id,
    v_title,
    p_year,
    nullif(trim(p_topic), ''),
    v_secondary,
    v_pattern,
    coalesce(nullif(trim(p_school_stage), ''), 'klasse_3'),
    coalesce(nullif(trim(p_length_step), ''), 'mittel'),
    coalesce(nullif(trim(p_mood), ''), 'spannend'),
    coalesce(p_personal_mode, false),
    coalesce(p_syllable_help, false),
    coalesce(p_include_images, false),
    trim(p_pin_hash),
    0,
    p_credits_charged,
    'generating'
  )
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.list_my_advent_books()
returns table (
  id uuid,
  title text,
  year integer,
  topic text,
  topic_secondary text,
  topic_mix_pattern text,
  school_stage text,
  length_step text,
  mood text,
  personal_mode boolean,
  child_profile_id uuid,
  profile_display_name text,
  days_ready integer,
  status text,
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
    b.id,
    b.title,
    b.year,
    b.topic,
    b.topic_secondary,
    b.topic_mix_pattern,
    b.school_stage,
    b.length_step,
    b.mood,
    b.personal_mode,
    b.child_profile_id,
    p.display_name as profile_display_name,
    b.days_ready,
    b.status,
    b.created_at
  from leseno.advent_books as b
  left join leseno.child_profiles as p
    on p.id = b.child_profile_id
  where b.user_id = uid
  order by b.created_at desc;
end;
$$;

create or replace function public.get_my_advent_book(p_id uuid)
returns table (
  id uuid,
  title text,
  year integer,
  topic text,
  topic_secondary text,
  topic_mix_pattern text,
  school_stage text,
  length_step text,
  mood text,
  personal_mode boolean,
  syllable_help boolean,
  include_images boolean,
  child_profile_id uuid,
  profile_display_name text,
  days_ready integer,
  status text,
  pin_hash text,
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
    b.id,
    b.title,
    b.year,
    b.topic,
    b.topic_secondary,
    b.topic_mix_pattern,
    b.school_stage,
    b.length_step,
    b.mood,
    b.personal_mode,
    b.syllable_help,
    b.include_images,
    b.child_profile_id,
    p.display_name as profile_display_name,
    b.days_ready,
    b.status,
    b.pin_hash,
    b.created_at
  from leseno.advent_books as b
  left join leseno.child_profiles as p
    on p.id = b.child_profile_id
  where b.user_id = uid
    and b.id = p_id;
end;
$$;

revoke all on function public.create_my_advent_book(
  text, integer, text, text, text, text, text, uuid, boolean, boolean, boolean, integer, text, text
) from public;
grant execute on function public.create_my_advent_book(
  text, integer, text, text, text, text, text, uuid, boolean, boolean, boolean, integer, text, text
) to authenticated;

revoke all on function public.list_my_advent_books() from public;
grant execute on function public.list_my_advent_books() to authenticated;

revoke all on function public.get_my_advent_book(uuid) from public;
grant execute on function public.get_my_advent_book(uuid) to authenticated;
