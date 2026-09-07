-- Global storyline (brand context) — not tied to a calendar month.

create table if not exists leseno.social_media_global_settings (
  id smallint primary key default 1 check (id = 1),
  storyline text not null default '',
  updated_at timestamptz not null default now()
);

comment on table leseno.social_media_global_settings is
  'Singleton: overarching Social Media storyline (CRAFT Context) for all months.';

insert into leseno.social_media_global_settings (id, storyline)
values (1, '')
on conflict (id) do nothing;

-- Carry over storyline from an existing month row if present.
update leseno.social_media_global_settings g
set storyline = coalesce(
  (
    select s.storyline
    from leseno.social_media_month_settings s
    where length(trim(s.storyline)) > 0
    order by s.updated_at desc
    limit 1
  ),
  g.storyline
)
where g.id = 1;

alter table leseno.social_media_month_settings
  drop column if exists storyline;

drop trigger if exists social_media_global_settings_set_updated_at
  on leseno.social_media_global_settings;
create trigger social_media_global_settings_set_updated_at
before update on leseno.social_media_global_settings
for each row execute function leseno.set_updated_at();

alter table leseno.social_media_global_settings enable row level security;
revoke all on table leseno.social_media_global_settings from anon, authenticated;
grant all on table leseno.social_media_global_settings to service_role;

create or replace function public.admin_get_social_storyline()
returns text
language sql
stable
security definer
set search_path = leseno, public
as $$
  select storyline from leseno.social_media_global_settings where id = 1;
$$;

revoke all on function public.admin_get_social_storyline() from public;
grant execute on function public.admin_get_social_storyline() to service_role;

create or replace function public.admin_set_social_storyline(p_storyline text)
returns void
language plpgsql
security definer
set search_path = leseno, public
as $$
begin
  insert into leseno.social_media_global_settings (id, storyline)
  values (1, coalesce(p_storyline, ''))
  on conflict (id) do update set storyline = excluded.storyline;
end;
$$;

revoke all on function public.admin_set_social_storyline(text) from public;
grant execute on function public.admin_set_social_storyline(text) to service_role;

-- Rebuild month settings RPCs without storyline.

drop function if exists public.admin_get_social_month_settings(text);

create or replace function public.admin_get_social_month_settings(p_year_month text)
returns table (
  year_month text,
  ig_role text,
  ig_tone text,
  ig_format text,
  ig_action text,
  ig_image_prompt text,
  fb_role text,
  fb_tone text,
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
    s.year_month,
    s.ig_role,
    s.ig_tone,
    s.ig_format,
    s.ig_action,
    s.ig_image_prompt,
    s.fb_role,
    s.fb_tone,
    s.fb_format,
    s.fb_action,
    s.fb_image_prompt,
    s.updated_at
  from leseno.social_media_month_settings s
  where s.year_month = p_year_month;
$$;

revoke all on function public.admin_get_social_month_settings(text) from public;
grant execute on function public.admin_get_social_month_settings(text) to service_role;

drop function if exists public.admin_upsert_social_month_settings(
  text, text, text, text, text, text, text, text, text, text, text, text
);

create or replace function public.admin_upsert_social_month_settings(
  p_year_month text,
  p_ig_role text,
  p_ig_tone text,
  p_ig_format text,
  p_ig_action text,
  p_ig_image_prompt text,
  p_fb_role text,
  p_fb_tone text,
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
  if p_year_month is null or p_year_month !~ '^\d{4}-(0[1-9]|1[0-2])$' then
    raise exception 'Invalid year_month.';
  end if;

  insert into leseno.social_media_month_settings (
    year_month,
    ig_role, ig_tone, ig_format, ig_action, ig_image_prompt,
    fb_role, fb_tone, fb_format, fb_action, fb_image_prompt
  ) values (
    p_year_month,
    coalesce(p_ig_role, ''), coalesce(p_ig_tone, ''), coalesce(p_ig_format, ''),
    coalesce(p_ig_action, ''), coalesce(p_ig_image_prompt, ''),
    coalesce(p_fb_role, ''), coalesce(p_fb_tone, ''), coalesce(p_fb_format, ''),
    coalesce(p_fb_action, ''), coalesce(p_fb_image_prompt, '')
  )
  on conflict (year_month) do update set
    ig_role = excluded.ig_role,
    ig_tone = excluded.ig_tone,
    ig_format = excluded.ig_format,
    ig_action = excluded.ig_action,
    ig_image_prompt = excluded.ig_image_prompt,
    fb_role = excluded.fb_role,
    fb_tone = excluded.fb_tone,
    fb_format = excluded.fb_format,
    fb_action = excluded.fb_action,
    fb_image_prompt = excluded.fb_image_prompt;
end;
$$;

revoke all on function public.admin_upsert_social_month_settings(
  text, text, text, text, text, text, text, text, text, text, text
) from public;
grant execute on function public.admin_upsert_social_month_settings(
  text, text, text, text, text, text, text, text, text, text, text
) to service_role;
