-- Stripe billing via public RPCs (PostgREST does not expose schema `leseno`).

create or replace function public.admin_get_user_stripe_ids(p_user_id uuid)
returns table (
  stripe_customer_id text,
  stripe_subscription_id text
)
language sql
stable
security definer
set search_path = public, leseno
as $$
  select p.stripe_customer_id, p.stripe_subscription_id
  from leseno.user_profiles as p
  where p.user_id = p_user_id;
$$;

create or replace function public.admin_set_user_stripe_customer(
  p_user_id uuid,
  p_customer_id text
)
returns void
language plpgsql
security definer
set search_path = public, leseno
as $$
begin
  if p_user_id is null then
    raise exception 'user_id required';
  end if;
  if p_customer_id is null or char_length(trim(p_customer_id)) = 0 then
    raise exception 'customer_id required';
  end if;

  update leseno.user_profiles
  set stripe_customer_id = trim(p_customer_id)
  where user_id = p_user_id;

  if not found then
    raise exception 'user_profiles row missing for %', p_user_id;
  end if;
end;
$$;

create or replace function public.admin_set_user_stripe_subscription(
  p_user_id uuid,
  p_subscription_id text
)
returns void
language plpgsql
security definer
set search_path = public, leseno
as $$
begin
  if p_user_id is null then
    raise exception 'user_id required';
  end if;

  update leseno.user_profiles
  set stripe_subscription_id = nullif(trim(p_subscription_id), '')
  where user_id = p_user_id;

  if not found then
    raise exception 'user_profiles row missing for %', p_user_id;
  end if;
end;
$$;

create or replace function public.admin_find_user_by_stripe_customer(
  p_customer_id text
)
returns uuid
language sql
stable
security definer
set search_path = public, leseno
as $$
  select p.user_id
  from leseno.user_profiles as p
  where p.stripe_customer_id = p_customer_id
  limit 1;
$$;

create or replace function public.admin_set_user_profile_role(
  p_user_id uuid,
  p_role text
)
returns void
language plpgsql
security definer
set search_path = public, leseno
as $$
begin
  if p_role is null or p_role not in ('admin', 'basis', 'paket1', 'paket2', 'paket3') then
    raise exception 'invalid role';
  end if;

  update leseno.user_profiles
  set role = p_role
  where user_id = p_user_id;
end;
$$;

create or replace function public.admin_add_user_credits(
  p_user_id uuid,
  p_amount integer
)
returns integer
language plpgsql
security definer
set search_path = public, leseno
as $$
declare
  v_next integer;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'credits amount must be > 0';
  end if;

  update leseno.user_profiles
  set credits = credits + p_amount
  where user_id = p_user_id
  returning credits into v_next;

  if not found then
    raise exception 'user_profiles row missing for %', p_user_id;
  end if;

  return v_next;
end;
$$;

create or replace function public.admin_get_user_credits(p_user_id uuid)
returns integer
language sql
stable
security definer
set search_path = public, leseno
as $$
  select coalesce(
    (select p.credits from leseno.user_profiles as p where p.user_id = p_user_id),
    0
  );
$$;

create or replace function public.admin_list_user_credits(p_user_ids uuid[])
returns table (
  user_id uuid,
  credits integer
)
language sql
stable
security definer
set search_path = public, leseno
as $$
  select p.user_id, p.credits
  from leseno.user_profiles as p
  where p.user_id = any (p_user_ids);
$$;

create or replace function public.admin_claim_stripe_webhook_event(
  p_event_id text,
  p_event_type text default ''
)
returns boolean
language plpgsql
security definer
set search_path = public, leseno
as $$
begin
  insert into leseno.stripe_webhook_events (event_id, event_type)
  values (p_event_id, coalesce(p_event_type, ''));
  return true;
exception
  when unique_violation then
    return false;
end;
$$;

create or replace function public.admin_delete_stripe_webhook_event(p_event_id text)
returns void
language plpgsql
security definer
set search_path = public, leseno
as $$
begin
  delete from leseno.stripe_webhook_events where event_id = p_event_id;
end;
$$;

