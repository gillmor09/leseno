-- Buch der Woche: weekly Clever-erzählt feature for Instagram landing + IG creatives.

create table if not exists leseno.buch_der_woche_entries (
  slug text primary key,
  roman_id uuid not null references leseno.roman_kontext (id) on delete restrict,
  teaser_headline text not null default '',
  teaser_lead text not null default '',
  ig_image_data_url text not null default '',
  ig_caption text not null default '',
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint buch_der_woche_entries_slug_format
    check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$')
);

comment on table leseno.buch_der_woche_entries is
  'Whitelist of Clever-erzählt titles publishable as Buch der Woche (slug → roman).';

drop trigger if exists buch_der_woche_entries_set_updated_at
  on leseno.buch_der_woche_entries;
create trigger buch_der_woche_entries_set_updated_at
before update on leseno.buch_der_woche_entries
for each row execute function leseno.set_updated_at();

alter table leseno.buch_der_woche_entries enable row level security;
revoke all on table leseno.buch_der_woche_entries from anon, authenticated;
grant all on table leseno.buch_der_woche_entries to service_role;

create table if not exists leseno.buch_der_woche_settings (
  id smallint primary key default 1 check (id = 1),
  current_slug text references leseno.buch_der_woche_entries (slug) on delete set null,
  updated_at timestamptz not null default now()
);

comment on table leseno.buch_der_woche_settings is
  'Singleton: which Buch-der-Woche slug is live on /buch-der-woche.';

drop trigger if exists buch_der_woche_settings_set_updated_at
  on leseno.buch_der_woche_settings;
create trigger buch_der_woche_settings_set_updated_at
before update on leseno.buch_der_woche_settings
for each row execute function leseno.set_updated_at();

alter table leseno.buch_der_woche_settings enable row level security;
revoke all on table leseno.buch_der_woche_settings from anon, authenticated;
grant all on table leseno.buch_der_woche_settings to service_role;

insert into leseno.buch_der_woche_settings (id, current_slug)
values (1, null)
on conflict (id) do nothing;

-- Seed current week: Hausaufgaben (Clever erzählt).
insert into leseno.buch_der_woche_entries (
  slug,
  roman_id,
  teaser_headline,
  teaser_lead,
  published_at
)
select
  'hausaufgaben',
  '1504aba8-85cc-44fb-8236-b8ff4f02a8dc'::uuid,
  'Warum Hausaufgaben dein Gehirn trainieren',
  'Ein Dutzend Kurzgeschichten über Lernen, Motivation und den inneren Schweinehund — zum Mitfiebern und Verstehen.',
  now()
where exists (
  select 1
  from leseno.roman_kontext r
  where r.id = '1504aba8-85cc-44fb-8236-b8ff4f02a8dc'::uuid
)
on conflict (slug) do update set
  roman_id = excluded.roman_id,
  teaser_headline = excluded.teaser_headline,
  teaser_lead = excluded.teaser_lead;

update leseno.buch_der_woche_settings
set current_slug = 'hausaufgaben'
where id = 1
  and exists (
    select 1 from leseno.buch_der_woche_entries e where e.slug = 'hausaufgaben'
  );

