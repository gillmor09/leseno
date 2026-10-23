-- Sachbuch export package: marketing texts, Titelei, cover (like novels).

alter table leseno.sachbuch_kontext
  add column if not exists suggested_title text not null default '',
  add column if not exists subtitle text not null default '',
  add column if not exists summary text not null default '',
  add column if not exists keywords jsonb not null default '[]'::jsonb,
  add column if not exists autor_name text not null default 'Jannis Fynk',
  add column if not exists vorsatz jsonb not null default '{}'::jsonb,
  add column if not exists cover_image_data_url text not null default '',
  add column if not exists cover_prompt text not null default '';

drop function if exists public.admin_get_sachbuch_kontext(uuid);
create or replace function public.admin_get_sachbuch_kontext(p_id uuid)
returns table (
  id uuid,
  title text,
  stilbibel text,
  zielgruppe text,
  agents jsonb,
  kapitel jsonb,
  idee jsonb,
  evidenz jsonb,
  makro jsonb,
  suggested_title text,
  subtitle text,
  summary text,
  keywords jsonb,
  autor_name text,
  vorsatz jsonb,
  cover_image_data_url text,
  cover_prompt text,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = leseno, public
as $$
  select
    s.id,
    s.title,
    s.stilbibel,
    s.zielgruppe,
    s.agents,
    s.kapitel,
    s.idee,
    s.evidenz,
    s.makro,
    s.suggested_title,
    s.subtitle,
    s.summary,
    s.keywords,
    s.autor_name,
    s.vorsatz,
    s.cover_image_data_url,
    s.cover_prompt,
    s.created_at,
    s.updated_at
  from leseno.sachbuch_kontext s
  where s.id = p_id;
$$;

revoke all on function public.admin_get_sachbuch_kontext(uuid) from public;
grant execute on function public.admin_get_sachbuch_kontext(uuid) to service_role;

create or replace function public.admin_upsert_sachbuch_export(
  p_id uuid,
  p_suggested_title text default null,
  p_subtitle text default null,
  p_summary text default null,
  p_keywords jsonb default null,
  p_autor_name text default null,
  p_vorsatz jsonb default null,
  p_cover_image_data_url text default null,
  p_cover_prompt text default null,
  p_title text default null
)
returns void
language plpgsql
security definer
set search_path = leseno, public
as $$
begin
  update leseno.sachbuch_kontext
  set
    suggested_title = coalesce(p_suggested_title, suggested_title),
    subtitle = coalesce(p_subtitle, subtitle),
    summary = coalesce(p_summary, summary),
    keywords = coalesce(p_keywords, keywords),
    autor_name = coalesce(nullif(trim(p_autor_name), ''), autor_name),
    vorsatz = coalesce(p_vorsatz, vorsatz),
    cover_image_data_url = coalesce(p_cover_image_data_url, cover_image_data_url),
    cover_prompt = coalesce(p_cover_prompt, cover_prompt),
    title = coalesce(nullif(trim(p_title), ''), title),
    updated_at = now()
  where id = p_id;
  if not found then
    raise exception 'Sachbuch nicht gefunden.';
  end if;
end;
$$;

revoke all on function public.admin_upsert_sachbuch_export(
  uuid, text, text, text, jsonb, text, jsonb, text, text, text
) from public;
grant execute on function public.admin_upsert_sachbuch_export(
  uuid, text, text, text, jsonb, text, jsonb, text, text, text
) to service_role;
