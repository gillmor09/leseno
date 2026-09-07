-- Instagram-only social planning: action + image_prompt are fully global.
-- Facebook channel fields removed from settings (existing fb posts remain unused).

alter table leseno.social_media_global_settings
  add column if not exists action text not null default '',
  add column if not exists image_prompt text not null default '';

do $$
begin
  update leseno.social_media_global_settings g
  set
    action = case
      when length(trim(g.action)) > 0 then g.action
      else coalesce(g.ig_action, '')
    end,
    image_prompt = case
      when length(trim(g.image_prompt)) > 0 then g.image_prompt
      else coalesce(g.ig_image_prompt, '')
    end
  where g.id = 1;
end $$;

alter table leseno.social_media_global_settings
  drop column if exists ig_action,
  drop column if exists ig_image_prompt,
  drop column if exists fb_action,
  drop column if exists fb_image_prompt;

drop function if exists public.admin_get_social_global_settings();
drop function if exists public.admin_upsert_social_global_settings(
  text, text, text, text, text, text, text
);

create or replace function public.admin_get_social_global_settings()
returns table (
  storyline text,
  role text,
  format text,
  action text,
  image_prompt text,
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
    g.action,
    g.image_prompt,
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
  p_action text,
  p_image_prompt text
)
returns void
language plpgsql
security definer
set search_path = leseno, public
as $$
begin
  insert into leseno.social_media_global_settings (
    id, storyline, role, format, action, image_prompt
  ) values (
    1,
    coalesce(p_storyline, ''),
    coalesce(p_role, ''),
    coalesce(p_format, ''),
    coalesce(p_action, ''),
    coalesce(p_image_prompt, '')
  )
  on conflict (id) do update set
    storyline = excluded.storyline,
    role = excluded.role,
    format = excluded.format,
    action = excluded.action,
    image_prompt = excluded.image_prompt;
end;
$$;

revoke all on function public.admin_upsert_social_global_settings(
  text, text, text, text, text
) from public;
grant execute on function public.admin_upsert_social_global_settings(
  text, text, text, text, text
) to service_role;
