-- Social Media monthly planning: settings (CRAFT + image prompts) + daily posts.

create table if not exists leseno.social_media_month_settings (
  year_month text primary key,
  storyline text not null default '',
  -- Instagram CRAFT + image prompt
  ig_role text not null default '',
  ig_tone text not null default '',
  ig_format text not null default '',
  ig_action text not null default '',
  ig_image_prompt text not null default '',
  -- Facebook CRAFT + image prompt
  fb_role text not null default '',
  fb_tone text not null default '',
  fb_format text not null default '',
  fb_action text not null default '',
  fb_image_prompt text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint social_media_month_settings_ym_chk
    check (year_month ~ '^\d{4}-(0[1-9]|1[0-2])$')
);

comment on table leseno.social_media_month_settings is
  'Per-month storyline + per-channel CRAFT fields and image prompt templates.';

create table if not exists leseno.social_media_posts (
  id uuid primary key default gen_random_uuid(),
  year_month text not null references leseno.social_media_month_settings (year_month)
    on delete cascade,
  post_date date not null,
  channel text not null,
  caption text not null default '',
  image_data_url text,
  last_image_prompt text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint social_media_posts_channel_chk
    check (channel in ('instagram', 'facebook')),
  constraint social_media_posts_unique
    unique (year_month, post_date, channel)
);

comment on table leseno.social_media_posts is
  'Daily social posts per channel: caption + optional FLUX image (data URL).';

create index if not exists social_media_posts_ym_idx
  on leseno.social_media_posts (year_month, post_date);

drop trigger if exists social_media_month_settings_set_updated_at
  on leseno.social_media_month_settings;
create trigger social_media_month_settings_set_updated_at
before update on leseno.social_media_month_settings
for each row execute function leseno.set_updated_at();

drop trigger if exists social_media_posts_set_updated_at
  on leseno.social_media_posts;
create trigger social_media_posts_set_updated_at
before update on leseno.social_media_posts
for each row execute function leseno.set_updated_at();

alter table leseno.social_media_month_settings enable row level security;
alter table leseno.social_media_posts enable row level security;

revoke all on table leseno.social_media_month_settings from anon, authenticated;
revoke all on table leseno.social_media_posts from anon, authenticated;
grant all on table leseno.social_media_month_settings to service_role;
grant all on table leseno.social_media_posts to service_role;

-- ── Settings upsert / get ─────────────────────────────────────────────────

create or replace function public.admin_get_social_month_settings(p_year_month text)
returns table (
  year_month text,
  storyline text,
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
    s.storyline,
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

create or replace function public.admin_upsert_social_month_settings(
  p_year_month text,
  p_storyline text,
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
    storyline,
    ig_role, ig_tone, ig_format, ig_action, ig_image_prompt,
    fb_role, fb_tone, fb_format, fb_action, fb_image_prompt
  ) values (
    p_year_month,
    coalesce(p_storyline, ''),
    coalesce(p_ig_role, ''), coalesce(p_ig_tone, ''), coalesce(p_ig_format, ''),
    coalesce(p_ig_action, ''), coalesce(p_ig_image_prompt, ''),
    coalesce(p_fb_role, ''), coalesce(p_fb_tone, ''), coalesce(p_fb_format, ''),
    coalesce(p_fb_action, ''), coalesce(p_fb_image_prompt, '')
  )
  on conflict (year_month) do update set
    storyline = excluded.storyline,
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
  text, text, text, text, text, text, text, text, text, text, text, text
) from public;
grant execute on function public.admin_upsert_social_month_settings(
  text, text, text, text, text, text, text, text, text, text, text, text
) to service_role;

-- ── Posts list / upsert ───────────────────────────────────────────────────

create or replace function public.admin_list_social_posts(p_year_month text)
returns table (
  id uuid,
  year_month text,
  post_date date,
  channel text,
  caption text,
  image_data_url text,
  last_image_prompt text,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = leseno, public
as $$
  select
    p.id,
    p.year_month,
    p.post_date,
    p.channel,
    p.caption,
    p.image_data_url,
    p.last_image_prompt,
    p.updated_at
  from leseno.social_media_posts p
  where p.year_month = p_year_month
  order by p.post_date asc, p.channel asc;
$$;

revoke all on function public.admin_list_social_posts(text) from public;
grant execute on function public.admin_list_social_posts(text) to service_role;

create or replace function public.admin_upsert_social_post(
  p_year_month text,
  p_post_date date,
  p_channel text,
  p_caption text default null,
  p_image_data_url text default null,
  p_last_image_prompt text default null,
  p_clear_image boolean default false
)
returns table (
  id uuid,
  year_month text,
  post_date date,
  channel text,
  caption text,
  image_data_url text,
  last_image_prompt text,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = leseno, public
as $$
#variable_conflict use_column
begin
  if p_channel not in ('instagram', 'facebook') then
    raise exception 'Invalid channel.';
  end if;

  -- Ensure parent settings row exists
  insert into leseno.social_media_month_settings (year_month)
  values (p_year_month)
  on conflict (year_month) do nothing;

  insert into leseno.social_media_posts (
    year_month, post_date, channel, caption, image_data_url, last_image_prompt
  ) values (
    p_year_month,
    p_post_date,
    p_channel,
    coalesce(p_caption, ''),
    case when p_clear_image then null else p_image_data_url end,
    p_last_image_prompt
  )
  on conflict (year_month, post_date, channel) do update set
    caption = coalesce(p_caption, leseno.social_media_posts.caption),
    image_data_url = case
      when p_clear_image then null
      when p_image_data_url is not null then p_image_data_url
      else leseno.social_media_posts.image_data_url
    end,
    last_image_prompt = coalesce(
      p_last_image_prompt,
      leseno.social_media_posts.last_image_prompt
    );

  return query
  select
    p.id,
    p.year_month,
    p.post_date,
    p.channel,
    p.caption,
    p.image_data_url,
    p.last_image_prompt,
    p.updated_at
  from leseno.social_media_posts p
  where p.year_month = p_year_month
    and p.post_date = p_post_date
    and p.channel = p_channel;
end;
$$;

revoke all on function public.admin_upsert_social_post(
  text, date, text, text, text, text, boolean
) from public;
grant execute on function public.admin_upsert_social_post(
  text, date, text, text, text, text, boolean
) to service_role;
