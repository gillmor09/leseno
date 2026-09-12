-- Book foundation + fan persona on roman_kontext (entry open at any stage).

alter table leseno.roman_kontext
  add column if not exists genre text not null default '',
  add column if not exists praemisse text not null default '',
  add column if not exists perspektive text not null default '',
  add column if not exists zeitform text not null default '',
  add column if not exists tonalitaet text not null default '',
  add column if not exists charaktere jsonb not null default '[]'::jsonb,
  add column if not exists welt_schauplaetze text not null default '',
  add column if not exists welt_regeln text not null default '',
  add column if not exists szenen_raster jsonb not null default '[]'::jsonb,
  add column if not exists ki_regelwerk text not null default '',
  add column if not exists fan_persona_name text not null default '',
  add column if not exists fan_persona_profil text not null default '';

-- Default KI rulebook for existing rows that still have an empty field.
update leseno.roman_kontext
set ki_regelwerk = $rules$Show, don't tell.
Keine KI-Floskeln, keine Meta-Kommentare, keine Aufzählung von Schreibregeln im Fließtext.
Dialoge glaubwürdig und figurenbezogen; Anteil dem Genre anpassen.
Orthografie und Zeichensetzung sauber.
Perspektive und Zeitform strikt einhalten.$rules$
where nullif(trim(ki_regelwerk), '') is null;

-- ── List romane (extended) ─────────────────────────────────────────────────

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

-- ── Get one roman ──────────────────────────────────────────────────────────

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
    r.created_at,
    r.updated_at
  from leseno.roman_kontext r
  where r.id = p_id;
$$;

revoke all on function public.admin_get_roman(uuid) from public;
grant execute on function public.admin_get_roman(uuid) to service_role;

-- ── Upsert kontext (foundation + manuscript) ───────────────────────────────

drop function if exists public.admin_upsert_roman_kontext(uuid, text, text, text);

create or replace function public.admin_upsert_roman_kontext(
  p_id uuid,
  p_title text,
  p_manuskript_raw text,
  p_stilbibel text,
  p_genre text default '',
  p_praemisse text default '',
  p_perspektive text default '',
  p_zeitform text default '',
  p_tonalitaet text default '',
  p_charaktere jsonb default '[]'::jsonb,
  p_welt_schauplaetze text default '',
  p_welt_regeln text default '',
  p_szenen_raster jsonb default '[]'::jsonb,
  p_ki_regelwerk text default '',
  p_fan_persona_name text default '',
  p_fan_persona_profil text default ''
)
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
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = leseno, public
as $$
declare
  v_id uuid;
  v_title text := nullif(trim(coalesce(p_title, '')), '');
begin
  if v_title is null then
    v_title := 'Unbenannter Roman';
  end if;

  if p_id is null then
    insert into leseno.roman_kontext (
      title,
      manuskript_raw,
      stilbibel,
      genre,
      praemisse,
      perspektive,
      zeitform,
      tonalitaet,
      charaktere,
      welt_schauplaetze,
      welt_regeln,
      szenen_raster,
      ki_regelwerk,
      fan_persona_name,
      fan_persona_profil
    )
    values (
      v_title,
      coalesce(p_manuskript_raw, ''),
      coalesce(p_stilbibel, ''),
      coalesce(p_genre, ''),
      coalesce(p_praemisse, ''),
      coalesce(p_perspektive, ''),
      coalesce(p_zeitform, ''),
      coalesce(p_tonalitaet, ''),
      coalesce(p_charaktere, '[]'::jsonb),
      coalesce(p_welt_schauplaetze, ''),
      coalesce(p_welt_regeln, ''),
      coalesce(p_szenen_raster, '[]'::jsonb),
      coalesce(p_ki_regelwerk, ''),
      coalesce(p_fan_persona_name, ''),
      coalesce(p_fan_persona_profil, '')
    )
    returning leseno.roman_kontext.id into v_id;
  else
    update leseno.roman_kontext r
    set
      title = v_title,
      manuskript_raw = coalesce(p_manuskript_raw, r.manuskript_raw),
      stilbibel = coalesce(p_stilbibel, r.stilbibel),
      genre = coalesce(p_genre, r.genre),
      praemisse = coalesce(p_praemisse, r.praemisse),
      perspektive = coalesce(p_perspektive, r.perspektive),
      zeitform = coalesce(p_zeitform, r.zeitform),
      tonalitaet = coalesce(p_tonalitaet, r.tonalitaet),
      charaktere = coalesce(p_charaktere, r.charaktere),
      welt_schauplaetze = coalesce(p_welt_schauplaetze, r.welt_schauplaetze),
      welt_regeln = coalesce(p_welt_regeln, r.welt_regeln),
      szenen_raster = coalesce(p_szenen_raster, r.szenen_raster),
      ki_regelwerk = coalesce(p_ki_regelwerk, r.ki_regelwerk),
      fan_persona_name = coalesce(p_fan_persona_name, r.fan_persona_name),
      fan_persona_profil = coalesce(p_fan_persona_profil, r.fan_persona_profil)
    where r.id = p_id;

    if not found then
      raise exception 'Roman nicht gefunden.';
    end if;
    v_id := p_id;
  end if;

  return query
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
    r.created_at,
    r.updated_at
  from leseno.roman_kontext r
  where r.id = v_id;
end;
$$;

revoke all on function public.admin_upsert_roman_kontext(
  uuid, text, text, text, text, text, text, text, text, jsonb, text, text, jsonb, text, text, text
) from public;
grant execute on function public.admin_upsert_roman_kontext(
  uuid, text, text, text, text, text, text, text, text, jsonb, text, text, jsonb, text, text, text
) to service_role;

-- ── Claim next scene (full foundation for prompts) ─────────────────────────

drop function if exists public.admin_claim_next_szene(uuid);

create or replace function public.admin_claim_next_szene(p_roman_id uuid)
returns table (
  id uuid,
  roman_id uuid,
  kapitel_nr int,
  szenen_nr int,
  briefing text,
  entwurf_raw text,
  feedback_lektor text,
  feedback_fan text,
  entwurf_revidiert text,
  status text,
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
  fan_persona_profil text
)
language plpgsql
security definer
set search_path = leseno, public
as $$
declare
  v_id uuid;
begin
  select s.id into v_id
  from leseno.szenen s
  where s.roman_id = p_roman_id
    and s.status = 'READY_FOR_WRITING'
  order by s.kapitel_nr asc, s.szenen_nr asc
  limit 1
  for update skip locked;

  if v_id is null then
    return;
  end if;

  update leseno.szenen s
  set status = 'DRAFTING'
  where s.id = v_id;

  return query
  select
    s.id,
    s.roman_id,
    s.kapitel_nr,
    s.szenen_nr,
    s.briefing,
    s.entwurf_raw,
    s.feedback_lektor,
    s.feedback_fan,
    s.entwurf_revidiert,
    s.status,
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
    r.fan_persona_profil
  from leseno.szenen s
  join leseno.roman_kontext r on r.id = s.roman_id
  where s.id = v_id;
end;
$$;

revoke all on function public.admin_claim_next_szene(uuid) from public;
grant execute on function public.admin_claim_next_szene(uuid) to service_role;
