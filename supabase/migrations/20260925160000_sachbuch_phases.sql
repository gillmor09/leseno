-- Sachbuch phases 1–3 book-level JSON (Idee, Evidenz, Makro) + Zielgruppe.

alter table leseno.sachbuch_kontext
  add column if not exists zielgruppe text not null default '',
  add column if not exists idee jsonb not null default '{}'::jsonb,
  add column if not exists evidenz jsonb not null default '{}'::jsonb,
  add column if not exists makro jsonb not null default '{}'::jsonb;

drop function if exists public.admin_list_sachbuch_kontexte();
create or replace function public.admin_list_sachbuch_kontexte()
returns table (
  id uuid,
  title text,
  stilbibel text,
  zielgruppe text,
  agents jsonb,
  kapitel jsonb,
  idee jsonb,
  evidenz jsonb,
  makro jsonb,
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
    s.zielgruppe,
    s.agents,
    s.kapitel,
    s.idee,
    s.evidenz,
    s.makro,
    coalesce(jsonb_array_length(s.kapitel), 0)::int as kapitel_count,
    s.created_at,
    s.updated_at
  from leseno.sachbuch_kontext s
  order by s.updated_at desc;
$$;

revoke all on function public.admin_list_sachbuch_kontexte() from public;
grant execute on function public.admin_list_sachbuch_kontexte() to service_role;

drop function if exists public.admin_get_sachbuch_kontext(uuid);
create or replace function public.admin_get_sachbuch_kontext(p_id uuid)
returns table (
  id uuid,
  title text,
  stilbibel text,
  zielgruppe text,
  agents jsonb,
  kapitel jsonb,
  idee jsonb,
  evidenz jsonb,
  makro jsonb,
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
    s.zielgruppe,
    s.agents,
    s.kapitel,
    s.idee,
    s.evidenz,
    s.makro,
    s.created_at,
    s.updated_at
  from leseno.sachbuch_kontext s
  where s.id = p_id;
$$;

revoke all on function public.admin_get_sachbuch_kontext(uuid) from public;
grant execute on function public.admin_get_sachbuch_kontext(uuid) to service_role;

drop function if exists public.admin_upsert_sachbuch_kontext(uuid, text, text, jsonb, jsonb);
create or replace function public.admin_upsert_sachbuch_kontext(
  p_id uuid,
  p_title text,
  p_stilbibel text,
  p_zielgruppe text,
  p_agents jsonb,
  p_kapitel jsonb,
  p_idee jsonb,
  p_evidenz jsonb,
  p_makro jsonb
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
    insert into leseno.sachbuch_kontext (
      title, stilbibel, zielgruppe, agents, kapitel, idee, evidenz, makro
    )
    values (
      coalesce(nullif(trim(p_title), ''), 'Unbenanntes Sachbuch'),
      coalesce(p_stilbibel, ''),
      coalesce(p_zielgruppe, ''),
      coalesce(p_agents, '{}'::jsonb),
      coalesce(p_kapitel, '[]'::jsonb),
      coalesce(p_idee, '{}'::jsonb),
      coalesce(p_evidenz, '{}'::jsonb),
      coalesce(p_makro, '{}'::jsonb)
    )
    returning id into v_id;
  else
    update leseno.sachbuch_kontext
    set
      title = coalesce(nullif(trim(p_title), ''), title),
      stilbibel = coalesce(p_stilbibel, stilbibel),
      zielgruppe = coalesce(p_zielgruppe, zielgruppe),
      agents = coalesce(p_agents, agents),
      kapitel = coalesce(p_kapitel, kapitel),
      idee = coalesce(p_idee, idee),
      evidenz = coalesce(p_evidenz, evidenz),
      makro = coalesce(p_makro, makro),
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

revoke all on function public.admin_upsert_sachbuch_kontext(
  uuid, text, text, text, jsonb, jsonb, jsonb, jsonb, jsonb
) from public;
grant execute on function public.admin_upsert_sachbuch_kontext(
  uuid, text, text, text, jsonb, jsonb, jsonb, jsonb, jsonb
) to service_role;
