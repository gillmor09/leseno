-- Top-Down Roman: skeleton + state matrix + scene manifests.
-- Replaces sequential score/rewrite steering with immutable manifests.

alter table leseno.novels
  add column if not exists skeleton jsonb not null default '{}'::jsonb;

alter table leseno.novels
  add column if not exists skeleton_frozen boolean not null default false;

alter table leseno.novels
  add column if not exists state_matrix jsonb not null default '{}'::jsonb;

comment on column leseno.novels.skeleton is
  'Architect tree: acts, chapters, beats (immutable when skeleton_frozen).';
comment on column leseno.novels.state_matrix is
  'Book-wide state vector (characters, knowledge, items, timeline).';

alter table leseno.scenes
  add column if not exists manifest jsonb not null default '{}'::jsonb;

alter table leseno.scenes
  add column if not exists logic_notes text not null default '';

comment on column leseno.scenes.manifest is
  'Immutable scene datasheet after architect freeze.';
comment on column leseno.scenes.logic_notes is
  'Logic auditor feedback (structural only).';

-- Status: top-down scene loop
alter table leseno.scenes drop constraint if exists scenes_status_check;
alter table leseno.scenes
  add constraint scenes_status_check check (status in (
    'pending',
    'briefing',
    'drafting',
    'auditing',
    'polishing',
    'reviewing',
    'approved',
    'error'
  ));

-- Logic rewrite budget (draft-only loops)
alter table leseno.scenes drop constraint if exists scenes_iteration_check;
alter table leseno.scenes
  add constraint scenes_iteration_check
  check (iteration >= 0 and iteration <= 5);

-- ── admin_update_novel: skeleton + state ───────────────────────────────────

drop function if exists public.admin_update_novel(uuid, text, text, text, jsonb, text, jsonb, text);

create or replace function public.admin_update_novel(
  p_id uuid,
  p_title text default null,
  p_high_concept_idea text default null,
  p_status text default null,
  p_orchestrator_status jsonb default null,
  p_idea_status text default null,
  p_idea_interview jsonb default null,
  p_pilot_mode text default null,
  p_skeleton jsonb default null,
  p_skeleton_frozen boolean default null,
  p_state_matrix jsonb default null
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
    pilot_mode = coalesce(p_pilot_mode, pilot_mode),
    skeleton = coalesce(p_skeleton, skeleton),
    skeleton_frozen = coalesce(p_skeleton_frozen, skeleton_frozen),
    state_matrix = coalesce(p_state_matrix, state_matrix)
  where id = p_id;
  if not found then
    raise exception 'Novel nicht gefunden.';
  end if;
end;
$$;

revoke all on function public.admin_update_novel(
  uuid, text, text, text, jsonb, text, jsonb, text, jsonb, boolean, jsonb
) from public;
grant execute on function public.admin_update_novel(
  uuid, text, text, text, jsonb, text, jsonb, text, jsonb, boolean, jsonb
) to service_role;

-- ── admin_upsert_scene: manifest + logic_notes ─────────────────────────────

drop function if exists public.admin_upsert_scene(
  uuid, uuid, uuid, int, text, text, text, jsonb, text, text, text, text, numeric, jsonb, int
);

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
  p_iteration int default null,
  p_manifest jsonb default null,
  p_logic_notes text default null
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
      characters, briefing, raw_text, final_text, summary, score, feedback,
      iteration, manifest, logic_notes
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
      coalesce(p_iteration, 0),
      coalesce(p_manifest, '{}'::jsonb),
      coalesce(p_logic_notes, '')
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
      iteration = excluded.iteration,
      manifest = excluded.manifest,
      logic_notes = excluded.logic_notes
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
      iteration = coalesce(p_iteration, iteration),
      manifest = coalesce(p_manifest, manifest),
      logic_notes = coalesce(p_logic_notes, logic_notes)
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
  uuid, uuid, uuid, int, text, text, text, jsonb, text, text, text, text, numeric, jsonb, int, jsonb, text
) from public;
grant execute on function public.admin_upsert_scene(
  uuid, uuid, uuid, int, text, text, text, jsonb, text, text, text, text, numeric, jsonb, int, jsonb, text
) to service_role;
