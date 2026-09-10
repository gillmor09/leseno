-- Delete a social media post by id (admin Social workspace).

create or replace function public.admin_delete_social_post(p_id uuid)
returns void
language plpgsql
security definer
set search_path = leseno, public
as $$
begin
  if p_id is null then
    raise exception 'Beitrag fehlt.';
  end if;

  delete from leseno.social_media_posts
  where id = p_id;

  if not found then
    raise exception 'Beitrag nicht gefunden.';
  end if;
end;
$$;

comment on function public.admin_delete_social_post(uuid) is
  'Deletes one social_media_posts row (admin Social Media).';

revoke all on function public.admin_delete_social_post(uuid) from public;
grant execute on function public.admin_delete_social_post(uuid) to service_role;
