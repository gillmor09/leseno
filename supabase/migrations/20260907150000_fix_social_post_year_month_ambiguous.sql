-- Fix: RETURNS TABLE output vars shadowed column names → "year_month is ambiguous"
-- on ON CONFLICT / WHERE in admin_upsert_social_post.

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
