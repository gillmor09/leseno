-- PostgREST omits null p_contract and resolves the 9-arg signature.
-- Restore a 9-arg wrapper that leaves contract untouched.

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
  -- Delegate to 10-arg; null p_contract = do not overwrite chapters.contract
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
    null
  );
end;
$$;

revoke all on function public.admin_upsert_chapter(uuid, uuid, int, text, text, jsonb, text, text, text) from public;
grant execute on function public.admin_upsert_chapter(uuid, uuid, int, text, text, jsonb, text, text, text) to service_role;

-- Ensure 10-arg remains callable too
grant execute on function public.admin_upsert_chapter(uuid, uuid, int, text, text, jsonb, text, text, text, jsonb) to service_role;
