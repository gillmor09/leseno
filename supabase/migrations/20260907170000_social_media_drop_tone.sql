-- Tone removed from global social CRAFT settings.

alter table leseno.social_media_global_settings
  drop column if exists tone;

drop function if exists public.admin_get_social_global_settings();
drop function if exists public.admin_upsert_social_global_settings(
  text, text, text, text, text, text, text, text, text
);
drop function if exists public.admin_upsert_social_global_settings(
  text, text, text, text, text, text, text, text
);

create or replace function public.admin_get_social_global_settings()
returns table (
  storyline text,
  role text,
  format text,
  ig_action text,
  ig_image_prompt text,
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
    g.format,
    g.ig_action,
    g.ig_image_prompt,
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
  p_format text,
  p_ig_action text,
  p_ig_image_prompt text,
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
    id, storyline, role, format,
    ig_action, ig_image_prompt,
    fb_action, fb_image_prompt
  ) values (
    1,
    coalesce(p_storyline, ''),
    coalesce(p_role, ''),
    coalesce(p_format, ''),
    coalesce(p_ig_action, ''),
    coalesce(p_ig_image_prompt, ''),
    coalesce(p_fb_action, ''),
    coalesce(p_fb_image_prompt, '')
  )
  on conflict (id) do update set
    storyline = excluded.storyline,
    role = excluded.role,
    format = excluded.format,
    ig_action = excluded.ig_action,
    ig_image_prompt = excluded.ig_image_prompt,
    fb_action = excluded.fb_action,
    fb_image_prompt = excluded.fb_image_prompt;
end;
$$;

revoke all on function public.admin_upsert_social_global_settings(
  text, text, text, text, text, text, text
) from public;
grant execute on function public.admin_upsert_social_global_settings(
  text, text, text, text, text, text, text
) to service_role;
