-- Scene-level Roman pipeline + pgvector RAG + pilot_mode HITL.
-- Autor = Claude Haiku, Lektor = GPT Luna 6 (app layer).

-- ── pgvector ───────────────────────────────────────────────────────────────

create schema if not exists extensions;
create extension if not exists vector with schema extensions;

-- ── novels.pilot_mode ──────────────────────────────────────────────────────

alter table leseno.novels
  add column if not exists pilot_mode text not null default 'auto'
    check (pilot_mode in ('auto', 'pause_after_scene'));

comment on column leseno.novels.pilot_mode is
  'auto = write continuously; pause_after_scene = stop after each approved scene';

-- ── characters / locations (normalized) ────────────────────────────────────

create table if not exists leseno.novel_characters (
  id uuid primary key default gen_random_uuid(),
  novel_id uuid not null references leseno.novels (id) on delete cascade,
  name text not null,
  role text not null default '',
  summary text not null default '',
  facts jsonb not null default '{}'::jsonb,
  sort_index int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (novel_id, name)
);

create index if not exists novel_characters_novel_id_idx
  on leseno.novel_characters (novel_id, sort_index);

drop trigger if exists novel_characters_set_updated_at on leseno.novel_characters;
create trigger novel_characters_set_updated_at
before update on leseno.novel_characters
for each row
execute function leseno.set_updated_at();

alter table leseno.novel_characters enable row level security;
revoke all on table leseno.novel_characters from anon, authenticated;
grant all on table leseno.novel_characters to service_role;

create table if not exists leseno.novel_locations (
  id uuid primary key default gen_random_uuid(),
  novel_id uuid not null references leseno.novels (id) on delete cascade,
  name text not null,
  summary text not null default '',
  facts jsonb not null default '{}'::jsonb,
  sort_index int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (novel_id, name)
);

create index if not exists novel_locations_novel_id_idx
  on leseno.novel_locations (novel_id, sort_index);

drop trigger if exists novel_locations_set_updated_at on leseno.novel_locations;
create trigger novel_locations_set_updated_at
before update on leseno.novel_locations
for each row
execute function leseno.set_updated_at();

alter table leseno.novel_locations enable row level security;
revoke all on table leseno.novel_locations from anon, authenticated;
grant all on table leseno.novel_locations to service_role;

-- ── scenes ─────────────────────────────────────────────────────────────────