create or replace function public.admin_list_package_bookings(p_user_id uuid)
returns table (
  id uuid,
  user_id uuid,
  package_id text,
  started_at timestamptz,
  ended_at timestamptz,
  monthly_price numeric,
  actual_price numeric,
  notes text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public, leseno
as $$
  select
    b.id,
    b.user_id,
    b.package_id,
    b.started_at,
    b.ended_at,
    b.monthly_price,
    b.actual_price,
    b.notes,
    b.created_at
  from leseno.user_package_bookings as b
  where b.user_id = p_user_id
  order by b.started_at desc, b.created_at desc;
$$;

create or replace function public.admin_end_active_package_bookings(
  p_user_id uuid,
  p_ended_at timestamptz default now()
)
returns void
language plpgsql
security definer
set search_path = public, leseno
as $$
begin
  update leseno.user_package_bookings
  set ended_at = p_ended_at
  where user_id = p_user_id
    and ended_at is null;
end;
$$;

create or replace function public.admin_start_package_booking(
  p_user_id uuid,
  p_package_id text,
  p_monthly_price numeric,
  p_actual_price numeric,
  p_notes text default '',
  p_started_at timestamptz default now()
)
returns table (
  id uuid,
  user_id uuid,
  package_id text,
  started_at timestamptz,
  ended_at timestamptz,
  monthly_price numeric,
  actual_price numeric,
  notes text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public, leseno
as $$
begin
  if p_package_id is null
     or p_package_id not in ('basis', 'plus', 'pro', 'ultimate') then
    raise exception 'invalid package_id';
  end if;

  update leseno.user_package_bookings
  set ended_at = p_started_at
  where user_package_bookings.user_id = p_user_id
    and user_package_bookings.ended_at is null;

  return query
  with inserted as (
    insert into leseno.user_package_bookings (
      user_id,
      package_id,
      started_at,
      ended_at,
      monthly_price,
      actual_price,
      notes
    )
    values (
      p_user_id,
      p_package_id,
      p_started_at,
      null,
      p_monthly_price,
      p_actual_price,
      coalesce(p_notes, '')
    )
    returning
      user_package_bookings.id,
      user_package_bookings.user_id,
      user_package_bookings.package_id,
      user_package_bookings.started_at,
      user_package_bookings.ended_at,
      user_package_bookings.monthly_price,
      user_package_bookings.actual_price,
      user_package_bookings.notes,
      user_package_bookings.created_at
  )
  select
    inserted.id,
    inserted.user_id,
    inserted.package_id,
    inserted.started_at,
    inserted.ended_at,
    inserted.monthly_price,
    inserted.actual_price,
    inserted.notes,
    inserted.created_at
  from inserted;
end;
$$;

revoke all on function public.admin_get_user_stripe_ids(uuid) from public;
revoke all on function public.admin_set_user_stripe_customer(uuid, text) from public;
revoke all on function public.admin_set_user_stripe_subscription(uuid, text) from public;
revoke all on function public.admin_find_user_by_stripe_customer(text) from public;
revoke all on function public.admin_set_user_profile_role(uuid, text) from public;
revoke all on function public.admin_add_user_credits(uuid, integer) from public;
revoke all on function public.admin_get_user_credits(uuid) from public;
revoke all on function public.admin_list_user_credits(uuid[]) from public;
revoke all on function public.admin_claim_stripe_webhook_event(text, text) from public;
revoke all on function public.admin_delete_stripe_webhook_event(text) from public;
revoke all on function public.admin_list_package_bookings(uuid) from public;
revoke all on function public.admin_end_active_package_bookings(uuid, timestamptz) from public;
revoke all on function public.admin_start_package_booking(uuid, text, numeric, numeric, text, timestamptz) from public;

grant execute on function public.admin_get_user_stripe_ids(uuid) to service_role;
grant execute on function public.admin_set_user_stripe_customer(uuid, text) to service_role;
grant execute on function public.admin_set_user_stripe_subscription(uuid, text) to service_role;
grant execute on function public.admin_find_user_by_stripe_customer(text) to service_role;
grant execute on function public.admin_set_user_profile_role(uuid, text) to service_role;
grant execute on function public.admin_add_user_credits(uuid, integer) to service_role;
grant execute on function public.admin_get_user_credits(uuid) to service_role;
grant execute on function public.admin_list_user_credits(uuid[]) to service_role;
grant execute on function public.admin_claim_stripe_webhook_event(text, text) to service_role;
grant execute on function public.admin_delete_stripe_webhook_event(text) to service_role;
grant execute on function public.admin_list_package_bookings(uuid) to service_role;
grant execute on function public.admin_end_active_package_bookings(uuid, timestamptz) to service_role;
grant execute on function public.admin_start_package_booking(uuid, text, numeric, numeric, text, timestamptz) to service_role;
