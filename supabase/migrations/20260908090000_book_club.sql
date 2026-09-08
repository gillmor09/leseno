-- Mein Buchclub: friendship codes, confirmed friendships, story share,
-- likes, comments, and email-invite audit.

-- ---------------------------------------------------------------------------
-- Columns
-- ---------------------------------------------------------------------------

alter table leseno.user_profiles
  add column if not exists friendship_code text;

alter table leseno.user_profiles
  drop constraint if exists user_profiles_friendship_code_format;

alter table leseno.user_profiles
  add constraint user_profiles_friendship_code_format
  check (
    friendship_code is null
    or friendship_code ~ '^[a-z0-9_-]{4,24}$'
  );

create unique index if not exists user_profiles_friendship_code_uidx
  on leseno.user_profiles (friendship_code)
  where friendship_code is not null;

alter table leseno.user_stories
  add column if not exists shared_to_book_club boolean not null default false;

create index if not exists user_stories_shared_book_club_idx
  on leseno.user_stories (user_id, created_at desc)
  where shared_to_book_club = true;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists leseno.friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references auth.users (id) on delete cascade,
  addressee_id uuid not null references auth.users (id) on delete cascade,
  status text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint friendships_status_chk
    check (status in ('pending', 'accepted')),
  constraint friendships_no_self_chk
    check (requester_id <> addressee_id),
  constraint friendships_pair_uidx unique (requester_id, addressee_id)
);

create index if not exists friendships_addressee_status_idx
  on leseno.friendships (addressee_id, status, created_at desc);

create index if not exists friendships_requester_status_idx
  on leseno.friendships (requester_id, status, created_at desc);

drop trigger if exists friendships_set_updated_at on leseno.friendships;
create trigger friendships_set_updated_at
before update on leseno.friendships
for each row
execute function leseno.set_updated_at();

alter table leseno.friendships enable row level security;
revoke all on leseno.friendships from authenticated;
grant all on leseno.friendships to service_role;

