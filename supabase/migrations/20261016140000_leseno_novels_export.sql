-- Export package fields for greenfield novels (cover, blurb, keywords, front matter).

alter table leseno.novels
  add column if not exists subtitle text not null default '',
  add column if not exists summary text not null default '',
  add column if not exists keywords jsonb not null default '[]'::jsonb,
  add column if not exists autor_name text not null default 'Jannis Fynk',
  add column if not exists vorsatz jsonb not null default '{}'::jsonb,
  add column if not exists cover_image_data_url text not null default '',
  add column if not exists cover_prompt text not null default '';

create or replace function public.admin_upsert_novel_export(
  p_id uuid,
  p_subtitle text default null,
  p_summary text default null,
  p_keywords jsonb default null,
  p_autor_name text default null,
  p_vorsatz jsonb default null,
  p_cover_image_data_url text default null,
  p_cover_prompt text default null
)
returns void
language plpgsql
security definer
set search_path = leseno, public
as $$
begin
  update leseno.novels
  set
    subtitle = coalesce(p_subtitle, subtitle),
    summary = coalesce(p_summary, summary),
    keywords = coalesce(p_keywords, keywords),
    autor_name = coalesce(nullif(trim(p_autor_name), ''), autor_name),
    vorsatz = coalesce(p_vorsatz, vorsatz),
    cover_image_data_url = coalesce(p_cover_image_data_url, cover_image_data_url),
    cover_prompt = coalesce(p_cover_prompt, cover_prompt)
  where id = p_id;
  if not found then
    raise exception 'Novel nicht gefunden.';
  end if;
end;
$$;

revoke all on function public.admin_upsert_novel_export(uuid, text, text, jsonb, text, jsonb, text, text) from public;
grant execute on function public.admin_upsert_novel_export(uuid, text, text, jsonb, text, jsonb, text, text) to service_role;
