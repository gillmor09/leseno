-- Social posts: persist motivation angle, list all + usage counts, wipe old calendar posts.

delete from leseno.social_media_posts;
delete from leseno.social_media_month_settings;

alter table leseno.social_media_posts
  add column if not exists angle_id text;

drop function if exists public.admin_list_social_posts(text);
drop function if exists public.admin_list_all_social_posts();
drop function if exists public.admin_social_angle_usage();
drop function if exists public.admin_upsert_social_post(
  text, date, text, text, text, text, boolean, boolean
);
drop function if exists public.admin_upsert_social_post(
  text, date, text, text, text, text, boolean, boolean, text
);

create or replace function public.admin_list_social_posts(p_year_month text)
returns table (
  id uuid,
  year_month text,
  post_date date,
  channel text,
  caption text,
  image_data_url text,
  last_image_prompt text,
  published boolean,
  angle_id text,
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
    p.published,
    p.angle_id,
    p.updated_at
  from leseno.social_media_posts p
  where p.year_month = p_year_month
  order by p.post_date desc, p.channel asc;
$$;

revoke all on function public.admin_list_social_posts(text) from public;
grant execute on function public.admin_list_social_posts(text) to service_role;

create or replace function public.admin_list_all_social_posts()
returns table (
  id uuid,
  year_month text,
  post_date date,
  channel text,
  caption text,
  image_data_url text,
  last_image_prompt text,
  published boolean,
  angle_id text,
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
    p.published,
    p.angle_id,
    p.updated_at
  from leseno.social_media_posts p
  order by p.post_date desc, p.updated_at desc;
$$;

revoke all on function public.admin_list_all_social_posts() from public;
grant execute on function public.admin_list_all_social_posts() to service_role;

create or replace function public.admin_social_angle_usage()
returns table (
  angle_id text,
  use_count bigint
)
language sql
stable
security definer
set search_path = leseno, public
as $$
  select
    p.angle_id,
    count(*)::bigint as use_count
  from leseno.social_media_posts p
  where p.angle_id is not null
    and length(trim(p.angle_id)) > 0
  group by p.angle_id
  order by use_count desc, p.angle_id asc;
$$;

revoke all on function public.admin_social_angle_usage() from public;
grant execute on function public.admin_social_angle_usage() to service_role;

create or replace function public.admin_upsert_social_post(
  p_year_month text,
  p_post_date date,
  p_channel text,
  p_caption text default null,
  p_image_data_url text default null,
  p_last_image_prompt text default null,
  p_clear_image boolean default false,
  p_published boolean default null,
  p_angle_id text default null
)
returns table (
  id uuid,
  year_month text,
  post_date date,
  channel text,
  caption text,
  image_data_url text,
  last_image_prompt text,
  published boolean,
  angle_id text,
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

  insert into leseno.social_media_month_settings (year_month)
  values (p_year_month)
  on conflict (year_month) do nothing;

  insert into leseno.social_media_posts (
    year_month,
    post_date,
    channel,
    caption,
    image_data_url,
    last_image_prompt,
    published,
    angle_id
  ) values (
    p_year_month,
    p_post_date,
    p_channel,
    coalesce(p_caption, ''),
    case when p_clear_image then null else p_image_data_url end,
    case when p_clear_image then null else p_last_image_prompt end,
    coalesce(p_published, false),
    nullif(trim(coalesce(p_angle_id, '')), '')
  )
  on conflict (year_month, post_date, channel) do update set
    caption = coalesce(p_caption, leseno.social_media_posts.caption),
    image_data_url = case
      when p_clear_image then null
      when p_image_data_url is not null then p_image_data_url
      else leseno.social_media_posts.image_data_url
    end,
    last_image_prompt = case
      when p_clear_image then null
      when p_last_image_prompt is not null then p_last_image_prompt
      else leseno.social_media_posts.last_image_prompt
    end,
    published = coalesce(p_published, leseno.social_media_posts.published),
    angle_id = case
      when p_angle_id is not null then nullif(trim(p_angle_id), '')
      else leseno.social_media_posts.angle_id
    end;

  return query
  select
    p.id,
    p.year_month,
    p.post_date,
    p.channel,
    p.caption,
    p.image_data_url,
    p.last_image_prompt,
    p.published,
    p.angle_id,
    p.updated_at
  from leseno.social_media_posts p
  where p.year_month = p_year_month
    and p.post_date = p_post_date
    and p.channel = p_channel;
end;
$$;

revoke all on function public.admin_upsert_social_post(
  text, date, text, text, text, text, boolean, boolean, text
) from public;
grant execute on function public.admin_upsert_social_post(
  text, date, text, text, text, text, boolean, boolean, text
) to service_role;
