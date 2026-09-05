-- Admin list for user activities via public RPC (PostgREST does not expose leseno).

create or replace function public.list_user_activities_admin(
  p_limit integer default 1000
)
returns table (
  id uuid,
  user_id uuid,
  email text,
  action text,
  label text,
  path text,
  metadata jsonb,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public, leseno
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 1000), 1), 5000);
begin
  return query
  select
    a.id,
    a.user_id,
    p.email,
    a.action,
    a.label,
    a.path,
    a.metadata,
    a.created_at
  from leseno.user_activities as a
  left join leseno.user_profiles as p on p.user_id = a.user_id
  order by a.created_at desc
  limit v_limit;
end;
$$;

revoke all on function public.list_user_activities_admin(integer) from public;
grant execute on function public.list_user_activities_admin(integer) to service_role;

/**
 * Service-role insert when leseno schema is not exposed on PostgREST.
 */
create or replace function public.insert_user_activity_admin(
  p_user_id uuid,
  p_action text,
  p_label text default '',
  p_path text default '',
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, leseno
as $$
declare
  v_id uuid;
  v_action text := nullif(trim(p_action), '');
  v_meta jsonb := coalesce(p_metadata, '{}'::jsonb);
begin
  if v_action is null then
    raise exception 'action fehlt.';
  end if;
  if jsonb_typeof(v_meta) <> 'object' then
    v_meta := '{}'::jsonb;
  end if;

  insert into leseno.user_activities (user_id, action, label, path, metadata)
  values (
    p_user_id,
    v_action,
    coalesce(nullif(trim(p_label), ''), ''),
    coalesce(nullif(trim(p_path), ''), ''),
    v_meta
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.insert_user_activity_admin(uuid, text, text, text, jsonb) from public;
grant execute on function public.insert_user_activity_admin(uuid, text, text, text, jsonb) to service_role;
