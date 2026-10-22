-- Greenfield Roman module (Zwei-Rollen-Orchestrator).
-- Tables in leseno; service_role + admin_* RPCs only.

-- ── novels ─────────────────────────────────────────────────────────────────

create table if not exists leseno.novels (
  id uuid primary key default gen_random_uuid(),
  title text not null default 'Unbenannter Roman',
  high_concept_idea text not null default '',
  status text not null default 'draft'
    check (status in (
      'draft',
      'setup',
      'outlining',
      'writing',
      'paused',
      'completed',
      'error'
    )),
  orchestrator_status jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists novels_set_updated_at on leseno.novels;
create trigger novels_set_updated_at
before update on leseno.novels
for each row
execute function leseno.set_updated_at();

alter table leseno.novels enable row level security;
revoke all on table leseno.novels from anon, authenticated;
grant all on table leseno.novels to service_role;

-- ── style_guides ───────────────────────────────────────────────────────────

create table if not exists leseno.style_guides (
  novel_id uuid primary key references leseno.novels (id) on delete cascade,
  genre text not null default '',
  subgenre text not null default '',
  primary_tone text not null default '',
  narrative_perspective text not null default '',
  style_rules jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists style_guides_set_updated_at on leseno.style_guides;
create trigger style_guides_set_updated_at
before update on leseno.style_guides
for each row
execute function leseno.set_updated_at();

alter table leseno.style_guides enable row level security;
revoke all on table leseno.style_guides from anon, authenticated;
grant all on table leseno.style_guides to service_role;

-- ── world_building ─────────────────────────────────────────────────────────

create table if not exists leseno.world_building (
  novel_id uuid primary key references leseno.novels (id) on delete cascade,
  characters jsonb not null default '[]'::jsonb,
  lore_rules jsonb not null default '[]'::jsonb,
  locations jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists world_building_set_updated_at on leseno.world_building;
create trigger world_building_set_updated_at
before update on leseno.world_building
for each row
execute function leseno.set_updated_at();

alter table leseno.world_building enable row level security;
revoke all on table leseno.world_building from anon, authenticated;
grant all on table leseno.world_building to service_role;

-- ── knowledge_graph ────────────────────────────────────────────────────────

create table if not exists leseno.knowledge_graph (
  novel_id uuid primary key references leseno.novels (id) on delete cascade,
  entity_states jsonb not null default '{}'::jsonb,
  timeline_events jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists knowledge_graph_set_updated_at on leseno.knowledge_graph;
create trigger knowledge_graph_set_updated_at
before update on leseno.knowledge_graph
for each row
execute function leseno.set_updated_at();

alter table leseno.knowledge_graph enable row level security;
revoke all on table leseno.knowledge_graph from anon, authenticated;
grant all on table leseno.knowledge_graph to service_role;

-- ── chapters ───────────────────────────────────────────────────────────────

create table if not exists leseno.chapters (
  id uuid primary key default gen_random_uuid(),
  novel_id uuid not null references leseno.novels (id) on delete cascade,
  chapter_number int not null check (chapter_number >= 1),
  title text not null default '',
  outline text not null default '',
  scene_plan jsonb not null default '[]'::jsonb,
  raw_draft text not null default '',
  final_text text not null default '',
  status text not null default 'planned'
    check (status in (
      'planned',
      'scene_planning',
      'drafting',
      'reviewing',
      'approved',
      'approved_with_warnings',
      'error'
    )),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (novel_id, chapter_number)
);

create index if not exists chapters_novel_id_number_idx
  on leseno.chapters (novel_id, chapter_number);

drop trigger if exists chapters_set_updated_at on leseno.chapters;
create trigger chapters_set_updated_at
before update on leseno.chapters
for each row
execute function leseno.set_updated_at();

alter table leseno.chapters enable row level security;
revoke all on table leseno.chapters from anon, authenticated;
grant all on table leseno.chapters to service_role;

-- ── editor_feedbacks ───────────────────────────────────────────────────────

create table if not exists leseno.editor_feedbacks (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid not null references leseno.chapters (id) on delete cascade,
  iteration int not null check (iteration >= 1 and iteration <= 3),
  score numeric not null default 0,
  tone_alignment_score numeric not null default 0,
  issues jsonb not null default '[]'::jsonb,
  approved boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists editor_feedbacks_chapter_id_idx
  on leseno.editor_feedbacks (chapter_id, iteration);

alter table leseno.editor_feedbacks enable row level security;
revoke all on table leseno.editor_feedbacks from anon, authenticated;
grant all on table leseno.editor_feedbacks to service_role;

-- ── RPCs: list novels ──────────────────────────────────────────────────────

create or replace function public.admin_list_novels()
returns table (
  id uuid,
  title text,
  high_concept_idea text,
  status text,
  orchestrator_status jsonb,
  chapter_count int,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = leseno, public
as $$
  select
    n.id,
    n.title,
    n.high_concept_idea,
    n.status,
    n.orchestrator_status,
    coalesce(
      (select count(*)::int from leseno.chapters c where c.novel_id = n.id),
      0
    ) as chapter_count,
    n.created_at,
    n.updated_at
  from leseno.novels n
  order by n.updated_at desc;
$$;

revoke all on function public.admin_list_novels() from public;
grant execute on function public.admin_list_novels() to service_role;

-- ── get novel bundle ───────────────────────────────────────────────────────

create or replace function public.admin_get_novel(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = leseno, public
as $$
declare
  v_novel leseno.novels%rowtype;
  v_style leseno.style_guides%rowtype;
  v_world leseno.world_building%rowtype;
  v_kg leseno.knowledge_graph%rowtype;
begin
  select * into v_novel from leseno.novels where id = p_id;
  if not found then
    return null;
  end if;
  select * into v_style from leseno.style_guides where novel_id = p_id;
  select * into v_world from leseno.world_building where novel_id = p_id;
  select * into v_kg from leseno.knowledge_graph where novel_id = p_id;

  return jsonb_build_object(
    'novel', to_jsonb(v_novel),
    'style_guide', case when v_style.novel_id is null then null else to_jsonb(v_style) end,
    'world_building', case when v_world.novel_id is null then null else to_jsonb(v_world) end,
    'knowledge_graph', case when v_kg.novel_id is null then null else to_jsonb(v_kg) end,
    'chapters', coalesce(
      (
        select jsonb_agg(to_jsonb(c) order by c.chapter_number)
        from leseno.chapters c
        where c.novel_id = p_id
      ),
      '[]'::jsonb
    ),
    'editor_feedbacks', coalesce(
      (
        select jsonb_agg(to_jsonb(f) order by f.created_at)
        from leseno.editor_feedbacks f
        join leseno.chapters c on c.id = f.chapter_id
        where c.novel_id = p_id
      ),
      '[]'::jsonb
    )
  );
end;
$$;

revoke all on function public.admin_get_novel(uuid) from public;
grant execute on function public.admin_get_novel(uuid) to service_role;

-- ── create novel ───────────────────────────────────────────────────────────

create or replace function public.admin_create_novel(
  p_title text,
  p_high_concept_idea text
)
returns uuid
language plpgsql
security definer
set search_path = leseno, public
as $$
declare
  v_id uuid;
begin
  insert into leseno.novels (title, high_concept_idea, status, orchestrator_status)
  values (
    coalesce(nullif(trim(p_title), ''), 'Unbenannter Roman'),
    coalesce(p_high_concept_idea, ''),
    'draft',
    jsonb_build_object('phase', 'idle', 'label', 'Bereit', 'updatedAt', now())
  )
  returning id into v_id;

  insert into leseno.style_guides (novel_id) values (v_id);
  insert into leseno.world_building (novel_id) values (v_id);
  insert into leseno.knowledge_graph (novel_id) values (v_id);

  return v_id;
end;
$$;

revoke all on function public.admin_create_novel(text, text) from public;
grant execute on function public.admin_create_novel(text, text) to service_role;

-- ── update novel core ──────────────────────────────────────────────────────

create or replace function public.admin_update_novel(
  p_id uuid,
  p_title text default null,
  p_high_concept_idea text default null,
  p_status text default null,
  p_orchestrator_status jsonb default null
)
returns void
language plpgsql
security definer
set search_path = leseno, public
as $$
begin
  update leseno.novels
  set
    title = coalesce(nullif(trim(p_title), ''), title),
    high_concept_idea = coalesce(p_high_concept_idea, high_concept_idea),
    status = coalesce(p_status, status),
    orchestrator_status = coalesce(p_orchestrator_status, orchestrator_status)
  where id = p_id;
  if not found then
    raise exception 'Novel nicht gefunden.';
  end if;
end;
$$;

revoke all on function public.admin_update_novel(uuid, text, text, text, jsonb) from public;
grant execute on function public.admin_update_novel(uuid, text, text, text, jsonb) to service_role;

-- ── upsert style / world / kg ──────────────────────────────────────────────

create or replace function public.admin_upsert_style_guide(
  p_novel_id uuid,
  p_genre text,
  p_subgenre text,
  p_primary_tone text,
  p_narrative_perspective text,
  p_style_rules jsonb
)
returns void
language plpgsql
security definer
set search_path = leseno, public
as $$
begin
  insert into leseno.style_guides (
    novel_id, genre, subgenre, primary_tone, narrative_perspective, style_rules
  ) values (
    p_novel_id,
    coalesce(p_genre, ''),
    coalesce(p_subgenre, ''),
    coalesce(p_primary_tone, ''),
    coalesce(p_narrative_perspective, ''),
    coalesce(p_style_rules, '{}'::jsonb)
  )
  on conflict (novel_id) do update set
    genre = excluded.genre,
    subgenre = excluded.subgenre,
    primary_tone = excluded.primary_tone,
    narrative_perspective = excluded.narrative_perspective,
    style_rules = excluded.style_rules;
end;
$$;

revoke all on function public.admin_upsert_style_guide(uuid, text, text, text, text, jsonb) from public;
grant execute on function public.admin_upsert_style_guide(uuid, text, text, text, text, jsonb) to service_role;

create or replace function public.admin_upsert_world_building(
  p_novel_id uuid,
  p_characters jsonb,
  p_lore_rules jsonb,
  p_locations jsonb
)
returns void
language plpgsql
security definer
set search_path = leseno, public
as $$
begin
  insert into leseno.world_building (novel_id, characters, lore_rules, locations)
  values (
    p_novel_id,
    coalesce(p_characters, '[]'::jsonb),
    coalesce(p_lore_rules, '[]'::jsonb),
    coalesce(p_locations, '[]'::jsonb)
  )
  on conflict (novel_id) do update set
    characters = excluded.characters,
    lore_rules = excluded.lore_rules,
    locations = excluded.locations;
end;
$$;

revoke all on function public.admin_upsert_world_building(uuid, jsonb, jsonb, jsonb) from public;
grant execute on function public.admin_upsert_world_building(uuid, jsonb, jsonb, jsonb) to service_role;

create or replace function public.admin_upsert_knowledge_graph(
  p_novel_id uuid,
  p_entity_states jsonb,
  p_timeline_events jsonb
)
returns void
language plpgsql
security definer
set search_path = leseno, public
as $$
begin
  insert into leseno.knowledge_graph (novel_id, entity_states, timeline_events)
  values (
    p_novel_id,
    coalesce(p_entity_states, '{}'::jsonb),
    coalesce(p_timeline_events, '[]'::jsonb)
  )
  on conflict (novel_id) do update set
    entity_states = excluded.entity_states,
    timeline_events = excluded.timeline_events;
end;
$$;

revoke all on function public.admin_upsert_knowledge_graph(uuid, jsonb, jsonb) from public;
grant execute on function public.admin_upsert_knowledge_graph(uuid, jsonb, jsonb) to service_role;

-- ── upsert chapter ─────────────────────────────────────────────────────────

create or replace function public.admin_upsert_chapter(
  p_id uuid,
  p_novel_id uuid,
  p_chapter_number int,
  p_title text,
  p_outline text,
  p_scene_plan jsonb,
  p_raw_draft text,
  p_final_text text,
  p_status text
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
    insert into leseno.chapters (
      novel_id, chapter_number, title, outline, scene_plan,
      raw_draft, final_text, status
    ) values (
      p_novel_id,
      p_chapter_number,
      coalesce(p_title, ''),
      coalesce(p_outline, ''),
      coalesce(p_scene_plan, '[]'::jsonb),
      coalesce(p_raw_draft, ''),
      coalesce(p_final_text, ''),
      coalesce(p_status, 'planned')
    )
    on conflict (novel_id, chapter_number) do update set
      title = excluded.title,
      outline = excluded.outline,
      scene_plan = excluded.scene_plan,
      raw_draft = excluded.raw_draft,
      final_text = excluded.final_text,
      status = excluded.status
    returning id into v_id;
  else
    update leseno.chapters
    set
      title = coalesce(p_title, title),
      outline = coalesce(p_outline, outline),
      scene_plan = coalesce(p_scene_plan, scene_plan),
      raw_draft = coalesce(p_raw_draft, raw_draft),
      final_text = coalesce(p_final_text, final_text),
      status = coalesce(p_status, status),
      chapter_number = coalesce(p_chapter_number, chapter_number)
    where id = p_id and novel_id = p_novel_id
    returning id into v_id;
    if v_id is null then
      raise exception 'Kapitel nicht gefunden.';
    end if;
  end if;
  return v_id;
end;
$$;

revoke all on function public.admin_upsert_chapter(uuid, uuid, int, text, text, jsonb, text, text, text) from public;
grant execute on function public.admin_upsert_chapter(uuid, uuid, int, text, text, jsonb, text, text, text) to service_role;

-- ── insert editor feedback ─────────────────────────────────────────────────

create or replace function public.admin_insert_editor_feedback(
  p_chapter_id uuid,
  p_iteration int,
  p_score numeric,
  p_tone_alignment_score numeric,
  p_issues jsonb,
  p_approved boolean
)
returns uuid
language plpgsql
security definer
set search_path = leseno, public
as $$
declare
  v_id uuid;
begin
  insert into leseno.editor_feedbacks (
    chapter_id, iteration, score, tone_alignment_score, issues, approved
  ) values (
    p_chapter_id,
    p_iteration,
    coalesce(p_score, 0),
    coalesce(p_tone_alignment_score, 0),
    coalesce(p_issues, '[]'::jsonb),
    coalesce(p_approved, false)
  )
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.admin_insert_editor_feedback(uuid, int, numeric, numeric, jsonb, boolean) from public;
grant execute on function public.admin_insert_editor_feedback(uuid, int, numeric, numeric, jsonb, boolean) to service_role;

-- ── delete novel ───────────────────────────────────────────────────────────

create or replace function public.admin_delete_novel(p_id uuid)
returns void
language plpgsql
security definer
set search_path = leseno, public
as $$
begin
  delete from leseno.novels where id = p_id;
end;
$$;

revoke all on function public.admin_delete_novel(uuid) from public;
grant execute on function public.admin_delete_novel(uuid) to service_role;
