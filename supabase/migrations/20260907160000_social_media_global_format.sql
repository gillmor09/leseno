-- Format global (like storyline / role / tone); channels keep action + image prompt only.

alter table leseno.social_media_global_settings
  add column if not exists format text not null default '';

do $$
declare
  ig text;
  fb text;
  cur text;
begin
  select g.format, g.ig_format, g.fb_format
    into cur, ig, fb
  from leseno.social_media_global_settings g
  where g.id = 1;

  if found and length(trim(coalesce(cur, ''))) = 0 then
    update leseno.social_media_global_settings
    set format = case
      when length(trim(coalesce(ig, ''))) > 0 then ig
      else coalesce(fb, '')
    end
    where id = 1;
  end if;
end $$;

alter table leseno.social_media_global_settings
  drop column if exists ig_format,
  drop column if exists fb_format;

drop function if exists public.admin_get_social_global_settings();
drop function if exists public.admin_upsert_social_global_settings(
  text, text, text, text, text, text, text, text, text
);

create or replace function public.admin_get_social_global_settings()
returns table (
  storyline text,
  role text,
  tone text,
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
    g.tone,
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
  p_tone text,
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
    id, storyline, role, tone, format,
    ig_action, ig_image_prompt,
    fb_action, fb_image_prompt
  ) values (
    1,
    coalesce(p_storyline, ''),
    coalesce(p_role, ''),
    coalesce(p_tone, ''),
    coalesce(p_format, ''),
    coalesce(p_ig_action, ''),
    coalesce(p_ig_image_prompt, ''),
    coalesce(p_fb_action, ''),
    coalesce(p_fb_image_prompt, '')
  )
  on conflict (id) do update set
    storyline = excluded.storyline,
    role = excluded.role,
    tone = excluded.tone,
    format = excluded.format,
    ig_action = excluded.ig_action,
    ig_image_prompt = excluded.ig_image_prompt,
    fb_action = excluded.fb_action,
    fb_image_prompt = excluded.fb_image_prompt;
end;
$$;

revoke all on function public.admin_upsert_social_global_settings(
  text, text, text, text, text, text, text, text
) from public;
grant execute on function public.admin_upsert_social_global_settings(
  text, text, text, text, text, text, text, text
) to service_role;
