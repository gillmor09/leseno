-- Child login (Kennung + password) — not Supabase Auth.
-- Replaces Eltern-PIN soft-lock for day-to-day use.

alter table leseno.child_profiles
  add column if not exists login_code text,
  add column if not exists password_hash text;

comment on column leseno.child_profiles.login_code is
  'Child username (Kennung), unique, lowercase; set on create.';
comment on column leseno.child_profiles.password_hash is
  'Optional scrypt password hash for child cookie login; null = no child login yet.';

create unique index if not exists child_profiles_login_code_uidx
  on leseno.child_profiles (login_code)
  where login_code is not null and length(trim(login_code)) > 0;

-- Random Kennung: 8 chars a-z0-9 (no confusing chars).
create or replace function leseno.generate_child_login_code()
returns text
language plpgsql
as $$
declare
  alphabet text := 'abcdefghjkmnpqrstuvwxyz23456789';
  candidate text;
  i integer;
  attempts integer := 0;
begin
  loop
    attempts := attempts + 1;
    if attempts > 40 then
      raise exception 'Kennung konnte nicht erzeugt werden.';
    end if;
    candidate := '';
    for i in 1..8 loop
      candidate := candidate || substr(
        alphabet,
        1 + floor(random() * length(alphabet))::integer,
        1
      );
    end loop;
    exit when not exists (
      select 1
      from leseno.child_profiles as p
      where p.login_code = candidate
    );
  end loop;
  return candidate;
end;
$$;

-- Backfill Kennung for existing profiles.
update leseno.child_profiles
set login_code = leseno.generate_child_login_code()
where login_code is null or length(trim(login_code)) = 0;

-- Drop PIN soft-lock usage (column kept for safety; clear hashes).
update leseno.child_profiles set pin_hash = null where pin_hash is not null;

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
  fears_gentle boolean,
  has_pin boolean,
  login_code text,
  has_password boolean
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
    p.fears_gentle,
    false as has_pin,
    p.login_code,
    (p.password_hash is not null and char_length(trim(p.password_hash)) > 0) as has_password
  from leseno.child_profiles as p
  where p.user_id = uid
  order by p.sort_order asc, p.created_at asc;
end;
$$;

revoke all on function public.list_my_child_profiles() from public;
grant execute on function public.list_my_child_profiles() to authenticated, service_role;

-- Upsert: assign login_code on create.
drop function if exists public.upsert_my_child_profile(
  uuid, text, text, jsonb, jsonb, jsonb, jsonb,
  boolean, boolean, boolean, boolean, text, text, boolean, boolean
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
  new_code text;
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

  new_code := leseno.generate_child_login_code();

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
    sort_order,
    login_code
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
    next_sort,
    new_code
  )
  returning id into result_id;

  return result_id;
end;
$$;

revoke all on function public.upsert_my_child_profile(
  uuid, text, text, jsonb, jsonb, jsonb, jsonb,
  boolean, boolean, boolean, boolean, text, text, boolean, boolean
) from public;
grant execute on function public.upsert_my_child_profile(
  uuid, text, text, jsonb, jsonb, jsonb, jsonb,
  boolean, boolean, boolean, boolean, text, text, boolean, boolean
) to authenticated, service_role;

-- Parent sets / clears child password hash.
create or replace function public.set_my_child_login_password(
  p_id uuid,
  p_password_hash text
)
returns void
language plpgsql
security definer
set search_path = public, leseno
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Nicht angemeldet.';
  end if;
  if p_id is null then
    raise exception 'Profil-ID fehlt.';
  end if;
  if p_password_hash is null or char_length(trim(p_password_hash)) = 0 then
    raise exception 'Passwort-Hash fehlt.';
  end if;

  update leseno.child_profiles
  set password_hash = trim(p_password_hash),
      updated_at = now()
  where id = p_id
    and user_id = uid;

  if not found then
    raise exception 'Profil nicht gefunden.';
  end if;
end;
$$;

create or replace function public.clear_my_child_login_password(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public, leseno
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Nicht angemeldet.';
  end if;

  update leseno.child_profiles
  set password_hash = null,
      updated_at = now()
  where id = p_id
    and user_id = uid;

  if not found then
    raise exception 'Profil nicht gefunden.';
  end if;
end;
$$;

revoke all on function public.set_my_child_login_password(uuid, text) from public;
grant execute on function public.set_my_child_login_password(uuid, text) to authenticated;

revoke all on function public.clear_my_child_login_password(uuid) from public;
grant execute on function public.clear_my_child_login_password(uuid) to authenticated;

-- Service-only: lookup for child cookie login (never expose to anon/authenticated).
create or replace function public.lookup_child_login_by_code(p_code text)
returns table (
  profile_id uuid,
  parent_user_id uuid,
  display_name text,
  login_code text,
  password_hash text,
  school_stage text,
  length_step text,
  mood text,
  include_images boolean,
  syllable_help boolean,
  word_highlight boolean,
  readable_aloud boolean
)
language plpgsql
security definer
set search_path = public, leseno
as $$
declare
  code text := lower(trim(coalesce(p_code, '')));
begin
  if code = '' then
    return;
  end if;

  return query
  select
    p.id,
    p.user_id,
    p.display_name,
    p.login_code,
    p.password_hash,
    p.school_stage,
    p.length_step,
    p.mood,
    p.include_images,
    p.syllable_help,
    p.word_highlight,
    p.readable_aloud
  from leseno.child_profiles as p
  where p.login_code = code
    and p.password_hash is not null
    and char_length(trim(p.password_hash)) > 0
  limit 1;
end;
$$;

revoke all on function public.lookup_child_login_by_code(text) from public;
grant execute on function public.lookup_child_login_by_code(text) to service_role;

-- Service-only: debit parent credits for child-session story generation.
create or replace function public.spend_credits_for_user(
  p_user_id uuid,
  p_amount integer
)
returns integer
language plpgsql
security definer
set search_path = public, leseno
as $$
declare
  current_balance integer;
  new_balance integer;
begin
  if p_user_id is null then
    raise exception 'Benutzer fehlt.';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Credit-Betrag ungültig.';
  end if;

  select coalesce(credits, 0)
  into current_balance
  from leseno.user_profiles
  where user_id = p_user_id
  for update;

  if not found then
    raise exception 'Profil nicht gefunden.';
  end if;

  if current_balance < p_amount then
    raise exception 'Nicht genug Credits.';
  end if;

  new_balance := current_balance - p_amount;

  update leseno.user_profiles
  set credits = new_balance,
      updated_at = now()
  where user_id = p_user_id;

  return new_balance;
end;
$$;

revoke all on function public.spend_credits_for_user(uuid, integer) from public;
grant execute on function public.spend_credits_for_user(uuid, integer) to service_role;

-- Service-only: save library story under parent account (child cookie session).
create or replace function public.save_story_for_user(
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
  p_parent_story_id uuid default null
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
  uuid, text, text, jsonb, text, uuid, text, text, text, boolean, boolean, boolean, integer, uuid
) from public;
grant execute on function public.save_story_for_user(
  uuid, text, text, jsonb, text, uuid, text, text, text, boolean, boolean, boolean, integer, uuid
) to service_role;
