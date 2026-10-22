-- Self-contained: ensure BOTH upsert overloads exist.
-- (160000 may have dropped 9-arg; 161000 wrapper needs 10-arg which was missing.)

alter table leseno.chapters
  add column if not exists contract jsonb not null default '{}'::jsonb;

-- 1) Full 10-arg implementation
create or replace function public.admin_upsert_chapter(
  p_id uuid,
  p_novel_id uuid,
  p_chapter_number int,
  p_title text,
  p_outline text,
  p_scene_plan jsonb,
  p_raw_draft text,
  p_final_text text,
  p_status text,
  p_contract jsonb
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
      raw_draft, final_text, status, contract
    ) values (
      p_novel_id,
      p_chapter_number,
      coalesce(p_title, ''),
      coalesce(p_outline, ''),
      coalesce(p_scene_plan, '[]'::jsonb),
      coalesce(p_raw_draft, ''),
      coalesce(p_final_text, ''),
      coalesce(p_status, 'planned'),
      coalesce(p_contract, '{}'::jsonb)
    )
    on conflict (novel_id, chapter_number) do update set
      title = excluded.title,
      outline = excluded.outline,
      scene_plan = excluded.scene_plan,
      raw_draft = excluded.raw_draft,
      final_text = excluded.final_text,
      status = excluded.status,
      contract = case
        when p_contract is null then leseno.chapters.contract
        else excluded.contract
      end
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
      chapter_number = coalesce(p_chapter_number, chapter_number),
      contract = coalesce(p_contract, contract)
    where id = p_id and novel_id = p_novel_id
    returning id into v_id;
    if v_id is null then
      raise exception 'Kapitel nicht gefunden.';
    end if;
  end if;
  return v_id;
end;
$$;

-- 2) 9-arg wrapper (PostgREST when p_contract omitted) — leaves contract alone
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
begin
  return public.admin_upsert_chapter(
    p_id,
    p_novel_id,
    p_chapter_number,
    p_title,
    p_outline,
    p_scene_plan,
    p_raw_draft,
    p_final_text,
    p_status,
    null::jsonb
  );
end;
$$;

revoke all on function public.admin_upsert_chapter(uuid, uuid, int, text, text, jsonb, text, text, text) from public;
revoke all on function public.admin_upsert_chapter(uuid, uuid, int, text, text, jsonb, text, text, text, jsonb) from public;
grant execute on function public.admin_upsert_chapter(uuid, uuid, int, text, text, jsonb, text, text, text) to service_role;
grant execute on function public.admin_upsert_chapter(uuid, uuid, int, text, text, jsonb, text, text, text, jsonb) to service_role;
