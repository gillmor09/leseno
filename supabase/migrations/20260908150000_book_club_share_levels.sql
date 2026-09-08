-- Book club share levels: none | friends | public. Drop commenting surface.

-- ---------------------------------------------------------------------------
-- Column: book_club_share (replace boolean shared_to_book_club)
-- ---------------------------------------------------------------------------

alter table leseno.user_stories
  add column if not exists book_club_share text;

update leseno.user_stories
set book_club_share = case
  when coalesce(shared_to_book_club, false) then 'friends'
  else 'none'
end
where book_club_share is null;

alter table leseno.user_stories
  alter column book_club_share set default 'none';

alter table leseno.user_stories
  alter column book_club_share set not null;

alter table leseno.user_stories
  drop constraint if exists user_stories_book_club_share_check;

alter table leseno.user_stories
  add constraint user_stories_book_club_share_check
  check (book_club_share in ('none', 'friends', 'public'));

drop index if exists leseno.user_stories_shared_book_club_idx;

create index if not exists user_stories_book_club_share_idx
  on leseno.user_stories (book_club_share, created_at desc)
  where book_club_share in ('friends', 'public');

-- Keep boolean in sync for any leftover readers, then drop after RPC rewrite.
update leseno.user_stories
set shared_to_book_club = (book_club_share <> 'none');

-- ---------------------------------------------------------------------------
-- Access helper
-- ---------------------------------------------------------------------------

