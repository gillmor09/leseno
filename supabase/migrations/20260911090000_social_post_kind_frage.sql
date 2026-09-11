-- Third social post kind: Frage (question → caption → fixed bg3 overlay).

alter table leseno.social_media_posts
  drop constraint if exists social_media_posts_post_kind_check;

alter table leseno.social_media_posts
  add constraint social_media_posts_post_kind_check
  check (post_kind in ('winkel', 'marketing', 'frage'));

create or replace function public.admin_upsert_social_post(
  p_year_month text,
  p_post_date date,
  p_channel text,
  p_caption text default null,
  p_image_data_url text default null,
  p_last_image_prompt text default null,
  p_clear_image boolean default false,
  p_published boolean default null,
  p_angle_id text default null,
  p_post_kind text default 'winkel'
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
  post_kind text,
  angle_id text,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = leseno, public
as $$
#variable_conflict use_column
declare
  v_angle text := nullif(trim(coalesce(p_angle_id, '')), '');
  v_kind text := nullif(trim(coalesce(p_post_kind, '')), '');
begin
  if p_channel not in ('instagram', 'facebook') then
    raise exception 'Invalid channel.';
  end if;

  if v_kind is null then
    v_kind := 'winkel';
  end if;

  if v_kind not in ('winkel', 'marketing', 'frage') then
    raise exception 'Invalid post_kind.';
  end if;

  if v_angle is null then
    raise exception 'Winkel/Thema (angle_id) ist erforderlich.';
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
    post_kind,
    angle_id
  ) values (
    p_year_month,
    p_post_date,
    p_channel,
    coalesce(p_caption, ''),
    case when p_clear_image then null else p_image_data_url end,
    case when p_clear_image then null else p_last_image_prompt end,
    coalesce(p_published, false),
    v_kind,
    v_angle
  )
  on conflict (post_date, channel, post_kind, angle_id) do update set
    year_month = excluded.year_month,
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
    published = coalesce(p_published, leseno.social_media_posts.published);

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
    p.post_kind,
    p.angle_id,
    p.updated_at
  from leseno.social_media_posts p
  where p.post_date = p_post_date
    and p.channel = p_channel
    and p.post_kind = v_kind
    and p.angle_id = v_angle;
end;
$$;

revoke all on function public.admin_upsert_social_post(
  text, date, text, text, text, text, boolean, boolean, text, text
) from public;
grant execute on function public.admin_upsert_social_post(
  text, date, text, text, text, text, boolean, boolean, text, text
) to service_role;
