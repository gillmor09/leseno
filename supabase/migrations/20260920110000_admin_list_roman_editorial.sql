-- List RPC must return editorial so module filters (Roman / Sachbuch / Clever) work.

drop function if exists public.admin_list_roman_kontexte();

create or replace function public.admin_list_roman_kontexte()
returns table (
  id uuid,
  title text,
  stilbibel text,
  aktuelle_zusammenfassung text,
  manuskript_raw text,
  genre text,
  praemisse text,
  perspektive text,
  zeitform text,
  tonalitaet text,
  charaktere jsonb,
  welt_schauplaetze text,
  welt_regeln text,
  szenen_raster jsonb,
  ki_regelwerk text,
  fan_persona_name text,
  fan_persona_profil text,
  editorial jsonb,
  cover_image_data_url text,
  cover_prompt text,
  has_cover boolean,
  szenen_total int,
  szenen_completed int,
  szenen_ready int,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = leseno, public
as $$
  select
    r.id,
    r.title,
    r.stilbibel,
    r.aktuelle_zusammenfassung,
    r.manuskript_raw,
    r.genre,
    r.praemisse,
    r.perspektive,
    r.zeitform,
    r.tonalitaet,
    r.charaktere,
    r.welt_schauplaetze,
    r.welt_regeln,
    r.szenen_raster,
    r.ki_regelwerk,
    r.fan_persona_name,
    r.fan_persona_profil,
    r.editorial,
    ''::text as cover_image_data_url,
    ''::text as cover_prompt,
    (nullif(trim(r.cover_image_data_url), '') is not null) as has_cover,
    coalesce(
      (select count(*)::int from leseno.szenen s where s.roman_id = r.id),
      0
    ) as szenen_total,
    coalesce(
      (
        select count(*)::int
        from leseno.szenen s
        where s.roman_id = r.id and s.status = 'COMPLETED'
      ),
      0
    ) as szenen_completed,
    coalesce(
      (
        select count(*)::int
        from leseno.szenen s
        where s.roman_id = r.id and s.status = 'READY_FOR_WRITING'
      ),
      0
    ) as szenen_ready,
    r.created_at,
    r.updated_at
  from leseno.roman_kontext r
  order by r.updated_at desc;
$$;

revoke all on function public.admin_list_roman_kontexte() from public;
grant execute on function public.admin_list_roman_kontexte() to service_role;
