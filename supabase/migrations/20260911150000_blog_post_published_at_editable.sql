-- Allow admins to set / override blog_posts.published_at on upsert.

drop function if exists public.admin_upsert_blog_post(uuid, text, text, text, text, text);

create or replace function public.admin_upsert_blog_post(
  p_id uuid,
  p_slug text,
  p_title text,
  p_excerpt text,
  p_html_body text,
  p_status text,
  p_published_at timestamptz default null
)
returns table (
  id uuid,
  slug text,
  title text,
  excerpt text,
  html_body text,
  status text,
  published_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = leseno, public
as $$
declare
  v_slug text := lower(trim(coalesce(p_slug, '')));
  v_title text := nullif(trim(coalesce(p_title, '')), '');
  v_excerpt text := trim(coalesce(p_excerpt, ''));
  v_html text := coalesce(p_html_body, '');
  v_status text := lower(trim(coalesce(p_status, 'draft')));
  v_id uuid;
  v_prev_status text;
  v_published_at timestamptz;
begin
  if v_title is null then
    raise exception 'Titel ist erforderlich.';
  end if;

  if v_slug is null or length(v_slug) < 2 then
    raise exception 'Slug ist erforderlich.';
  end if;

  if v_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then
    raise exception 'Slug darf nur Kleinbuchstaben, Ziffern und Bindestriche enthalten.';
  end if;

  if v_status not in ('draft', 'published') then
    raise exception 'Ungültiger Status.';
  end if;

  if p_id is null then
    if p_published_at is not null then
      v_published_at := p_published_at;
    elsif v_status = 'published' then
      v_published_at := now();
    else
      v_published_at := null;
    end if;

    insert into leseno.blog_posts (
      slug, title, excerpt, html_body, status, published_at
    )
    values (
      v_slug, v_title, v_excerpt, v_html, v_status, v_published_at
    )
    returning leseno.blog_posts.id into v_id;
  else
    select p.status, p.published_at
      into v_prev_status, v_published_at
    from leseno.blog_posts p
    where p.id = p_id;

    if not found then
      raise exception 'Beitrag nicht gefunden.';
    end if;

    if p_published_at is not null then
      v_published_at := p_published_at;
    elsif v_status = 'published'
      and (v_published_at is null or v_prev_status <> 'published') then
      v_published_at := now();
    end if;

    update leseno.blog_posts p
    set
      slug = v_slug,
      title = v_title,
      excerpt = v_excerpt,
      html_body = v_html,
      status = v_status,
      published_at = v_published_at
    where p.id = p_id;

    v_id := p_id;
  end if;

  return query
  select
    p.id,
    p.slug,
    p.title,
    p.excerpt,
    p.html_body,
    p.status,
    p.published_at,
    p.created_at,
    p.updated_at
  from leseno.blog_posts p
  where p.id = v_id;
end;
$$;

revoke all on function public.admin_upsert_blog_post(
  uuid, text, text, text, text, text, timestamptz
) from public;
grant execute on function public.admin_upsert_blog_post(
  uuid, text, text, text, text, text, timestamptz
) to service_role;