create table if not exists leseno.scenes (
  id uuid primary key default gen_random_uuid(),
  novel_id uuid not null references leseno.novels (id) on delete cascade,
  chapter_id uuid not null references leseno.chapters (id) on delete cascade,
  scene_index int not null check (scene_index >= 1),
  status text not null default 'pending'
    check (status in (
      'pending',
      'briefing',
      'drafting',
      'reviewing',
      'approved',
      'error'
    )),
  plan_summary text not null default '',
  location text not null default '',
  characters jsonb not null default '[]'::jsonb,
  briefing text not null default '',
  raw_text text not null default '',
  final_text text not null default '',
  summary text not null default '',
  score numeric not null default 0,
  feedback jsonb not null default '[]'::jsonb,
  iteration int not null default 0 check (iteration >= 0 and iteration <= 2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (chapter_id, scene_index)
);

create index if not exists scenes_novel_id_status_idx
  on leseno.scenes (novel_id, status, chapter_id, scene_index);
create index if not exists scenes_chapter_id_idx
  on leseno.scenes (chapter_id, scene_index);

drop trigger if exists scenes_set_updated_at on leseno.scenes;
create trigger scenes_set_updated_at
before update on leseno.scenes
for each row
execute function leseno.set_updated_at();

alter table leseno.scenes enable row level security;
revoke all on table leseno.scenes from anon, authenticated;
grant all on table leseno.scenes to service_role;

-- ── scene_states ───────────────────────────────────────────────────────────

create table if not exists leseno.scene_states (
  scene_id uuid primary key references leseno.scenes (id) on delete cascade,
  novel_id uuid not null references leseno.novels (id) on delete cascade,
  state jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists scene_states_novel_id_idx
  on leseno.scene_states (novel_id);

drop trigger if exists scene_states_set_updated_at on leseno.scene_states;
create trigger scene_states_set_updated_at
before update on leseno.scene_states
for each row
execute function leseno.set_updated_at();

alter table leseno.scene_states enable row level security;
revoke all on table leseno.scene_states from anon, authenticated;
grant all on table leseno.scene_states to service_role;

-- ── scene_embeddings (pgvector) ────────────────────────────────────────────

create table if not exists leseno.scene_embeddings (
  scene_id uuid primary key references leseno.scenes (id) on delete cascade,
  novel_id uuid not null references leseno.novels (id) on delete cascade,
  summary_text text not null default '',
  embedding extensions.vector(1536) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists scene_embeddings_novel_id_idx
  on leseno.scene_embeddings (novel_id);

create index if not exists scene_embeddings_embedding_idx
  on leseno.scene_embeddings
  using hnsw (embedding extensions.vector_cosine_ops);

drop trigger if exists scene_embeddings_set_updated_at on leseno.scene_embeddings;
create trigger scene_embeddings_set_updated_at
before update on leseno.scene_embeddings
for each row
execute function leseno.set_updated_at();

alter table leseno.scene_embeddings enable row level security;
revoke all on table leseno.scene_embeddings from anon, authenticated;
grant all on table leseno.scene_embeddings to service_role;

-- ── Admin SELECT for Realtime (browser) ────────────────────────────────────

create or replace function leseno.is_admin_jwt()
returns boolean
language sql
stable
as $$
  select coalesce(
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin',
    false
  );
$$;

drop policy if exists novels_admin_select on leseno.novels;
create policy novels_admin_select on leseno.novels
  for select to authenticated
  using (leseno.is_admin_jwt());

drop policy if exists scenes_admin_select on leseno.scenes;
create policy scenes_admin_select on leseno.scenes
  for select to authenticated
  using (leseno.is_admin_jwt());

drop policy if exists scene_states_admin_select on leseno.scene_states;
create policy scene_states_admin_select on leseno.scene_states
  for select to authenticated
  using (leseno.is_admin_jwt());

grant select on table leseno.novels to authenticated;
grant select on table leseno.scenes to authenticated;
grant select on table leseno.scene_states to authenticated;

-- Realtime publication (ignore if already added / publication missing)
do $$
begin
  alter publication supabase_realtime add table leseno.scenes;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

-- ── admin_update_novel: pilot_mode ─────────────────────────────────────────

drop function if exists public.admin_update_novel(uuid, text, text, text, jsonb, text, jsonb);

create or replace function public.admin_update_novel(
  p_id uuid,
  p_title text default null,
  p_high_concept_idea text default null,
  p_status text default null,
  p_orchestrator_status jsonb default null,
  p_idea_status text default null,
  p_idea_interview jsonb default null,
  p_pilot_mode text default null
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
    orchestrator_status = coalesce(p_orchestrator_status, orchestrator_status),
    idea_status = coalesce(p_idea_status, idea_status),
    idea_interview = coalesce(p_idea_interview, idea_interview),
    pilot_mode = case
      when p_pilot_mode in ('auto', 'pause_after_scene') then p_pilot_mode
      else pilot_mode
    end
  where id = p_id;
  if not found then
    raise exception 'Novel nicht gefunden.';
  end if;
end;
$$;

revoke all on function public.admin_update_novel(uuid, text, text, text, jsonb, text, jsonb, text) from public;
grant execute on function public.admin_update_novel(uuid, text, text, text, jsonb, text, jsonb, text) to service_role;

-- ── admin_get_novel: include scenes + states + pilot_mode ──────────────────

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
    'scenes', coalesce(
      (
        select jsonb_agg(to_jsonb(s) order by c.chapter_number, s.scene_index)
        from leseno.scenes s
        join leseno.chapters c on c.id = s.chapter_id
        where s.novel_id = p_id
      ),
      '[]'::jsonb
    ),
    'scene_states', coalesce(
      (
        select jsonb_agg(to_jsonb(st) order by st.updated_at)
        from leseno.scene_states st
        where st.novel_id = p_id
      ),
      '[]'::jsonb
    ),
    'characters', coalesce(
      (
        select jsonb_agg(to_jsonb(ch) order by ch.sort_index, ch.name)
        from leseno.novel_characters ch
        where ch.novel_id = p_id
      ),
      '[]'::jsonb
    ),
    'locations', coalesce(
      (
        select jsonb_agg(to_jsonb(loc) order by loc.sort_index, loc.name)
        from leseno.novel_locations loc
        where loc.novel_id = p_id
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

-- ── upsert / replace characters & locations ────────────────────────────────

create or replace function public.admin_replace_novel_characters(
  p_novel_id uuid,
  p_characters jsonb
)
returns void
language plpgsql
security definer
set search_path = leseno, public
as $$
declare
  v_item jsonb;
  v_idx int := 0;
begin
  delete from leseno.novel_characters where novel_id = p_novel_id;
  if p_characters is null or jsonb_typeof(p_characters) <> 'array' then
    return;
  end if;
  for v_item in select * from jsonb_array_elements(p_characters)
  loop
    v_idx := v_idx + 1;
    insert into leseno.novel_characters (
      novel_id, name, role, summary, facts, sort_index
    ) values (
      p_novel_id,
      coalesce(nullif(trim(v_item->>'name'), ''), 'Unbenannt'),
      coalesce(v_item->>'role', ''),
      coalesce(v_item->>'summary', v_item->>'role', ''),
      coalesce(v_item->'facts', '{}'::jsonb),
      v_idx
    )
    on conflict (novel_id, name) do update set
      role = excluded.role,
      summary = excluded.summary,
      facts = excluded.facts,
      sort_index = excluded.sort_index;
  end loop;
end;
$$;

revoke all on function public.admin_replace_novel_characters(uuid, jsonb) from public;
grant execute on function public.admin_replace_novel_characters(uuid, jsonb) to service_role;

create or replace function public.admin_replace_novel_locations(
  p_novel_id uuid,
  p_locations jsonb
)
returns void
language plpgsql
security definer
set search_path = leseno, public
as $$
declare
  v_item jsonb;
  v_idx int := 0;
  v_name text;
begin
  delete from leseno.novel_locations where novel_id = p_novel_id;
  if p_locations is null or jsonb_typeof(p_locations) <> 'array' then
    return;
  end if;
  for v_item in select * from jsonb_array_elements(p_locations)
  loop
    v_idx := v_idx + 1;
    v_name := coalesce(
      nullif(trim(v_item->>'name'), ''),
      nullif(trim(v_item->>'title'), ''),
      'Ort ' || v_idx::text
    );
    insert into leseno.novel_locations (
      novel_id, name, summary, facts, sort_index
    ) values (
      p_novel_id,
      v_name,
      coalesce(v_item->>'summary', v_item->>'description', ''),
      case
        when jsonb_typeof(v_item) = 'object' then v_item
        else '{}'::jsonb
      end,
      v_idx
    )
    on conflict (novel_id, name) do update set
      summary = excluded.summary,
      facts = excluded.facts,
      sort_index = excluded.sort_index;
  end loop;
end;
$$;

revoke all on function public.admin_replace_novel_locations(uuid, jsonb) from public;
grant execute on function public.admin_replace_novel_locations(uuid, jsonb) to service_role;

-- ── scene CRUD ─────────────────────────────────────────────────────────────

create or replace function public.admin_upsert_scene(
  p_id uuid,
  p_novel_id uuid,
  p_chapter_id uuid,
  p_scene_index int,
  p_status text default null,
  p_plan_summary text default null,
  p_location text default null,
  p_characters jsonb default null,
  p_briefing text default null,
  p_raw_text text default null,
  p_final_text text default null,
  p_summary text default null,
  p_score numeric default null,
  p_feedback jsonb default null,
  p_iteration int default null
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
    insert into leseno.scenes (
      novel_id, chapter_id, scene_index, status, plan_summary, location,
      characters, briefing, raw_text, final_text, summary, score, feedback, iteration
    ) values (
      p_novel_id,
      p_chapter_id,
      p_scene_index,
      coalesce(p_status, 'pending'),
      coalesce(p_plan_summary, ''),
      coalesce(p_location, ''),
      coalesce(p_characters, '[]'::jsonb),
      coalesce(p_briefing, ''),
      coalesce(p_raw_text, ''),
      coalesce(p_final_text, ''),
      coalesce(p_summary, ''),
      coalesce(p_score, 0),
      coalesce(p_feedback, '[]'::jsonb),
      coalesce(p_iteration, 0)
    )
    on conflict (chapter_id, scene_index) do update set
      status = excluded.status,
      plan_summary = excluded.plan_summary,
      location = excluded.location,
      characters = excluded.characters,
      briefing = excluded.briefing,
      raw_text = excluded.raw_text,
      final_text = excluded.final_text,
      summary = excluded.summary,
      score = excluded.score,
      feedback = excluded.feedback,
      iteration = excluded.iteration
    returning id into v_id;
  else
    update leseno.scenes
    set
      status = coalesce(p_status, status),
      plan_summary = coalesce(p_plan_summary, plan_summary),
      location = coalesce(p_location, location),
      characters = coalesce(p_characters, characters),
      briefing = coalesce(p_briefing, briefing),
      raw_text = coalesce(p_raw_text, raw_text),
      final_text = coalesce(p_final_text, final_text),
      summary = coalesce(p_summary, summary),
      score = coalesce(p_score, score),
      feedback = coalesce(p_feedback, feedback),
      iteration = coalesce(p_iteration, iteration)
    where id = p_id and novel_id = p_novel_id
    returning id into v_id;
    if v_id is null then
      raise exception 'Szene nicht gefunden.';
    end if;
  end if;
  return v_id;
end;
$$;

revoke all on function public.admin_upsert_scene(
  uuid, uuid, uuid, int, text, text, text, jsonb, text, text, text, text, numeric, jsonb, int
) from public;
grant execute on function public.admin_upsert_scene(
  uuid, uuid, uuid, int, text, text, text, jsonb, text, text, text, text, numeric, jsonb, int
) to service_role;

create or replace function public.admin_upsert_scene_state(
  p_scene_id uuid,
  p_novel_id uuid,
  p_state jsonb
)
returns void
language plpgsql
security definer
set search_path = leseno, public
as $$
begin
  insert into leseno.scene_states (scene_id, novel_id, state)
  values (p_scene_id, p_novel_id, coalesce(p_state, '{}'::jsonb))
  on conflict (scene_id) do update set
    state = excluded.state,
    novel_id = excluded.novel_id;
end;
$$;

revoke all on function public.admin_upsert_scene_state(uuid, uuid, jsonb) from public;
grant execute on function public.admin_upsert_scene_state(uuid, uuid, jsonb) to service_role;

create or replace function public.admin_upsert_scene_embedding(
  p_scene_id uuid,
  p_novel_id uuid,
  p_summary_text text,
  p_embedding extensions.vector(1536)
)
returns void
language plpgsql
security definer
set search_path = leseno, public, extensions
as $$
begin
  insert into leseno.scene_embeddings (scene_id, novel_id, summary_text, embedding)
  values (
    p_scene_id,
    p_novel_id,
    coalesce(p_summary_text, ''),
    p_embedding
  )
  on conflict (scene_id) do update set
    summary_text = excluded.summary_text,
    embedding = excluded.embedding,
    novel_id = excluded.novel_id;
end;
$$;

revoke all on function public.admin_upsert_scene_embedding(uuid, uuid, text, extensions.vector) from public;
grant execute on function public.admin_upsert_scene_embedding(uuid, uuid, text, extensions.vector) to service_role;

-- Semantic match for RAG briefing
create or replace function public.admin_match_scene_embeddings(
  p_novel_id uuid,
  p_query_embedding extensions.vector(1536),
  p_match_count int default 5,
  p_exclude_scene_id uuid default null
)
returns table (
  scene_id uuid,
  chapter_id uuid,
  scene_index int,
  summary_text text,
  similarity float
)
language sql
stable
security definer
set search_path = leseno, public, extensions
as $$
  select
    e.scene_id,
    s.chapter_id,
    s.scene_index,
    e.summary_text,
    (1 - (e.embedding <=> p_query_embedding))::float as similarity
  from leseno.scene_embeddings e
  join leseno.scenes s on s.id = e.scene_id
  where e.novel_id = p_novel_id
    and (p_exclude_scene_id is null or e.scene_id <> p_exclude_scene_id)
  order by e.embedding <=> p_query_embedding
  limit greatest(1, least(coalesce(p_match_count, 5), 20));
$$;

revoke all on function public.admin_match_scene_embeddings(uuid, extensions.vector, int, uuid) from public;
grant execute on function public.admin_match_scene_embeddings(uuid, extensions.vector, int, uuid) to service_role;

-- Delete all scenes for a novel (re-outline)
create or replace function public.admin_delete_novel_scenes(p_novel_id uuid)
returns int
language plpgsql
security definer
set search_path = leseno, public
as $$
declare
  v_count int;
begin
  delete from leseno.scenes where novel_id = p_novel_id;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.admin_delete_novel_scenes(uuid) from public;
grant execute on function public.admin_delete_novel_scenes(uuid) to service_role;
