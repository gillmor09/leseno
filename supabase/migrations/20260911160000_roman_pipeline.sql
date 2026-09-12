-- Admin-only novel writing pipeline (roman_kontext + szenen).
-- Not part of the public kids product; service_role RPCs only.

create table if not exists leseno.roman_kontext (
  id uuid primary key default gen_random_uuid(),
  title text not null default 'Unbenannter Roman',
  manuskript_raw text not null default '',
  stilbibel text not null default '',
  aktuelle_zusammenfassung text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists roman_kontext_set_updated_at on leseno.roman_kontext;
create trigger roman_kontext_set_updated_at
before update on leseno.roman_kontext
for each row
execute function leseno.set_updated_at();

alter table leseno.roman_kontext enable row level security;
revoke all on table leseno.roman_kontext from anon, authenticated;
grant all on table leseno.roman_kontext to service_role;

create table if not exists leseno.szenen (
  id uuid primary key default gen_random_uuid(),
  roman_id uuid not null references leseno.roman_kontext (id) on delete cascade,
  kapitel_nr int not null check (kapitel_nr >= 1),
  szenen_nr int not null check (szenen_nr >= 1),
  briefing text not null default '',
  entwurf_raw text not null default '',
  feedback_lektor text not null default '',
  feedback_fan text not null default '',
  entwurf_revidiert text not null default '',
  status text not null default 'READY_FOR_WRITING',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint szenen_roman_kapitel_szene_unique unique (roman_id, kapitel_nr, szenen_nr),
  constraint szenen_status_chk check (
    status in (
      'READY_FOR_WRITING',
      'DRAFTING',
      'REVIEWING',
      'REVISING',
      'COMPLETED'
    )
  )
);

create index if not exists szenen_roman_status_idx
  on leseno.szenen (roman_id, status, kapitel_nr, szenen_nr);

drop trigger if exists szenen_set_updated_at on leseno.szenen;
create trigger szenen_set_updated_at
before update on leseno.szenen
for each row
execute function leseno.set_updated_at();

alter table leseno.szenen enable row level security;
revoke all on table leseno.szenen from anon, authenticated;
grant all on table leseno.szenen to service_role;

-- ── List romane ────────────────────────────────────────────────────────────

create or replace function public.admin_list_roman_kontexte()
returns table (
  id uuid,
  title text,
  stilbibel text,
  aktuelle_zusammenfassung text,
  manuskript_raw text,
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

-- ── Get one roman + scenes ─────────────────────────────────────────────────

create or replace function public.admin_get_roman(p_id uuid)
returns table (
  id uuid,
  title text,
  manuskript_raw text,
  stilbibel text,
  aktuelle_zusammenfassung text,
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
    r.created_at,
    r.updated_at
  from leseno.roman_kontext r
  where r.id = p_id;
$$;

revoke all on function public.admin_get_roman(uuid) from public;
grant execute on function public.admin_get_roman(uuid) to service_role;

create or replace function public.admin_list_szenen(p_roman_id uuid)
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
    s.roman_id,
    s.kapitel_nr,
    s.szenen_nr,
    s.briefing,
    s.entwurf_raw,
    s.feedback_lektor,
    s.feedback_fan,
    s.entwurf_revidiert,
    s.status,
    s.created_at,
    s.updated_at
  from leseno.szenen s
  where s.roman_id = p_roman_id
  order by s.kapitel_nr asc, s.szenen_nr asc;
$$;

revoke all on function public.admin_list_szenen(uuid) from public;
grant execute on function public.admin_list_szenen(uuid) to service_role;

-- ── Upsert kontext ─────────────────────────────────────────────────────────

create or replace function public.admin_upsert_roman_kontext(
  p_id uuid,
  p_title text,
  p_manuskript_raw text,
  p_stilbibel text
)
returns table (
  id uuid,
  title text,
  manuskript_raw text,
  stilbibel text,
  aktuelle_zusammenfassung text,
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
    insert into leseno.roman_kontext (title, manuskript_raw, stilbibel)
    values (
      v_title,
      coalesce(p_manuskript_raw, ''),
      coalesce(p_stilbibel, '')
    )
    returning leseno.roman_kontext.id into v_id;
  else
    update leseno.roman_kontext r
    set
      title = v_title,
      manuskript_raw = coalesce(p_manuskript_raw, r.manuskript_raw),
      stilbibel = coalesce(p_stilbibel, r.stilbibel)
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
    r.created_at,
    r.updated_at
  from leseno.roman_kontext r
  where r.id = v_id;
end;
$$;

revoke all on function public.admin_upsert_roman_kontext(uuid, text, text, text)
  from public;
grant execute on function public.admin_upsert_roman_kontext(uuid, text, text, text)
  to service_role;

-- ── Replace roadmap (non-completed scenes) ─────────────────────────────────

create or replace function public.admin_replace_szenen_roadmap(
  p_roman_id uuid,
  p_rows jsonb
)
returns int
language plpgsql
security definer
set search_path = leseno, public
as $$
declare
  v_count int := 0;
  v_item jsonb;
begin
  if not exists (select 1 from leseno.roman_kontext r where r.id = p_roman_id) then
    raise exception 'Roman nicht gefunden.';
  end if;

  -- Keep COMPLETED scenes; wipe the rest before inserting a fresh roadmap.
  delete from leseno.szenen s
  where s.roman_id = p_roman_id
    and s.status <> 'COMPLETED';

  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    return 0;
  end if;

  for v_item in select * from jsonb_array_elements(p_rows)
  loop
    insert into leseno.szenen (
      roman_id,
      kapitel_nr,
      szenen_nr,
      briefing,
      status
    )
    values (
      p_roman_id,
      greatest(1, coalesce((v_item ->> 'kapitel_nr')::int, 1)),
      greatest(1, coalesce((v_item ->> 'szenen_nr')::int, 1)),
      coalesce(v_item ->> 'briefing', ''),
      'READY_FOR_WRITING'
    )
    on conflict (roman_id, kapitel_nr, szenen_nr) do update
      set
        briefing = excluded.briefing,
        status = case
          when leseno.szenen.status = 'COMPLETED' then leseno.szenen.status
          else 'READY_FOR_WRITING'
        end,
        entwurf_raw = case
          when leseno.szenen.status = 'COMPLETED' then leseno.szenen.entwurf_raw
          else ''
        end,
        feedback_lektor = case
          when leseno.szenen.status = 'COMPLETED' then leseno.szenen.feedback_lektor
          else ''
        end,
        feedback_fan = case
          when leseno.szenen.status = 'COMPLETED' then leseno.szenen.feedback_fan
          else ''
        end,
        entwurf_revidiert = case
          when leseno.szenen.status = 'COMPLETED' then leseno.szenen.entwurf_revidiert
          else ''
        end;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.admin_replace_szenen_roadmap(uuid, jsonb) from public;
grant execute on function public.admin_replace_szenen_roadmap(uuid, jsonb)
  to service_role;

-- ── Claim next scene ───────────────────────────────────────────────────────

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
  aktuelle_zusammenfassung text
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
    r.aktuelle_zusammenfassung
  from leseno.szenen s
  join leseno.roman_kontext r on r.id = s.roman_id
  where s.id = v_id;
end;
$$;

revoke all on function public.admin_claim_next_szene(uuid) from public;
grant execute on function public.admin_claim_next_szene(uuid) to service_role;

-- ── Update scene fields ────────────────────────────────────────────────────

create or replace function public.admin_update_szene(
  p_id uuid,
  p_entwurf_raw text,
  p_feedback_lektor text,
  p_feedback_fan text,
  p_entwurf_revidiert text,
  p_status text
)
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
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = leseno, public
as $$
begin
  if p_status is not null
    and p_status not in (
      'READY_FOR_WRITING',
      'DRAFTING',
      'REVIEWING',
      'REVISING',
      'COMPLETED'
    )
  then
    raise exception 'Ungültiger Szenen-Status.';
  end if;

  update leseno.szenen s
  set
    entwurf_raw = coalesce(p_entwurf_raw, s.entwurf_raw),
    feedback_lektor = coalesce(p_feedback_lektor, s.feedback_lektor),
    feedback_fan = coalesce(p_feedback_fan, s.feedback_fan),
    entwurf_revidiert = coalesce(p_entwurf_revidiert, s.entwurf_revidiert),
    status = coalesce(p_status, s.status)
  where s.id = p_id;

  if not found then
    raise exception 'Szene nicht gefunden.';
  end if;

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
    s.updated_at
  from leseno.szenen s
  where s.id = p_id;
end;
$$;

revoke all on function public.admin_update_szene(
  uuid, text, text, text, text, text
) from public;
grant execute on function public.admin_update_szene(
  uuid, text, text, text, text, text
) to service_role;

-- ── Append summary ─────────────────────────────────────────────────────────

create or replace function public.admin_append_roman_zusammenfassung(
  p_roman_id uuid,
  p_paragraph text
)
returns text
language plpgsql
security definer
set search_path = leseno, public
as $$
declare
  v_text text := trim(coalesce(p_paragraph, ''));
  v_result text;
begin
  if v_text = '' then
    select r.aktuelle_zusammenfassung into v_result
    from leseno.roman_kontext r
    where r.id = p_roman_id;
    return coalesce(v_result, '');
  end if;

  update leseno.roman_kontext r
  set aktuelle_zusammenfassung = case
    when nullif(trim(r.aktuelle_zusammenfassung), '') is null then v_text
    else r.aktuelle_zusammenfassung || E'\n\n' || v_text
  end
  where r.id = p_roman_id
  returning r.aktuelle_zusammenfassung into v_result;

  if not found then
    raise exception 'Roman nicht gefunden.';
  end if;

  return v_result;
end;
$$;

revoke all on function public.admin_append_roman_zusammenfassung(uuid, text)
  from public;
grant execute on function public.admin_append_roman_zusammenfassung(uuid, text)
  to service_role;

-- ── Delete roman ───────────────────────────────────────────────────────────

create or replace function public.admin_delete_roman(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = leseno, public
as $$
declare
  v_deleted boolean := false;
begin
  delete from leseno.roman_kontext where id = p_id returning true into v_deleted;
  return coalesce(v_deleted, false);
end;
$$;

revoke all on function public.admin_delete_roman(uuid) from public;
grant execute on function public.admin_delete_roman(uuid) to service_role;

-- Reset stuck DRAFTING/REVIEWING/REVISING back to READY (manual recovery)
create or replace function public.admin_reset_szene_to_ready(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = leseno, public
as $$
begin
  update leseno.szenen s
  set
    status = 'READY_FOR_WRITING',
    entwurf_raw = '',
    feedback_lektor = '',
    feedback_fan = '',
    entwurf_revidiert = ''
  where s.id = p_id
    and s.status <> 'COMPLETED';
  return found;
end;
$$;

revoke all on function public.admin_reset_szene_to_ready(uuid) from public;
grant execute on function public.admin_reset_szene_to_ready(uuid) to service_role;
