-- Fix set_my_story_book_club_share: shared_to_book_club was dropped but RPC still wrote it.

create or replace function public.set_my_story_book_club_share(
  p_id uuid,
  p_share text
)
returns void
language plpgsql
security definer
set search_path = public, leseno
as $$
declare
  uid uuid := auth.uid();
  v_share text := lower(trim(coalesce(p_share, 'none')));
begin
  if uid is null then
    raise exception 'Nicht angemeldet.';
  end if;

  if v_share not in ('none', 'friends', 'public') then
    raise exception 'Ungültige Freigabe.';
  end if;

  update leseno.user_stories
  set book_club_share = v_share
  where id = p_id
    and user_id = uid;

  if not found then
    raise exception 'Geschichte nicht gefunden.';
  end if;
end;
$$;

revoke all on function public.set_my_story_book_club_share(uuid, text) from public;
grant execute on function public.set_my_story_book_club_share(uuid, text)
  to authenticated, service_role;
