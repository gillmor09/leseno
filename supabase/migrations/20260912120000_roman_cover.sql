-- Book cover illustration on roman_kontext (Gemini scene → Flux pixels).

alter table leseno.roman_kontext
  add column if not exists cover_image_data_url text not null default '',
  add column if not exists cover_prompt text not null default '';

-- ── Get roman: include cover ───────────────────────────────────────────────

drop function if exists public.admin_get_roman(uuid);

create or replace function public.admin_get_roman(p_id uuid)
returns table (
  id uuid,
  title text,
  manuskript_raw text,
  stilbibel text,
  aktuelle_zusammenfassung text,
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
  cover_image_data_url text,
  cover_prompt text,
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
    r.manuskript_raw,
    r.stilbibel,
    r.aktuelle_zusammenfassung,
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
    r.cover_image_data_url,
    r.cover_prompt,
    r.created_at,
    r.updated_at
  from leseno.roman_kontext r
  where r.id = p_id;
$$;

revoke all on function public.admin_get_roman(uuid) from public;
grant execute on function public.admin_get_roman(uuid) to service_role;

-- List: only a flag (avoid shipping megabyte data URLs in the overview)

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

-- ── Set / clear cover (separate from foundation upsert) ─────────────────────

create or replace function public.admin_set_roman_cover(
  p_id uuid,
  p_cover_image_data_url text,
  p_cover_prompt text
)
returns boolean
language plpgsql
security definer
set search_path = leseno, public
as $$
begin
  update leseno.roman_kontext r
  set
    cover_image_data_url = coalesce(p_cover_image_data_url, ''),
    cover_prompt = coalesce(p_cover_prompt, '')
  where r.id = p_id;
  if not found then
    raise exception 'Roman nicht gefunden.';
  end if;
  return true;
end;
$$;

revoke all on function public.admin_set_roman_cover(uuid, text, text) from public;
grant execute on function public.admin_set_roman_cover(uuid, text, text) to service_role;

create or replace function public.admin_clear_roman_cover(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = leseno, public
as $$
begin
  update leseno.roman_kontext r
  set
    cover_image_data_url = '',
    cover_prompt = ''
  where r.id = p_id;
  return found;
end;
$$;

revoke all on function public.admin_clear_roman_cover(uuid) from public;
grant execute on function public.admin_clear_roman_cover(uuid) to service_role;
