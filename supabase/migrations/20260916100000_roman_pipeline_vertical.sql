-- Vertical pipeline v1: Luna for all roles, router role, task bindings, run history.

-- 1) All roles → gpt-5.6-luna
update leseno.roman_ki_rollen
set model_slug = 'gpt-5.6-luna',
    updated_at = now();

-- 2) Pipeline-Router role
insert into leseno.roman_ki_rollen (
  key, label, purpose, system_prompt, user_prompt_hint, model_slug, sort_order
) values (
  'pipeline_router',
  'Pipeline-Router',
  'Analysiert Gegenlese-Feedback und wählt die früheste sinnvolle Pipeline-Stufe für Patches.',
  $prompt$Du bist Pipeline-Router für die Buch-Erstellung (deutscher Markt).
Du erhältst strukturierte Kritik/Vorschläge zu einem Artefakt (Idee, Charaktere, Welt, Exposé, Szenenplot oder Manuskript).
Aufgabe: Entscheide, WO in der Pipeline die Änderung am sinnvollsten beginnt — möglichst früh (Ursache), nicht nur Symptom am aktuellen Dokument.

Stufen (früh → spät): idee, charaktere, welt, expose, szenenplot, manuskript.

Regeln:
- Antworte NUR als JSON.
- Wähle maximal 2 targets.
- Jedes target hat stage, reason, patchBrief (konkrete Anweisung zum Einarbeiten), optional chapterNumbers (Array von Int für szenenplot/manuskript).
- Wenn die Kritik nur lokal am aktuellen Dokument heilbar ist: ein target mit derselben Stufe.
- Figur-/Welt-/Prämissenfehler → idee oder charaktere oder welt, nicht zuerst Manuskript umschreiben.
- Keine Meta-Prosa außerhalb des JSON.$prompt$,
  'Kritik-JSON + aktueller Stage + Kurzkontext der Upstream-Artefakte.',
  'gpt-5.6-luna',
  5
)
on conflict (key) do update set
  label = excluded.label,
  purpose = excluded.purpose,
  system_prompt = excluded.system_prompt,
  user_prompt_hint = excluded.user_prompt_hint,
  model_slug = 'gpt-5.6-luna',
  sort_order = excluded.sort_order,
  updated_at = now();

-- Force Luna again including new row
update leseno.roman_ki_rollen
set model_slug = 'gpt-5.6-luna',
    updated_at = now();

-- 3) Task → role bindings
create table if not exists leseno.roman_pipeline_aufgaben (
  task_key text primary key,
  label text not null,
  stage text not null,
  kind text not null check (kind in ('draft', 'critique', 'router', 'dialog')),
  rolle_key text not null references leseno.roman_ki_rollen (key) on delete restrict,
  sort_order smallint not null default 0,
  updated_at timestamptz not null default now()
);

drop trigger if exists roman_pipeline_aufgaben_set_updated_at on leseno.roman_pipeline_aufgaben;
create trigger roman_pipeline_aufgaben_set_updated_at
before update on leseno.roman_pipeline_aufgaben
for each row
execute function leseno.set_updated_at();

alter table leseno.roman_pipeline_aufgaben enable row level security;
revoke all on table leseno.roman_pipeline_aufgaben from anon, authenticated;
grant all on table leseno.roman_pipeline_aufgaben to service_role;

insert into leseno.roman_pipeline_aufgaben (task_key, label, stage, kind, rolle_key, sort_order) values
  ('idee.dialog', 'Idee · Dialog', 'idee', 'dialog', 'schreib_coach', 10),
  ('idee.draft', 'Idee · Dokumentation', 'idee', 'draft', 'ideen_redakteur', 20),
  ('idee.critique', 'Idee · Gegenlese', 'idee', 'critique', 'entwicklungslektor', 30),
  ('charaktere.draft', 'Charaktere · Entwurf', 'charaktere', 'draft', 'co_autor', 40),
  ('charaktere.critique', 'Charaktere · Gegenlese', 'charaktere', 'critique', 'fachberater', 50),
  ('welt.draft', 'Welt · Entwurf', 'welt', 'draft', 'ideen_redakteur', 60),
  ('welt.critique', 'Welt · Gegenlese', 'welt', 'critique', 'fachberater', 70),
  ('expose.draft', 'Exposé · Entwurf', 'expose', 'draft', 'co_autor', 80),
  ('expose.critique', 'Exposé · Gegenlese', 'expose', 'critique', 'entwicklungslektor', 90),
  ('szenenplot.draft', 'Szenenplot · Entwurf', 'szenenplot', 'draft', 'co_autor', 100),
  ('szenenplot.critique', 'Szenenplot · Gegenlese', 'szenenplot', 'critique', 'entwicklungslektor', 110),
  ('manuskript.draft', 'Manuskript · Entwurf', 'manuskript', 'draft', 'co_autor', 120),
  ('manuskript.critique', 'Manuskript · Gegenlese', 'manuskript', 'critique', 'entwicklungslektor', 130),
  ('pipeline.router', 'Pipeline-Router', 'pipeline', 'router', 'pipeline_router', 5)