create table if not exists leseno.story_likes (
  story_id uuid not null references leseno.user_stories (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (story_id, user_id)
);

create index if not exists story_likes_user_idx
  on leseno.story_likes (user_id, created_at desc);

alter table leseno.story_likes enable row level security;
revoke all on leseno.story_likes from authenticated;
grant all on leseno.story_likes to service_role;

create table if not exists leseno.story_comments (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null references leseno.user_stories (id) on delete cascade,
  author_id uuid not null references auth.users (id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  constraint story_comments_body_not_blank check (length(trim(body)) > 0),
  constraint story_comments_body_len check (char_length(body) <= 2000)
);

create index if not exists story_comments_story_created_idx
  on leseno.story_comments (story_id, created_at asc);

alter table leseno.story_comments enable row level security;
revoke all on leseno.story_comments from authenticated;
grant all on leseno.story_comments to service_role;

create table if not exists leseno.book_club_invites (
  id uuid primary key default gen_random_uuid(),
  inviter_id uuid not null references auth.users (id) on delete cascade,
  email text not null,
  created_at timestamptz not null default now(),
  constraint book_club_invites_email_not_blank check (length(trim(email)) > 0)
);

create index if not exists book_club_invites_inviter_created_idx
  on leseno.book_club_invites (inviter_id, created_at desc);

alter table leseno.book_club_invites enable row level security;
revoke all on leseno.book_club_invites from authenticated;
grant all on leseno.book_club_invites to service_role;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function leseno.are_accepted_friends(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = public, leseno
as $$
  select exists (
    select 1
    from leseno.friendships as f
    where f.status = 'accepted'
      and (
        (f.requester_id = a and f.addressee_id = b)
        or (f.requester_id = b and f.addressee_id = a)
      )
  );
$$;

revoke all on function leseno.are_accepted_friends(uuid, uuid) from public;
grant execute on function leseno.are_accepted_friends(uuid, uuid) to service_role;

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
  v_shared boolean;
begin
  select s.user_id, s.shared_to_book_club
  into v_owner, v_shared
  from leseno.user_stories as s
  where s.id = p_story_id;

  if v_owner is null then
    return false;
  end if;

  if p_viewer = v_owner then
    return true;
  end if;

  if not coalesce(v_shared, false) then
    return false;
  end if;

  return leseno.are_accepted_friends(p_viewer, v_owner);
end;
$$;

revoke all on function leseno.can_access_shared_story(uuid, uuid) from public;
grant execute on function leseno.can_access_shared_story(uuid, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Library RPCs: include shared_to_book_club
-- ---------------------------------------------------------------------------

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
  parent_story_id uuid,
  shared_to_book_club boolean,
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
    s.shared_to_book_club,
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
  shared_to_book_club boolean,
  like_count bigint,
  comment_count bigint,
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
    s.shared_to_book_club,
    (
      select count(*)::bigint
      from leseno.story_likes as l
      where l.story_id = s.id
    ) as like_count,
    (
      select count(*)::bigint
      from leseno.story_comments as c
      where c.story_id = s.id
    ) as comment_count,
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
-- Book club profile / friendship RPCs
-- ---------------------------------------------------------------------------

create or replace function public.get_my_book_club_profile()
returns table (
  friendship_code text
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
  select up.friendship_code
  from leseno.user_profiles as up
  where up.user_id = uid;
end;
$$;

create or replace function public.set_my_friendship_code(p_code text)
returns text
language plpgsql
security definer
set search_path = public, leseno
as $$
declare
  uid uuid := auth.uid();
  v_code text := lower(trim(coalesce(p_code, '')));
begin
  if uid is null then
    raise exception 'Nicht angemeldet.';
  end if;

  if v_code = '' then
    raise exception 'Freundschaftskennung fehlt.';
  end if;

  if v_code !~ '^[a-z0-9_-]{4,24}$' then
    raise exception 'Kennung: 4–24 Zeichen, nur Buchstaben, Zahlen, _ und -.';
  end if;

  if exists (
    select 1
    from leseno.user_profiles as up
    where up.friendship_code = v_code
      and up.user_id <> uid
  ) then
    raise exception 'Diese Kennung ist bereits vergeben.';
  end if;

  update leseno.user_profiles
  set friendship_code = v_code
  where user_id = uid;

  if not found then
    raise exception 'Profil nicht gefunden.';
  end if;

  return v_code;
end;
$$;

create or replace function public.request_friendship_by_code(p_code text)
returns uuid
language plpgsql
security definer
set search_path = public, leseno
as $$
declare
  uid uuid := auth.uid();
  v_code text := lower(trim(coalesce(p_code, '')));
  v_addressee uuid;
  v_id uuid;
begin
  if uid is null then
    raise exception 'Nicht angemeldet.';
  end if;

  if v_code = '' then
    raise exception 'Freundschaftskennung fehlt.';
  end if;

  select up.user_id
  into v_addressee
  from leseno.user_profiles as up
  where up.friendship_code = v_code;

  if v_addressee is null then
    raise exception 'Keine Person mit dieser Kennung gefunden.';
  end if;

  if v_addressee = uid then
    raise exception 'Du kannst dich nicht selbst hinzufügen.';
  end if;

  if leseno.are_accepted_friends(uid, v_addressee) then
    raise exception 'Ihr seid bereits befreundet.';
  end if;

  -- Existing pending either direction?
  if exists (
    select 1
    from leseno.friendships as f
    where f.status = 'pending'
      and (
        (f.requester_id = uid and f.addressee_id = v_addressee)
        or (f.requester_id = v_addressee and f.addressee_id = uid)
      )
  ) then
    raise exception 'Es gibt bereits eine offene Freundschaftsanfrage.';
  end if;

  insert into leseno.friendships (requester_id, addressee_id, status)
  values (uid, v_addressee, 'pending')
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.respond_to_friendship(
  p_friendship_id uuid,
  p_accept boolean
)
returns void
language plpgsql
security definer
set search_path = public, leseno
as $$
declare
  uid uuid := auth.uid();
  v_row leseno.friendships%rowtype;
begin
  if uid is null then
    raise exception 'Nicht angemeldet.';
  end if;

  select *
  into v_row
  from leseno.friendships as f
  where f.id = p_friendship_id
  for update;

  if not found then
    raise exception 'Anfrage nicht gefunden.';
  end if;

  if v_row.addressee_id <> uid then
    raise exception 'Nur der Empfänger kann antworten.';
  end if;

  if v_row.status <> 'pending' then
    raise exception 'Die Anfrage ist nicht mehr offen.';
  end if;

  if coalesce(p_accept, false) then
    update leseno.friendships
    set status = 'accepted'
    where id = p_friendship_id;
  else
    delete from leseno.friendships
    where id = p_friendship_id;
  end if;
end;
$$;

create or replace function public.cancel_friendship_request(p_friendship_id uuid)
returns void
language plpgsql
security definer
set search_path = public, leseno
as $$
declare
  uid uuid := auth.uid();
  v_row leseno.friendships%rowtype;
begin
  if uid is null then
    raise exception 'Nicht angemeldet.';
  end if;

  select *
  into v_row
  from leseno.friendships as f
  where f.id = p_friendship_id
  for update;

  if not found then
    raise exception 'Anfrage nicht gefunden.';
  end if;

  if v_row.requester_id <> uid then
    raise exception 'Nur der Absender kann zurückziehen.';
  end if;

  if v_row.status <> 'pending' then
    raise exception 'Die Anfrage ist nicht mehr offen.';
  end if;

  delete from leseno.friendships
  where id = p_friendship_id;
end;
$$;

create or replace function public.remove_friendship(p_friendship_id uuid)
returns void
language plpgsql
security definer
set search_path = public, leseno
as $$
declare
  uid uuid := auth.uid();
  v_row leseno.friendships%rowtype;
begin
  if uid is null then
    raise exception 'Nicht angemeldet.';
  end if;

  select *
  into v_row
  from leseno.friendships as f
  where f.id = p_friendship_id
  for update;

  if not found then
    raise exception 'Freundschaft nicht gefunden.';
  end if;

  if v_row.requester_id <> uid and v_row.addressee_id <> uid then
    raise exception 'Keine Berechtigung.';
  end if;

  if v_row.status <> 'accepted' then
    raise exception 'Keine bestätigte Freundschaft.';
  end if;

  delete from leseno.friendships
  where id = p_friendship_id;
end;
$$;

create or replace function public.list_my_friendships()
returns table (
  id uuid,
  status text,
  direction text,
  other_user_id uuid,
  other_friendship_code text,
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
    f.id,
    f.status,
    case
      when f.requester_id = uid then 'outgoing'
      else 'incoming'
    end as direction,
    case
      when f.requester_id = uid then f.addressee_id
      else f.requester_id
    end as other_user_id,
    up.friendship_code as other_friendship_code,
    f.created_at
  from leseno.friendships as f
  left join leseno.user_profiles as up
    on up.user_id = case
      when f.requester_id = uid then f.addressee_id
      else f.requester_id
    end
  where f.requester_id = uid
     or f.addressee_id = uid
  order by
    case f.status when 'pending' then 0 else 1 end,
    f.created_at desc;
end;
$$;

-- ---------------------------------------------------------------------------
-- Story share / friend library
-- ---------------------------------------------------------------------------

create or replace function public.set_my_story_book_club_share(
  p_id uuid,
  p_shared boolean
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

  update leseno.user_stories
  set shared_to_book_club = coalesce(p_shared, false)
  where id = p_id
    and user_id = uid;

  if not found then
    raise exception 'Geschichte nicht gefunden.';
  end if;
end;
$$;

create or replace function public.list_friend_shared_stories(
  p_friend_user_id uuid default null
)
returns table (
  id uuid,
  title text,
  owner_user_id uuid,
  owner_friendship_code text,
  school_stage text,
  parent_story_id uuid,
  like_count bigint,
  comment_count bigint,
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
    (
      select count(*)::bigint
      from leseno.story_likes as l
      where l.story_id = s.id
    ) as like_count,
    (
      select count(*)::bigint
      from leseno.story_comments as c
      where c.story_id = s.id
    ) as comment_count,
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
  where s.shared_to_book_club = true
    and s.user_id <> uid
    and leseno.are_accepted_friends(uid, s.user_id)
    and (p_friend_user_id is null or s.user_id = p_friend_user_id)
  order by s.created_at desc;
end;
$$;

create or replace function public.get_friend_shared_story(p_id uuid)
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
  like_count bigint,
  comment_count bigint,
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
    raise exception 'Geschichte nicht freigegeben oder keine Freundschaft.';
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
    (
      select count(*)::bigint
      from leseno.story_likes as l
      where l.story_id = s.id
    ) as like_count,
    (
      select count(*)::bigint
      from leseno.story_comments as c
      where c.story_id = s.id
    ) as comment_count,
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
      or s.shared_to_book_club = true
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
  where s.id = p_story_id
    and s.shared_to_book_club = true;

  if v_owner is null then
    raise exception 'Geschichte nicht freigegeben.';
  end if;

  if v_owner = uid then
    raise exception 'Eigene Geschichten kannst du nicht liken.';
  end if;

  if not leseno.are_accepted_friends(uid, v_owner) then
    raise exception 'Keine Freundschaft mit dem Autor.';
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
    values (p_story_id, uid);
    v_liked := true;
  end if;

  select count(*)::bigint
  into v_count
  from leseno.story_likes as l
  where l.story_id = p_story_id;

  return query select v_liked, coalesce(v_count, 0);
end;
$$;

create or replace function public.list_story_comments(p_story_id uuid)
returns table (
  id uuid,
  body text,
  author_friendship_code text,
  created_at timestamptz,
  is_mine boolean
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

  if not leseno.can_access_shared_story(uid, p_story_id) then
    raise exception 'Keine Berechtigung für Kommentare.';
  end if;

  -- Owner may read comments even when not currently shared (history).
  -- Friends only when shared (enforced by can_access for friends).
  return query
  select
    c.id,
    c.body,
    up.friendship_code as author_friendship_code,
    c.created_at,
    (c.author_id = uid) as is_mine
  from leseno.story_comments as c
  left join leseno.user_profiles as up
    on up.user_id = c.author_id
  where c.story_id = p_story_id
  order by c.created_at asc;
end;
$$;

create or replace function public.add_friend_story_comment(
  p_story_id uuid,
  p_body text
)
returns uuid
language plpgsql
security definer
set search_path = public, leseno
as $$
declare
  uid uuid := auth.uid();
  v_owner uuid;
  v_shared boolean;
  v_body text := trim(coalesce(p_body, ''));
  v_id uuid;
begin
  if uid is null then
    raise exception 'Nicht angemeldet.';
  end if;

  if v_body = '' then
    raise exception 'Kommentar fehlt.';
  end if;

  if char_length(v_body) > 2000 then
    raise exception 'Kommentar ist zu lang (max. 2000 Zeichen).';
  end if;

  select s.user_id, s.shared_to_book_club
  into v_owner, v_shared
  from leseno.user_stories as s
  where s.id = p_story_id;

  if v_owner is null then
    raise exception 'Geschichte nicht gefunden.';
  end if;

  if v_owner = uid then
    raise exception 'Eigene Geschichten kommentierst du nicht hier.';
  end if;

  if not coalesce(v_shared, false) then
    raise exception 'Geschichte ist nicht freigegeben.';
  end if;

  if not leseno.are_accepted_friends(uid, v_owner) then
    raise exception 'Keine Freundschaft mit dem Autor.';
  end if;

  insert into leseno.story_comments (story_id, author_id, body)
  values (p_story_id, uid, v_body)
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.record_book_club_invite(p_email text)
returns uuid
language plpgsql
security definer
set search_path = public, leseno
as $$
declare
  uid uuid := auth.uid();
  v_email text := lower(trim(coalesce(p_email, '')));
  v_count integer;
  v_id uuid;
begin
  if uid is null then
    raise exception 'Nicht angemeldet.';
  end if;

  if v_email = '' or position('@' in v_email) = 0 then
    raise exception 'Bitte eine gültige E-Mail-Adresse angeben.';
  end if;

  select count(*)::integer
  into v_count
  from leseno.book_club_invites as i
  where i.inviter_id = uid
    and i.created_at > now() - interval '1 hour';

  if coalesce(v_count, 0) >= 10 then
    raise exception 'Zu viele Einladungen. Bitte später erneut versuchen.';
  end if;

  insert into leseno.book_club_invites (inviter_id, email)
  values (uid, v_email)
  returning id into v_id;

  return v_id;
end;
$$;

-- Grants
revoke all on function public.get_my_book_club_profile() from public;
grant execute on function public.get_my_book_club_profile() to authenticated, service_role;

revoke all on function public.set_my_friendship_code(text) from public;
grant execute on function public.set_my_friendship_code(text) to authenticated, service_role;

revoke all on function public.request_friendship_by_code(text) from public;
grant execute on function public.request_friendship_by_code(text) to authenticated, service_role;

revoke all on function public.respond_to_friendship(uuid, boolean) from public;
grant execute on function public.respond_to_friendship(uuid, boolean) to authenticated, service_role;

revoke all on function public.cancel_friendship_request(uuid) from public;
grant execute on function public.cancel_friendship_request(uuid) to authenticated, service_role;

revoke all on function public.remove_friendship(uuid) from public;
grant execute on function public.remove_friendship(uuid) to authenticated, service_role;

revoke all on function public.list_my_friendships() from public;
grant execute on function public.list_my_friendships() to authenticated, service_role;

revoke all on function public.set_my_story_book_club_share(uuid, boolean) from public;
grant execute on function public.set_my_story_book_club_share(uuid, boolean) to authenticated, service_role;

revoke all on function public.list_friend_shared_stories(uuid) from public;
grant execute on function public.list_friend_shared_stories(uuid) to authenticated, service_role;

revoke all on function public.get_friend_shared_story(uuid) from public;
grant execute on function public.get_friend_shared_story(uuid) to authenticated, service_role;

revoke all on function public.toggle_friend_story_like(uuid) from public;
grant execute on function public.toggle_friend_story_like(uuid) to authenticated, service_role;

revoke all on function public.list_story_comments(uuid) from public;
grant execute on function public.list_story_comments(uuid) to authenticated, service_role;

revoke all on function public.add_friend_story_comment(uuid, text) from public;
grant execute on function public.add_friend_story_comment(uuid, text) to authenticated, service_role;

revoke all on function public.record_book_club_invite(text) from public;
grant execute on function public.record_book_club_invite(text) to authenticated, service_role;
