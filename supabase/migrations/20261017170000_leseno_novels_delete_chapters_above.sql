-- Delete chapters above N via public RPC (leseno schema not exposed to PostgREST).

create or replace function public.admin_delete_chapters_above(
  p_novel_id uuid,
  p_max_chapter_number int
)
returns int
language plpgsql
security definer
set search_path = leseno, public
as $$
declare
  deleted int;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'service_role required';
  end if;

  with d as (
    delete from leseno.chapters
    where novel_id = p_novel_id
      and chapter_number > p_max_chapter_number
    returning id
  )
  select count(*)::int into deleted from d;

  return coalesce(deleted, 0);
end;
$$;

revoke all on function public.admin_delete_chapters_above(uuid, int) from public;
grant execute on function public.admin_delete_chapters_above(uuid, int) to service_role;

-- PostgREST picks up new RPCs after schema reload.
notify pgrst, 'reload schema';
