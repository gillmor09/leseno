-- Optional parent PIN on child profiles (Meine Welt).
-- Soft lock: UI + server actions require unlock cookie; pin_hash never listed to clients.

alter table leseno.child_profiles
  add column if not exists pin_hash text;

comment on column leseno.child_profiles.pin_hash is
  'Optional scrypt hash for parent PIN; null = no lock.';

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
  has_pin boolean
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
    (p.pin_hash is not null and char_length(trim(p.pin_hash)) > 0) as has_pin
  from leseno.child_profiles as p
  where p.user_id = uid
  order by p.sort_order asc, p.created_at asc;
end;
$$;

revoke all on function public.list_my_child_profiles() from public;
grant execute on function public.list_my_child_profiles() to authenticated;

/** Owner-only: stored PIN hash for server-side verify (never send to browser). */
create or replace function public.get_my_child_profile_pin_hash(p_id uuid)
returns text
language plpgsql
security definer
set search_path = public, leseno
as $$
declare
  uid uuid := auth.uid();
  v_hash text;
begin
  if uid is null then
    raise exception 'Nicht angemeldet.';
  end if;
  if p_id is null then
    raise exception 'Profil-ID fehlt.';
  end if;

  select p.pin_hash
  into v_hash
  from leseno.child_profiles as p
  where p.id = p_id and p.user_id = uid;

  if not found then
    raise exception 'Profil nicht gefunden.';
  end if;

  return nullif(trim(coalesce(v_hash, '')), '');
end;
$$;

create or replace function public.set_my_child_profile_pin(
  p_id uuid,
  p_pin_hash text
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
  if p_pin_hash is null or char_length(trim(p_pin_hash)) = 0 then
    raise exception 'PIN-Hash fehlt.';
  end if;

  update leseno.child_profiles
  set pin_hash = trim(p_pin_hash),
      updated_at = now()
  where id = p_id and user_id = uid;

  if not found then
    raise exception 'Profil nicht gefunden.';
  end if;
end;
$$;

create or replace function public.clear_my_child_profile_pin(p_id uuid)
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

  update leseno.child_profiles
  set pin_hash = null,
      updated_at = now()
  where id = p_id and user_id = uid;

  if not found then
    raise exception 'Profil nicht gefunden.';
  end if;
end;
$$;

revoke all on function public.get_my_child_profile_pin_hash(uuid) from public;
revoke all on function public.set_my_child_profile_pin(uuid, text) from public;
revoke all on function public.clear_my_child_profile_pin(uuid) from public;

grant execute on function public.get_my_child_profile_pin_hash(uuid) to authenticated;
grant execute on function public.set_my_child_profile_pin(uuid, text) to authenticated;
grant execute on function public.clear_my_child_profile_pin(uuid) to authenticated;
