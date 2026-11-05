-- Admin list must not pull full kapitel JSON (prose + base64 Infografiken).
-- That made /admin/sachbuch hang for 20–30s once books gained graphics.

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
    ''::text as stilbibel,
    ''::text as zielgruppe,
    '{}'::jsonb as agents,
    '[]'::jsonb as kapitel,
    coalesce(s.idee, '{}'::jsonb) as idee,
    '{}'::jsonb as evidenz,
    '{}'::jsonb as makro,
    coalesce(jsonb_array_length(s.kapitel), 0)::int as kapitel_count,
    s.created_at,
    s.updated_at
  from leseno.sachbuch_kontext s
  order by s.updated_at desc;
$$;

revoke all on function public.admin_list_sachbuch_kontexte() from public;
grant execute on function public.admin_list_sachbuch_kontexte() to service_role;
