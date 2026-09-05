-- User story library: persist membership stories after generation (favorites, per profile).

create table if not exists leseno.user_stories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  child_profile_id uuid references leseno.child_profiles (id) on delete set null,
  title text not null,
  story_html text not null,
  facts jsonb not null default '[]'::jsonb,
  school_stage text not null,
  length_step text,
  mood text,
  topic text,
  personal_mode boolean not null default false,
  syllable_help boolean not null default false,
  include_images boolean not null default false,
  is_favorite boolean not null default false,
  credits_charged integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_stories_facts_is_array check (jsonb_typeof(facts) = 'array'),
  constraint user_stories_title_not_blank check (length(trim(title)) > 0),
  constraint user_stories_story_html_not_blank check (length(trim(story_html)) > 0)
);

create index if not exists user_stories_user_created_idx
  on leseno.user_stories (user_id, created_at desc);

create index if not exists user_stories_user_profile_idx
  on leseno.user_stories (user_id, child_profile_id, created_at desc);

create index if not exists user_stories_user_favorite_idx
  on leseno.user_stories (user_id, is_favorite, created_at desc)
  where is_favorite = true;

drop trigger if exists user_stories_set_updated_at on leseno.user_stories;
create trigger user_stories_set_updated_at
before update on leseno.user_stories
for each row
execute function leseno.set_updated_at();

alter table leseno.user_stories enable row level security;

drop policy if exists user_stories_select_self on leseno.user_stories;
create policy user_stories_select_self
on leseno.user_stories for select
to authenticated
using (auth.uid() = user_id);

-- Writes go through security-definer RPCs only.
revoke insert, update, delete on leseno.user_stories from authenticated;
grant select on leseno.user_stories to authenticated;
grant all on leseno.user_stories to service_role;

create or replace function public.save_my_story(
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
  p_credits_charged integer default null
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
    credits_charged
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
    coalesce(p_personal_mode, false),
    coalesce(p_syllable_help, false),
    coalesce(p_include_images, false),
    p_credits_charged
  )
  returning id into v_id;

  return v_id;
end;
$$;

comment on function public.save_my_story is
  'Persists a membership story for the signed-in user (library).';

create or replace function public.list_my_stories()
returns table (
  id uuid,
  title text,
  child_profile_id uuid,
  profile_display_name text,
  is_favorite boolean,
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

comment on function public.list_my_stories() is
  'Lists library story summaries for the signed-in user (favorites first).';

create or replace function public.get_my_story(p_id uuid)
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
    s.credits_charged,
    s.created_at
  from leseno.user_stories as s
  left join leseno.child_profiles as p
    on p.id = s.child_profile_id
  where s.user_id = uid
    and s.id = p_id;
end;
$$;

comment on function public.get_my_story(uuid) is
  'Loads one library story (full HTML) for the signed-in owner.';

create or replace function public.set_my_story_favorite(
  p_id uuid,
  p_is_favorite boolean
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
  set is_favorite = coalesce(p_is_favorite, false)
  where id = p_id
    and user_id = uid
  returning true into v_ok;

  if not coalesce(v_ok, false) then
    raise exception 'Geschichte nicht gefunden.';
  end if;

  return true;
end;
$$;

comment on function public.set_my_story_favorite(uuid, boolean) is
  'Toggles favorite flag on an owned library story.';

revoke all on function public.save_my_story(
  text, text, jsonb, text, uuid, text, text, text, boolean, boolean, boolean, integer
) from public;
grant execute on function public.save_my_story(
  text, text, jsonb, text, uuid, text, text, text, boolean, boolean, boolean, integer
) to authenticated;
grant execute on function public.save_my_story(
  text, text, jsonb, text, uuid, text, text, text, boolean, boolean, boolean, integer
) to service_role;

revoke all on function public.list_my_stories() from public;
grant execute on function public.list_my_stories() to authenticated;
grant execute on function public.list_my_stories() to service_role;

revoke all on function public.get_my_story(uuid) from public;
grant execute on function public.get_my_story(uuid) to authenticated;
grant execute on function public.get_my_story(uuid) to service_role;

revoke all on function public.set_my_story_favorite(uuid, boolean) from public;
grant execute on function public.set_my_story_favorite(uuid, boolean) to authenticated;
grant execute on function public.set_my_story_favorite(uuid, boolean) to service_role;