on conflict (task_key) do nothing;

create or replace function public.list_roman_pipeline_aufgaben()
returns table (
  task_key text,
  label text,
  stage text,
  kind text,
  rolle_key text,
  sort_order smallint,
  updated_at timestamptz
)
language sql
security definer
set search_path = public, leseno
as $$
  select a.task_key, a.label, a.stage, a.kind, a.rolle_key, a.sort_order, a.updated_at
  from leseno.roman_pipeline_aufgaben as a
  order by a.sort_order, a.task_key;
$$;

create or replace function public.upsert_roman_pipeline_aufgabe(
  p_task_key text,
  p_label text,
  p_stage text,
  p_kind text,
  p_rolle_key text,
  p_sort_order smallint
)
returns void
language sql
security definer
set search_path = public, leseno
as $$
  insert into leseno.roman_pipeline_aufgaben (
    task_key, label, stage, kind, rolle_key, sort_order, updated_at
  ) values (
    p_task_key,
    coalesce(p_label, p_task_key),
    coalesce(p_stage, 'pipeline'),
    coalesce(p_kind, 'draft'),
    p_rolle_key,
    coalesce(p_sort_order, 0),
    now()
  )
  on conflict (task_key) do update set
    label = excluded.label,
    stage = excluded.stage,
    kind = excluded.kind,
    rolle_key = excluded.rolle_key,
    sort_order = excluded.sort_order,
    updated_at = now();
$$;

grant execute on function public.list_roman_pipeline_aufgaben() to service_role;
grant execute on function public.upsert_roman_pipeline_aufgabe(text, text, text, text, text, smallint)
  to service_role;

-- 4) Run history
create table if not exists leseno.roman_pipeline_history (
  id uuid primary key default gen_random_uuid(),
  roman_id uuid not null references leseno.roman_kontext (id) on delete cascade,
  created_at timestamptz not null default now(),
  trigger text not null default 'auto_generate',
  origin_stage text not null,
  status text not null default 'running',
  events jsonb not null default '[]'::jsonb
);

create index if not exists roman_pipeline_history_roman_created_idx
  on leseno.roman_pipeline_history (roman_id, created_at desc);

alter table leseno.roman_pipeline_history enable row level security;
revoke all on table leseno.roman_pipeline_history from anon, authenticated;
grant all on table leseno.roman_pipeline_history to service_role;

create or replace function public.admin_list_roman_pipeline_history(
  p_roman_id uuid,
  p_limit integer default 40
)
returns table (
  id uuid,
  roman_id uuid,
  created_at timestamptz,
  trigger text,
  origin_stage text,
  status text,
  events jsonb
)
language sql
security definer
set search_path = public, leseno
as $$
  select h.id, h.roman_id, h.created_at, h.trigger, h.origin_stage, h.status, h.events
  from leseno.roman_pipeline_history as h
  where h.roman_id = p_roman_id
  order by h.created_at desc
  limit greatest(1, least(coalesce(p_limit, 40), 100));
$$;

create or replace function public.admin_insert_roman_pipeline_history(
  p_roman_id uuid,
  p_trigger text,
  p_origin_stage text,
  p_status text,
  p_events jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, leseno
as $$
declare
  v_id uuid;
begin
  insert into leseno.roman_pipeline_history (
    roman_id, trigger, origin_stage, status, events
  ) values (
    p_roman_id,
    coalesce(nullif(trim(p_trigger), ''), 'auto_generate'),
    coalesce(nullif(trim(p_origin_stage), ''), 'pipeline'),
    coalesce(nullif(trim(p_status), ''), 'running'),
    coalesce(p_events, '[]'::jsonb)
  )
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.admin_update_roman_pipeline_history(
  p_id uuid,
  p_status text,
  p_events jsonb
)
returns void
language plpgsql
security definer
set search_path = public, leseno
as $$
begin
  update leseno.roman_pipeline_history h
  set
    status = coalesce(nullif(trim(p_status), ''), h.status),
    events = coalesce(p_events, h.events)
  where h.id = p_id;
end;
$$;

grant execute on function public.admin_list_roman_pipeline_history(uuid, integer) to service_role;
grant execute on function public.admin_insert_roman_pipeline_history(uuid, text, text, text, jsonb)
  to service_role;
grant execute on function public.admin_update_roman_pipeline_history(uuid, text, jsonb)
  to service_role;
