-- Admin Video-Clips: private Storage bucket + metadata table + service_role RPCs.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'video-clips',
  'video-clips',
  false,
  52428800,
  array['video/mp4']::text[]
)
on conflict (id) do update set
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create table if not exists leseno.video_clips (
  id uuid primary key default gen_random_uuid(),
  title text not null default '',
  prompt text not null default '',
  model_slug text not null default '',
  duration_seconds integer not null default 8,
  aspect_ratio text not null default '16:9',
  storage_path text not null,
  mime_type text not null default 'video/mp4',
  byte_size integer,
  source_kind text not null default 'image',
  source_file_name text not null default '',
  created_by uuid,
  created_at timestamptz not null default now(),
  constraint video_clips_source_kind_check
    check (source_kind in ('image', 'video')),
  constraint video_clips_duration_check
    check (duration_seconds in (4, 6, 8, 10, 12, 15, 20)),
  constraint video_clips_aspect_check
    check (aspect_ratio in ('16:9', '9:16'))
);

create index if not exists video_clips_created_at_idx
  on leseno.video_clips (created_at desc);

comment on table leseno.video_clips is
  'Admin Gemini Veo clips; MP4 lives in Storage bucket video-clips.';

create or replace function public.admin_list_video_clips()
returns table (
  id uuid,
  title text,
  prompt text,
  model_slug text,
  duration_seconds integer,
  aspect_ratio text,
  storage_path text,
  mime_type text,
  byte_size integer,
  source_kind text,
  source_file_name text,
  created_by uuid,
  created_at timestamptz
)
language sql
security definer
set search_path = leseno, public
as $$
  select
    c.id,
    c.title,
    c.prompt,
    c.model_slug,
    c.duration_seconds,
    c.aspect_ratio,
    c.storage_path,
    c.mime_type,
    c.byte_size,
    c.source_kind,
    c.source_file_name,
    c.created_by,
    c.created_at
  from leseno.video_clips c
  order by c.created_at desc;
$$;

revoke all on function public.admin_list_video_clips() from public;
grant execute on function public.admin_list_video_clips() to service_role;

create or replace function public.admin_insert_video_clip(
  p_id uuid,
  p_title text,
  p_prompt text,
  p_model_slug text,
  p_duration_seconds integer,
  p_aspect_ratio text,
  p_storage_path text,
  p_mime_type text,
  p_byte_size integer,
  p_source_kind text,
  p_source_file_name text,
  p_created_by uuid
)
returns table (
  id uuid,
  title text,
  prompt text,
  model_slug text,
  duration_seconds integer,
  aspect_ratio text,
  storage_path text,
  mime_type text,
  byte_size integer,
  source_kind text,
  source_file_name text,
  created_by uuid,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = leseno, public
as $$
begin
  if p_id is null
    or p_storage_path is null
    or length(trim(p_storage_path)) = 0
  then
    raise exception 'Video-Clip-Angaben unvollständig.';
  end if;

  insert into leseno.video_clips (
    id,
    title,
    prompt,
    model_slug,
    duration_seconds,
    aspect_ratio,
    storage_path,
    mime_type,
    byte_size,
    source_kind,
    source_file_name,
    created_by
  )
  values (
    p_id,
    coalesce(nullif(trim(p_title), ''), 'Video-Clip'),
    coalesce(p_prompt, ''),
    coalesce(nullif(trim(p_model_slug), ''), ''),
    coalesce(p_duration_seconds, 8),
    coalesce(nullif(trim(p_aspect_ratio), ''), '16:9'),
    trim(p_storage_path),
    coalesce(nullif(trim(p_mime_type), ''), 'video/mp4'),
    p_byte_size,
    case
      when lower(coalesce(p_source_kind, '')) = 'video' then 'video'
      else 'image'
    end,
    coalesce(p_source_file_name, ''),
    p_created_by
  );

  return query
  select
    c.id,
    c.title,
    c.prompt,
    c.model_slug,
    c.duration_seconds,
    c.aspect_ratio,
    c.storage_path,
    c.mime_type,
    c.byte_size,
    c.source_kind,
    c.source_file_name,
    c.created_by,
    c.created_at
  from leseno.video_clips c
  where c.id = p_id;
end;
$$;

revoke all on function public.admin_insert_video_clip(
  uuid, text, text, text, integer, text, text, text, integer, text, text, uuid
) from public;
grant execute on function public.admin_insert_video_clip(
  uuid, text, text, text, integer, text, text, text, integer, text, text, uuid
) to service_role;

create or replace function public.admin_delete_video_clip(p_id uuid)
returns table (
  deleted boolean,
  storage_path text
)
language plpgsql
security definer
set search_path = leseno, public
as $$
declare
  v_path text;
begin
  delete from leseno.video_clips c
  where c.id = p_id
  returning c.storage_path into v_path;

  if v_path is null then
    return query select false, null::text;
    return;
  end if;

  return query select true, v_path;
end;
$$;

revoke all on function public.admin_delete_video_clip(uuid) from public;
grant execute on function public.admin_delete_video_clip(uuid) to service_role;
