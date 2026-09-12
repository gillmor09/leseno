-- Persist Ideen-Finder chat history on roman_kontext.

alter table leseno.roman_kontext
  add column if not exists ideen_chat jsonb not null default '[]'::jsonb;

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
  autor_name text,
  buchruecken jsonb,
  vorsatz jsonb,
  ideen_chat jsonb,
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
    r.autor_name,
    r.buchruecken,
    r.vorsatz,
    r.ideen_chat,
    r.created_at,
    r.updated_at
  from leseno.roman_kontext r
  where r.id = p_id;
$$;

revoke all on function public.admin_get_roman(uuid) from public;
grant execute on function public.admin_get_roman(uuid) to service_role;

create or replace function public.admin_set_roman_ideen_chat(
  p_id uuid,
  p_ideen_chat jsonb
)
returns boolean
language plpgsql
security definer
set search_path = leseno, public
as $$
begin
  update leseno.roman_kontext r
  set ideen_chat = coalesce(p_ideen_chat, '[]'::jsonb)
  where r.id = p_id;
  if not found then
    raise exception 'Roman nicht gefunden.';
  end if;
  return true;
end;
$$;

revoke all on function public.admin_set_roman_ideen_chat(uuid, jsonb) from public;
grant execute on function public.admin_set_roman_ideen_chat(uuid, jsonb)
  to service_role;
