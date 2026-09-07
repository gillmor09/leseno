-- Role + Tone global; Format / Action / image prompt global per channel.
-- Month settings keep only year_month as parent for posts.

alter table leseno.social_media_global_settings
  add column if not exists role text not null default '',
  add column if not exists tone text not null default '',
  add column if not exists ig_format text not null default '',
  add column if not exists ig_action text not null default '',
  add column if not exists ig_image_prompt text not null default '',
  add column if not exists fb_format text not null default '',
  add column if not exists fb_action text not null default '',
  add column if not exists fb_image_prompt text not null default '';

-- Migrate from newest month row if global fields empty.
do $$
declare
  m record;
begin
  select *
  into m
  from leseno.social_media_month_settings
  order by updated_at desc
  limit 1;

  if found then
    update leseno.social_media_global_settings g
    set
      role = case when length(trim(g.role)) = 0 then coalesce(m.ig_role, m.fb_role, '') else g.role end,
      tone = case when length(trim(g.tone)) = 0 then coalesce(m.ig_tone, m.fb_tone, '') else g.tone end,
      ig_format = case when length(trim(g.ig_format)) = 0 then coalesce(m.ig_format, '') else g.ig_format end,
      ig_action = case when length(trim(g.ig_action)) = 0 then coalesce(m.ig_action, '') else g.ig_action end,
      ig_image_prompt = case when length(trim(g.ig_image_prompt)) = 0 then coalesce(m.ig_image_prompt, '') else g.ig_image_prompt end,
      fb_format = case when length(trim(g.fb_format)) = 0 then coalesce(m.fb_format, '') else g.fb_format end,
      fb_action = case when length(trim(g.fb_action)) = 0 then coalesce(m.fb_action, '') else g.fb_action end,
      fb_image_prompt = case when length(trim(g.fb_image_prompt)) = 0 then coalesce(m.fb_image_prompt, '') else g.fb_image_prompt end
    where g.id = 1;
  end if;
end $$;

alter table leseno.social_media_month_settings
  drop column if exists ig_role,
  drop column if exists ig_tone,
  drop column if exists ig_format,
  drop column if exists ig_action,
  drop column if exists ig_image_prompt,
  drop column if exists fb_role,
  drop column if exists fb_tone,
  drop column if exists fb_format,
  drop column if exists fb_action,
  drop column if exists fb_image_prompt;

drop function if exists public.admin_get_social_storyline();
drop function if exists public.admin_set_social_storyline(text);
drop function if exists public.admin_get_social_month_settings(text);
drop function if exists public.admin_upsert_social_month_settings(
  text, text, text, text, text, text, text, text, text, text, text
);

create or replace function public.admin_get_social_global_settings()
returns table (
  storyline text,
  role text,
  tone text,
  ig_format text,
  ig_action text,
  ig_image_prompt text,
  fb_format text,
  fb_action text,
  fb_image_prompt text,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = leseno, public
as $$
  select
    g.storyline,
    g.role,
    g.tone,
    g.ig_format,
    g.ig_action,
    g.ig_image_prompt,
    g.fb_format,
    g.fb_action,
    g.fb_image_prompt,
    g.updated_at
  from leseno.social_media_global_settings g
  where g.id = 1;
$$;

revoke all on function public.admin_get_social_global_settings() from public;
grant execute on function public.admin_get_social_global_settings() to service_role;

create or replace function public.admin_upsert_social_global_settings(
  p_storyline text,
  p_role text,
  p_tone text,
  p_ig_format text,
  p_ig_action text,
  p_ig_image_prompt text,
  p_fb_format text,
  p_fb_action text,
  p_fb_image_prompt text
)
returns void
language plpgsql
security definer
set search_path = leseno, public
as $$
begin
  insert into leseno.social_media_global_settings (
    id, storyline, role, tone,
    ig_format, ig_action, ig_image_prompt,
    fb_format, fb_action, fb_image_prompt
  ) values (
    1,
    coalesce(p_storyline, ''),
    coalesce(p_role, ''),
    coalesce(p_tone, ''),
    coalesce(p_ig_format, ''),
    coalesce(p_ig_action, ''),
    coalesce(p_ig_image_prompt, ''),
    coalesce(p_fb_format, ''),
    coalesce(p_fb_action, ''),
    coalesce(p_fb_image_prompt, '')
  )
  on conflict (id) do update set
    storyline = excluded.storyline,
    role = excluded.role,
    tone = excluded.tone,
    ig_format = excluded.ig_format,
    ig_action = excluded.ig_action,
    ig_image_prompt = excluded.ig_image_prompt,
    fb_format = excluded.fb_format,
    fb_action = excluded.fb_action,
    fb_image_prompt = excluded.fb_image_prompt;
end;
$$;

revoke all on function public.admin_upsert_social_global_settings(
  text, text, text, text, text, text, text, text, text
) from public;
grant execute on function public.admin_upsert_social_global_settings(
  text, text, text, text, text, text, text, text, text
) to service_role;

-- Ensure month parent row exists (posts FK).
create or replace function public.admin_ensure_social_month(p_year_month text)
returns void
language plpgsql
security definer
set search_path = leseno, public
as $$
begin
  if p_year_month is null or p_year_month !~ '^\d{4}-(0[1-9]|1[0-2])$' then
    raise exception 'Invalid year_month.';
  end if;
  insert into leseno.social_media_month_settings (year_month)
  values (p_year_month)
  on conflict (year_month) do nothing;
end;
$$;

revoke all on function public.admin_ensure_social_month(text) from public;
grant execute on function public.admin_ensure_social_month(text) to service_role;