create or replace function leseno.can_access_shared_story(
  p_viewer uuid,
  p_story_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = public, leseno
as $$
declare
  v_owner uuid;
  v_share text;
begin
  select s.user_id, s.book_club_share
  into v_owner, v_share
  from leseno.user_stories as s
  where s.id = p_story_id;

  if v_owner is null then
    return false;
  end if;

  if p_viewer = v_owner then
    return true;
  end if;

  if v_share = 'public' then
    return true;
  end if;

  if v_share = 'friends' then
    return leseno.are_accepted_friends(p_viewer, v_owner);
  end if;

  return false;
end;
$$;

revoke all on function leseno.can_access_shared_story(uuid, uuid) from public;
grant execute on function leseno.can_access_shared_story(uuid, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Drop comment RPCs + table
-- ---------------------------------------------------------------------------

drop function if exists public.list_story_comments(uuid);
drop function if exists public.add_friend_story_comment(uuid, text);

drop table if exists leseno.story_comments;

-- ---------------------------------------------------------------------------
-- Library list/detail: book_club_share, no comment_count
-- ---------------------------------------------------------------------------

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

-- ---------------------------------------------------------------------------
-- Share setter + book-club feed
-- ---------------------------------------------------------------------------

drop function if exists public.set_my_story_book_club_share(uuid, boolean);

create or replace function public.set_my_story_book_club_share(
  p_id uuid,
  p_share text
)
returns void
language plpgsql
security definer
set search_path = public, leseno
as $$
declare
  uid uuid := auth.uid();
  v_share text := lower(trim(coalesce(p_share, 'none')));
begin
  if uid is null then
    raise exception 'Nicht angemeldet.';
  end if;

  if v_share not in ('none', 'friends', 'public') then
    raise exception 'Ungültige Freigabe.';
  end if;

  update leseno.user_stories
  set book_club_share = v_share
  where id = p_id
    and user_id = uid;

  if not found then
    raise exception 'Geschichte nicht gefunden.';
  end if;
end;
$$;

drop function if exists public.list_friend_shared_stories(uuid);

create function public.list_friend_shared_stories(
  p_friend_user_id uuid default null
)
returns table (
  id uuid,
  title text,
  owner_user_id uuid,
  owner_friendship_code text,
  school_stage text,
  parent_story_id uuid,
  book_club_share text,
  like_count bigint,
  liked_by_me boolean,
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

  if p_friend_user_id is not null
     and not leseno.are_accepted_friends(uid, p_friend_user_id) then
    raise exception 'Keine Freundschaft mit dieser Person.';
  end if;

  return query
  select
    s.id,
    s.title,
    s.user_id as owner_user_id,
    up.friendship_code as owner_friendship_code,
    s.school_stage,
    s.parent_story_id,
    s.book_club_share,
    (
      select count(*)::bigint
      from leseno.story_likes as l
      where l.story_id = s.id
    ) as like_count,
    exists (
      select 1
      from leseno.story_likes as l
      where l.story_id = s.id
        and l.user_id = uid
    ) as liked_by_me,
    s.created_at
  from leseno.user_stories as s
  left join leseno.user_profiles as up
    on up.user_id = s.user_id
  where s.user_id <> uid
    and s.book_club_share in ('friends', 'public')
    and (
      s.book_club_share = 'public'
      or leseno.are_accepted_friends(uid, s.user_id)
    )
    and (p_friend_user_id is null or s.user_id = p_friend_user_id)
  order by s.created_at desc;
end;
$$;

drop function if exists public.get_friend_shared_story(uuid);

create function public.get_friend_shared_story(p_id uuid)
returns table (
  id uuid,
  title text,
  owner_user_id uuid,
  owner_friendship_code text,
  story_html text,
  facts jsonb,
  school_stage text,
  length_step text,
  mood text,
  topic text,
  syllable_help boolean,
  include_images boolean,
  parent_story_id uuid,
  book_club_share text,
  like_count bigint,
  liked_by_me boolean,
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

  if not leseno.can_access_shared_story(uid, p_id) then
    raise exception 'Geschichte nicht freigegeben.';
  end if;

  return query
  select
    s.id,
    s.title,
    s.user_id as owner_user_id,
    up.friendship_code as owner_friendship_code,
    s.story_html,
    s.facts,
    s.school_stage,
    s.length_step,
    s.mood,
    s.topic,
    s.syllable_help,
    s.include_images,
    s.parent_story_id,
    s.book_club_share,
    (
      select count(*)::bigint
      from leseno.story_likes as l
      where l.story_id = s.id
    ) as like_count,
    exists (
      select 1
      from leseno.story_likes as l
      where l.story_id = s.id
        and l.user_id = uid
    ) as liked_by_me,
    s.created_at
  from leseno.user_stories as s
  left join leseno.user_profiles as up
    on up.user_id = s.user_id
  where s.id = p_id
    and (
      s.user_id = uid
      or s.book_club_share in ('friends', 'public')
    );
end;
$$;

create or replace function public.toggle_friend_story_like(p_story_id uuid)
returns table (
  liked boolean,
  like_count bigint
)
language plpgsql
security definer
set search_path = public, leseno
as $$
#variable_conflict use_column
declare
  uid uuid := auth.uid();
  v_owner uuid;
  v_liked boolean;
  v_count bigint;
begin
  if uid is null then
    raise exception 'Nicht angemeldet.';
  end if;

  select s.user_id
  into v_owner
  from leseno.user_stories as s
  where s.id = p_story_id;

  if v_owner is null then
    raise exception 'Geschichte nicht gefunden.';
  end if;

  if v_owner = uid then
    raise exception 'Eigene Geschichten kannst du nicht liken.';
  end if;

  if not leseno.can_access_shared_story(uid, p_story_id) then
    raise exception 'Geschichte nicht freigegeben.';
  end if;

  if exists (
    select 1
    from leseno.story_likes as l
    where l.story_id = p_story_id
      and l.user_id = uid
  ) then
    delete from leseno.story_likes
    where story_id = p_story_id
      and user_id = uid;
    v_liked := false;
  else
    insert into leseno.story_likes (story_id, user_id)
    values (p_story_id, uid)
    on conflict do nothing;
    v_liked := true;
  end if;

  select count(*)::bigint
  into v_count
  from leseno.story_likes as l
  where l.story_id = p_story_id;

  return query select v_liked, coalesce(v_count, 0);
end;
$$;

revoke all on function public.set_my_story_book_club_share(uuid, text) from public;
grant execute on function public.set_my_story_book_club_share(uuid, text) to authenticated, service_role;

revoke all on function public.list_friend_shared_stories(uuid) from public;
grant execute on function public.list_friend_shared_stories(uuid) to authenticated, service_role;

revoke all on function public.get_friend_shared_story(uuid) from public;
grant execute on function public.get_friend_shared_story(uuid) to authenticated, service_role;

revoke all on function public.toggle_friend_story_like(uuid) from public;
grant execute on function public.toggle_friend_story_like(uuid) to authenticated, service_role;

-- Boolean column no longer needed after RPC rewrite.
alter table leseno.user_stories
  drop column if exists shared_to_book_club;
