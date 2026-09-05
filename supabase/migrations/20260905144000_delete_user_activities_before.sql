-- Delete activities strictly older than a cutoff (admin / service_role).

create or replace function public.delete_user_activities_before_admin(
  p_before timestamptz
)
returns integer
language plpgsql
security definer
set search_path = public, leseno
as $$
declare
  v_deleted integer;
begin
  if p_before is null then
    raise exception 'Datum fehlt.';
  end if;

  delete from leseno.user_activities
  where created_at < p_before;

  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function public.delete_user_activities_before_admin(timestamptz) from public;
grant execute on function public.delete_user_activities_before_admin(timestamptz) to service_role;
