-- Story TTS: private Storage bucket + metadata columns on user_stories.
-- Audio lives in Storage (not bytea) — large stories stay small in Postgres.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'story-tts',
  'story-tts',
  false,
  52428800,
  array['audio/mpeg']::text[]
)
on conflict (id) do update set
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

alter table leseno.user_stories
  add column if not exists tts_storage_path text,
  add column if not exists tts_mime_type text,
  add column if not exists tts_byte_size integer,
  add column if not exists tts_model_slug text,
  add column if not exists tts_source_hash text,
  add column if not exists tts_word_timings jsonb,
  add column if not exists tts_created_at timestamptz;

comment on column leseno.user_stories.tts_storage_path is
  'Private path in storage bucket story-tts (user_id/story_id.mp3).';
comment on column leseno.user_stories.tts_source_hash is
  'SHA-256 hex of plain story text used when synthesizing TTS.';

-- Signed URLs are created server-side with the service role; no public read policy.
-- Service role bypasses Storage RLS for upload/delete.

create or replace function public.set_my_story_tts(
  p_id uuid,
  p_storage_path text,
  p_mime_type text default 'audio/mpeg',
  p_byte_size integer default null,
  p_model_slug text default null,
  p_source_hash text default null,
  p_word_timings jsonb default null
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
  if p_id is null or p_storage_path is null or length(trim(p_storage_path)) = 0 then
    raise exception 'TTS-Angaben unvollständig.';
  end if;

  update leseno.user_stories
  set
    tts_storage_path = trim(p_storage_path),
    tts_mime_type = coalesce(nullif(trim(p_mime_type), ''), 'audio/mpeg'),
    tts_byte_size = p_byte_size,
    tts_model_slug = nullif(trim(coalesce(p_model_slug, '')), ''),
    tts_source_hash = nullif(trim(coalesce(p_source_hash, '')), ''),
    tts_word_timings = p_word_timings,
    tts_created_at = now()
  where id = p_id
    and user_id = uid
  returning true into v_ok;

  if not coalesce(v_ok, false) then
    raise exception 'Geschichte nicht gefunden.';
  end if;

  return true;
end;
$$;

revoke all on function public.set_my_story_tts(
  uuid, text, text, integer, text, text, jsonb
) from public;
grant execute on function public.set_my_story_tts(
  uuid, text, text, integer, text, text, jsonb
) to authenticated, service_role;

create or replace function public.get_my_story_tts(p_id uuid)
returns table (
  storage_path text,
  mime_type text,
  byte_size integer,
  model_slug text,
  source_hash text,
  word_timings jsonb,
  created_at timestamptz
)
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

  return query
  select
    s.tts_storage_path,
    s.tts_mime_type,
    s.tts_byte_size,
    s.tts_model_slug,
    s.tts_source_hash,
    s.tts_word_timings,
    s.tts_created_at
  from leseno.user_stories as s
  where s.id = p_id
    and s.user_id = uid
    and s.tts_storage_path is not null
    and length(trim(s.tts_storage_path)) > 0;
end;
$$;

revoke all on function public.get_my_story_tts(uuid) from public;
grant execute on function public.get_my_story_tts(uuid)
  to authenticated, service_role;
