-- Admin list/delete for contact requests (service_role RPCs).

create or replace function public.list_contact_requests_admin(
  p_limit integer default 500
)
returns table (
  id uuid,
  email text,
  message text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public, leseno
as $$
  select
    r.id,
    r.email,
    r.message,
    r.created_at
  from leseno.contact_requests as r
  order by r.created_at desc
  limit least(greatest(coalesce(p_limit, 500), 1), 2000);
$$;

create or replace function public.delete_contact_request_admin(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, leseno
as $$
begin
  if p_id is null then
    raise exception 'id required';
  end if;

  delete from leseno.contact_requests where id = p_id;
  return found;
end;
$$;

revoke all on function public.list_contact_requests_admin(integer) from public;
revoke all on function public.delete_contact_request_admin(uuid) from public;
grant execute on function public.list_contact_requests_admin(integer) to service_role;
grant execute on function public.delete_contact_request_admin(uuid) to service_role;
