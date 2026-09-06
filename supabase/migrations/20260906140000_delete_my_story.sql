-- Delete owned library stories via security-definer RPC.

create or replace function public.delete_my_story(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, leseno
as $$
declare
  uid uuid := auth.uid();
  v_ok boolean := false;
begin
  if uid is null then
    raise exception 'Nicht angemeldet.';
  end if;

  if p_id is null then
    raise exception 'Geschichte fehlt.';
  end if;

  -- Child continuations keep their rows; parent_story_id becomes null (FK on delete set null).
  delete from leseno.user_stories
  where id = p_id
    and user_id = uid
  returning true into v_ok;

  if not coalesce(v_ok, false) then
    raise exception 'Geschichte nicht gefunden.';
  end if;

  return true;
end;
$$;

comment on function public.delete_my_story(uuid) is
  'Deletes one owned library story. Linked continuations stay; their parent_story_id is cleared.';

revoke all on function public.delete_my_story(uuid) from public;
grant execute on function public.delete_my_story(uuid)
  to authenticated, service_role;
