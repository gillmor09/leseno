-- Blog posts for marketing /blog (admin Quill HTML, public published list/detail).

create table if not exists leseno.blog_posts (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  title text not null,
  excerpt text not null default '',
  html_body text not null default '',
  status text not null default 'draft',
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint blog_posts_slug_unique unique (slug),
  constraint blog_posts_slug_chk check (
    length(trim(slug)) >= 2
    and slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
  ),
  constraint blog_posts_status_chk check (status in ('draft', 'published'))
);

create index if not exists blog_posts_published_idx
  on leseno.blog_posts (published_at desc nulls last)
  where status = 'published';

drop trigger if exists blog_posts_set_updated_at on leseno.blog_posts;
create trigger blog_posts_set_updated_at
before update on leseno.blog_posts
for each row
execute function leseno.set_updated_at();

alter table leseno.blog_posts enable row level security;

revoke all on table leseno.blog_posts from anon, authenticated;
grant all on table leseno.blog_posts to service_role;

-- ── Admin list ─────────────────────────────────────────────────────────────

create or replace function public.admin_list_blog_posts()
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
language sql
stable
security definer
set search_path = leseno, public
as $$
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
  order by p.updated_at desc;
$$;

revoke all on function public.admin_list_blog_posts() from public;
grant execute on function public.admin_list_blog_posts() to service_role;

-- ── Admin upsert ───────────────────────────────────────────────────────────

create or replace function public.admin_upsert_blog_post(
  p_id uuid,
  p_slug text,
  p_title text,
  p_excerpt text,
  p_html_body text,
  p_status text
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
    v_published_at := case when v_status = 'published' then now() else null end;
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

    if v_status = 'published' and (v_published_at is null or v_prev_status <> 'published') then
      v_published_at := now();
    elsif v_status = 'draft' then
      -- Keep original published_at for history; visibility uses status.
      null;
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

revoke all on function public.admin_upsert_blog_post(uuid, text, text, text, text, text)
  from public;
grant execute on function public.admin_upsert_blog_post(uuid, text, text, text, text, text)
  to service_role;

-- ── Admin delete ───────────────────────────────────────────────────────────

create or replace function public.admin_delete_blog_post(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = leseno, public
as $$
declare
  v_deleted boolean := false;
begin
  delete from leseno.blog_posts where id = p_id returning true into v_deleted;
  return coalesce(v_deleted, false);
end;
$$;

revoke all on function public.admin_delete_blog_post(uuid) from public;
grant execute on function public.admin_delete_blog_post(uuid) to service_role;

-- ── Public: published list ─────────────────────────────────────────────────

create or replace function public.list_published_blog_posts()
returns table (
  id uuid,
  slug text,
  title text,
  excerpt text,
  published_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = leseno, public
as $$
  select
    p.id,
    p.slug,
    p.title,
    p.excerpt,
    p.published_at,
    p.updated_at
  from leseno.blog_posts p
  where p.status = 'published'
  order by p.published_at desc nulls last, p.updated_at desc;
$$;

revoke all on function public.list_published_blog_posts() from public;
grant execute on function public.list_published_blog_posts() to service_role;

-- ── Public: published by slug ──────────────────────────────────────────────

create or replace function public.get_published_blog_post_by_slug(p_slug text)
returns table (
  id uuid,
  slug text,
  title text,
  excerpt text,
  html_body text,
  published_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = leseno, public
as $$
  select
    p.id,
    p.slug,
    p.title,
    p.excerpt,
    p.html_body,
    p.published_at,
    p.updated_at
  from leseno.blog_posts p
  where p.slug = lower(trim(coalesce(p_slug, '')))
    and p.status = 'published'
  limit 1;
$$;

revoke all on function public.get_published_blog_post_by_slug(text) from public;
grant execute on function public.get_published_blog_post_by_slug(text)
  to service_role;
