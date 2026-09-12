-- Store Gemini Veo download URI for optional clip extension (valid ~2 days).

alter table leseno.video_clips
  add column if not exists veo_file_uri text;

comment on column leseno.video_clips.veo_file_uri is
  'Gemini Files download URI from Veo generation; needed to extend the clip.';

drop function if exists public.admin_list_video_clips();
drop function if exists public.admin_insert_video_clip(
  uuid, text, text, text, integer, text, text, text, integer, text, text, uuid
);

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
  veo_file_uri text,
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
    c.veo_file_uri,
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
  p_veo_file_uri text,
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
  veo_file_uri text,
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
    veo_file_uri,
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
    nullif(trim(coalesce(p_veo_file_uri, '')), ''),
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
    c.veo_file_uri,
    c.created_by,
    c.created_at
  from leseno.video_clips c
  where c.id = p_id;
end;
$$;

revoke all on function public.admin_insert_video_clip(
  uuid, text, text, text, integer, text, text, text, integer, text, text, text, uuid
) from public;
grant execute on function public.admin_insert_video_clip(
  uuid, text, text, text, integer, text, text, text, integer, text, text, text, uuid
) to service_role;