create or replace function public.admin_list_buch_der_woche_entries()
returns table (
  slug text,
  roman_id uuid,
  teaser_headline text,
  teaser_lead text,
  ig_image_data_url text,
  ig_caption text,
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
    e.slug,
    e.roman_id,
    e.teaser_headline,
    e.teaser_lead,
    e.ig_image_data_url,
    e.ig_caption,
    e.published_at,
    e.created_at,
    e.updated_at
  from leseno.buch_der_woche_entries e
  order by e.published_at desc nulls last, e.updated_at desc;
$$;

revoke all on function public.admin_list_buch_der_woche_entries() from public;
grant execute on function public.admin_list_buch_der_woche_entries() to service_role;

create or replace function public.admin_get_buch_der_woche_entry(p_slug text)
returns table (
  slug text,
  roman_id uuid,
  teaser_headline text,
  teaser_lead text,
  ig_image_data_url text,
  ig_caption text,
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
    e.slug,
    e.roman_id,
    e.teaser_headline,
    e.teaser_lead,
    e.ig_image_data_url,
    e.ig_caption,
    e.published_at,
    e.created_at,
    e.updated_at
  from leseno.buch_der_woche_entries e
  where e.slug = lower(trim(p_slug));
$$;

revoke all on function public.admin_get_buch_der_woche_entry(text) from public;
grant execute on function public.admin_get_buch_der_woche_entry(text) to service_role;

create or replace function public.admin_upsert_buch_der_woche_entry(
  p_slug text,
  p_roman_id uuid,
  p_teaser_headline text,
  p_teaser_lead text,
  p_ig_image_data_url text default null,
  p_ig_caption text default null,
  p_set_published boolean default false
)
returns table (
  slug text,
  roman_id uuid,
  teaser_headline text,
  teaser_lead text,
  ig_image_data_url text,
  ig_caption text,
  published_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = leseno, public
as $$
declare
  v_slug text := lower(trim(p_slug));
begin
  if v_slug is null or v_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then
    raise exception 'Ungültiger Slug.';
  end if;

  if not exists (select 1 from leseno.roman_kontext r where r.id = p_roman_id) then
    raise exception 'Roman nicht gefunden.';
  end if;

  insert into leseno.buch_der_woche_entries (
    slug,
    roman_id,
    teaser_headline,
    teaser_lead,
    ig_image_data_url,
    ig_caption,
    published_at
  )
  values (
    v_slug,
    p_roman_id,
    coalesce(p_teaser_headline, ''),
    coalesce(p_teaser_lead, ''),
    coalesce(p_ig_image_data_url, ''),
    coalesce(p_ig_caption, ''),
    case when p_set_published then now() else null end
  )
  on conflict (slug) do update set
    roman_id = excluded.roman_id,
    teaser_headline = excluded.teaser_headline,
    teaser_lead = excluded.teaser_lead,
    ig_image_data_url = case
      when p_ig_image_data_url is null then leseno.buch_der_woche_entries.ig_image_data_url
      else excluded.ig_image_data_url
    end,
    ig_caption = case
      when p_ig_caption is null then leseno.buch_der_woche_entries.ig_caption
      else excluded.ig_caption
    end,
    published_at = case
      when p_set_published then coalesce(leseno.buch_der_woche_entries.published_at, now())
      else leseno.buch_der_woche_entries.published_at
    end;

  return query
  select
    e.slug,
    e.roman_id,
    e.teaser_headline,
    e.teaser_lead,
    e.ig_image_data_url,
    e.ig_caption,
    e.published_at,
    e.created_at,
    e.updated_at
  from leseno.buch_der_woche_entries e
  where e.slug = v_slug;
end;
$$;

revoke all on function public.admin_upsert_buch_der_woche_entry(
  text, uuid, text, text, text, text, boolean
) from public;
grant execute on function public.admin_upsert_buch_der_woche_entry(
  text, uuid, text, text, text, text, boolean
) to service_role;

create or replace function public.admin_get_buch_der_woche_settings()
returns table (
  current_slug text,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = leseno, public
as $$
  select s.current_slug, s.updated_at
  from leseno.buch_der_woche_settings s
  where s.id = 1;
$$;

revoke all on function public.admin_get_buch_der_woche_settings() from public;
grant execute on function public.admin_get_buch_der_woche_settings() to service_role;

create or replace function public.admin_set_buch_der_woche_current(p_slug text)
returns table (
  current_slug text,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = leseno, public
as $$
declare
  v_slug text := lower(trim(p_slug));
begin
  if not exists (
    select 1 from leseno.buch_der_woche_entries e where e.slug = v_slug
  ) then
    raise exception 'Buch-der-Woche-Eintrag fehlt.';
  end if;

  update leseno.buch_der_woche_entries
  set published_at = coalesce(published_at, now())
  where slug = v_slug;

  insert into leseno.buch_der_woche_settings (id, current_slug)
  values (1, v_slug)
  on conflict (id) do update set current_slug = excluded.current_slug;

  return query
  select s.current_slug, s.updated_at
  from leseno.buch_der_woche_settings s
  where s.id = 1;
end;
$$;

revoke all on function public.admin_set_buch_der_woche_current(text) from public;
grant execute on function public.admin_set_buch_der_woche_current(text) to service_role;
