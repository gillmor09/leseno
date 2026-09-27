-- Sachbuch greenfield module (separate from roman_kontext fiction pipeline).
-- Service-role RPCs only.

create table if not exists leseno.sachbuch_kontext (
  id uuid primary key default gen_random_uuid(),
  title text not null default 'Unbenanntes Sachbuch',
  stilbibel text not null default '',
  agents jsonb not null default '{}'::jsonb,
  kapitel jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists sachbuch_kontext_set_updated_at on leseno.sachbuch_kontext;
create trigger sachbuch_kontext_set_updated_at
before update on leseno.sachbuch_kontext
for each row
execute function leseno.set_updated_at();

alter table leseno.sachbuch_kontext enable row level security;
revoke all on table leseno.sachbuch_kontext from anon, authenticated;
grant all on table leseno.sachbuch_kontext to service_role;

-- ── List ───────────────────────────────────────────────────────────────────

create or replace function public.admin_list_sachbuch_kontexte()
returns table (
  id uuid,
  title text,
  stilbibel text,
  agents jsonb,
  kapitel jsonb,
  kapitel_count int,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = leseno, public
as $$
  select
    s.id,
    s.title,
    s.stilbibel,
    s.agents,
    s.kapitel,
    coalesce(jsonb_array_length(s.kapitel), 0)::int as kapitel_count,
    s.created_at,
    s.updated_at
  from leseno.sachbuch_kontext s
  order by s.updated_at desc;
$$;

revoke all on function public.admin_list_sachbuch_kontexte() from public;
grant execute on function public.admin_list_sachbuch_kontexte() to service_role;

-- ── Get one ────────────────────────────────────────────────────────────────

create or replace function public.admin_get_sachbuch_kontext(p_id uuid)
returns table (
  id uuid,
  title text,
  stilbibel text,
  agents jsonb,
  kapitel jsonb,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = leseno, public
as $$
  select
    s.id,
    s.title,
    s.stilbibel,
    s.agents,
    s.kapitel,
    s.created_at,
    s.updated_at
  from leseno.sachbuch_kontext s
  where s.id = p_id;
$$;

revoke all on function public.admin_get_sachbuch_kontext(uuid) from public;
grant execute on function public.admin_get_sachbuch_kontext(uuid) to service_role;

-- ── Upsert ─────────────────────────────────────────────────────────────────

create or replace function public.admin_upsert_sachbuch_kontext(
  p_id uuid,
  p_title text,
  p_stilbibel text,
  p_agents jsonb,
  p_kapitel jsonb
)
returns uuid
language plpgsql
security definer
set search_path = leseno, public
as $$
declare
  v_id uuid;
begin
  if p_id is null then
    insert into leseno.sachbuch_kontext (title, stilbibel, agents, kapitel)
    values (
      coalesce(nullif(trim(p_title), ''), 'Unbenanntes Sachbuch'),
      coalesce(p_stilbibel, ''),
      coalesce(p_agents, '{}'::jsonb),
      coalesce(p_kapitel, '[]'::jsonb)
    )
    returning id into v_id;
  else
    update leseno.sachbuch_kontext
    set
      title = coalesce(nullif(trim(p_title), ''), title),
      stilbibel = coalesce(p_stilbibel, stilbibel),
      agents = coalesce(p_agents, agents),
      kapitel = coalesce(p_kapitel, kapitel),
      updated_at = now()
    where id = p_id
    returning id into v_id;
    if v_id is null then
      raise exception 'Sachbuch nicht gefunden.';
    end if;
  end if;
  return v_id;
end;
$$;

revoke all on function public.admin_upsert_sachbuch_kontext(uuid, text, text, jsonb, jsonb)
  from public;
grant execute on function public.admin_upsert_sachbuch_kontext(uuid, text, text, jsonb, jsonb)
  to service_role;

-- ── Delete ─────────────────────────────────────────────────────────────────

create or replace function public.admin_delete_sachbuch_kontext(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = leseno, public
as $$
begin
  delete from leseno.sachbuch_kontext where id = p_id;
  return found;
end;
$$;

revoke all on function public.admin_delete_sachbuch_kontext(uuid) from public;
grant execute on function public.admin_delete_sachbuch_kontext(uuid) to service_role;
