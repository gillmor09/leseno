-- Admin-editable help texts for member pages (page-level + per-card slots).

create table if not exists leseno.help_texts (
  page_id text not null,
  slot_id text not null,
  title text not null,
  html_body text not null default '',
  updated_at timestamptz not null default now(),
  primary key (page_id, slot_id),
  constraint help_texts_page_id_chk check (
    page_id in (
      'geschichte',
      'meine-welt',
      'mein-buchclub',
      'meine-buecherei'
    )
  ),
  constraint help_texts_slot_id_chk check (length(trim(slot_id)) > 0)
);

drop trigger if exists help_texts_set_updated_at on leseno.help_texts;
create trigger help_texts_set_updated_at
before update on leseno.help_texts
for each row
execute function leseno.set_updated_at();

alter table leseno.help_texts enable row level security;

revoke all on table leseno.help_texts from anon, authenticated;
grant all on table leseno.help_texts to service_role;

create or replace function public.admin_list_help_texts()
returns table (
  page_id text,
  slot_id text,
  title text,
  html_body text,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = leseno, public
as $$
  select
    t.page_id,
    t.slot_id,
    t.title,
    t.html_body,
    t.updated_at
  from leseno.help_texts t
  order by t.page_id asc, t.slot_id asc;
$$;

revoke all on function public.admin_list_help_texts() from public;
grant execute on function public.admin_list_help_texts() to service_role;

create or replace function public.list_help_texts_for_page(p_page_id text)
returns table (
  page_id text,
  slot_id text,
  title text,
  html_body text,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = leseno, public
as $$
  select
    t.page_id,
    t.slot_id,
    t.title,
    t.html_body,
    t.updated_at
  from leseno.help_texts t
  where t.page_id = p_page_id
  order by t.slot_id asc;
$$;

revoke all on function public.list_help_texts_for_page(text) from public;
grant execute on function public.list_help_texts_for_page(text) to service_role;

create or replace function public.admin_upsert_help_text(
  p_page_id text,
  p_slot_id text,
  p_title text,
  p_html_body text
)
returns table (
  page_id text,
  slot_id text,
  title text,
  html_body text,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = leseno, public
as $$
declare
  v_page text := nullif(trim(coalesce(p_page_id, '')), '');
  v_slot text := nullif(trim(coalesce(p_slot_id, '')), '');
  v_title text := nullif(trim(coalesce(p_title, '')), '');
begin
  if v_page is null or v_slot is null then
    raise exception 'page_id und slot_id sind erforderlich.';
  end if;

  if v_page not in (
    'geschichte',
    'meine-welt',
    'mein-buchclub',
    'meine-buecherei'
  ) then
    raise exception 'Ungültige page_id.';
  end if;

  if v_title is null then
    raise exception 'Titel ist erforderlich.';
  end if;

  insert into leseno.help_texts (page_id, slot_id, title, html_body)
  values (
    v_page,
    v_slot,
    v_title,
    coalesce(p_html_body, '')
  )
  on conflict (page_id, slot_id) do update set
    title = excluded.title,
    html_body = excluded.html_body;

  return query
  select
    t.page_id,
    t.slot_id,
    t.title,
    t.html_body,
    t.updated_at
  from leseno.help_texts t
  where t.page_id = v_page
    and t.slot_id = v_slot;
end;
$$;

revoke all on function public.admin_upsert_help_text(text, text, text, text)
  from public;
grant execute on function public.admin_upsert_help_text(text, text, text, text)
  to service_role;
