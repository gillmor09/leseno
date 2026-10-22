-- Idea interview mode for greenfield novels (Haiku asks, Luna weaves).

alter table leseno.novels
  add column if not exists idea_status text not null default 'ready'
    check (idea_status in ('ready', 'interview'));

alter table leseno.novels
  add column if not exists idea_interview jsonb not null default '[]'::jsonb;

comment on column leseno.novels.idea_status is
  'ready = high_concept usable for orchestrator; interview = Q&A in progress';
comment on column leseno.novels.idea_interview is
  'Interview messages [{id, role, content, createdAt}]';

-- Create with idea_status
drop function if exists public.admin_create_novel(text, text);

create or replace function public.admin_create_novel(
  p_title text,
  p_high_concept_idea text,
  p_idea_status text default 'ready'
)
returns uuid
language plpgsql
security definer
set search_path = leseno, public
as $$
declare
  v_id uuid;
  v_status text := coalesce(nullif(trim(p_idea_status), ''), 'ready');
begin
  if v_status not in ('ready', 'interview') then
    v_status := 'ready';
  end if;

  insert into leseno.novels (
    title, high_concept_idea, status, orchestrator_status, idea_status, idea_interview
  )
  values (
    coalesce(nullif(trim(p_title), ''), 'Unbenannter Roman'),
    coalesce(p_high_concept_idea, ''),
    'draft',
    jsonb_build_object('phase', 'idle', 'label', 'Bereit', 'updatedAt', now()),
    v_status,
    '[]'::jsonb
  )
  returning id into v_id;

  insert into leseno.style_guides (novel_id) values (v_id);
  insert into leseno.world_building (novel_id) values (v_id);
  insert into leseno.knowledge_graph (novel_id) values (v_id);

  return v_id;
end;
$$;

revoke all on function public.admin_create_novel(text, text, text) from public;
grant execute on function public.admin_create_novel(text, text, text) to service_role;

-- Update: also idea_status + idea_interview
drop function if exists public.admin_update_novel(uuid, text, text, text, jsonb);

create or replace function public.admin_update_novel(
  p_id uuid,
  p_title text default null,
  p_high_concept_idea text default null,
  p_status text default null,
  p_orchestrator_status jsonb default null,
  p_idea_status text default null,
  p_idea_interview jsonb default null
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
    idea_status = case
      when p_idea_status is null then idea_status
      when p_idea_status in ('ready', 'interview') then p_idea_status
      else idea_status
    end,
    idea_interview = coalesce(p_idea_interview, idea_interview)
  where id = p_id;
  if not found then
    raise exception 'Novel nicht gefunden.';
  end if;
end;
$$;

revoke all on function public.admin_update_novel(uuid, text, text, text, jsonb, text, jsonb) from public;
grant execute on function public.admin_update_novel(uuid, text, text, text, jsonb, text, jsonb) to service_role;
