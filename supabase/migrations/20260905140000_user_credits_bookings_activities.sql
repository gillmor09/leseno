-- User credits, package booking history, and activity log.
-- Credits live on user_profiles; bookings + activities are append-friendly history tables.

alter table leseno.user_profiles
  add column if not exists credits integer not null default 0;

alter table leseno.user_profiles
  drop constraint if exists user_profiles_credits_nonneg;

alter table leseno.user_profiles
  add constraint user_profiles_credits_nonneg check (credits >= 0);

comment on column leseno.user_profiles.credits is
  'Spendable story credits balance (top-ups / flexible packs).';

-- ---------------------------------------------------------------------------
-- Package booking history (Plus / Pro / Ultimate / Basis)
-- monthly_price = list price at booking time; actual_price = what was charged
-- (same as monthly_price until discounts exist). ended_at null = still active.
-- ---------------------------------------------------------------------------

create table if not exists leseno.user_package_bookings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  package_id text not null,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  monthly_price numeric(10, 2) not null,
  actual_price numeric(10, 2) not null,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_package_bookings_package_chk
    check (package_id in ('basis', 'plus', 'pro', 'ultimate')),
  constraint user_package_bookings_prices_nonneg
    check (monthly_price >= 0 and actual_price >= 0),
  constraint user_package_bookings_ended_after_start
    check (ended_at is null or ended_at >= started_at)
);

create index if not exists user_package_bookings_user_started_idx
  on leseno.user_package_bookings (user_id, started_at desc);

create index if not exists user_package_bookings_user_active_idx
  on leseno.user_package_bookings (user_id)
  where ended_at is null;

drop trigger if exists user_package_bookings_set_updated_at on leseno.user_package_bookings;
create trigger user_package_bookings_set_updated_at
before update on leseno.user_package_bookings
for each row
execute function leseno.set_updated_at();

alter table leseno.user_package_bookings enable row level security;

drop policy if exists user_package_bookings_select_self on leseno.user_package_bookings;
create policy user_package_bookings_select_self
on leseno.user_package_bookings for select
to authenticated
using (auth.uid() = user_id);

revoke all on table leseno.user_package_bookings from anon, authenticated;
grant select on table leseno.user_package_bookings to authenticated;
grant all on table leseno.user_package_bookings to service_role;

-- ---------------------------------------------------------------------------
-- User activity log (auth, story generate, UI events, …)
-- ---------------------------------------------------------------------------

create table if not exists leseno.user_activities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  action text not null,
  label text not null default '',
  path text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint user_activities_action_nonempty check (char_length(trim(action)) > 0),
  constraint user_activities_metadata_is_object check (jsonb_typeof(metadata) = 'object')
);

create index if not exists user_activities_user_created_idx
  on leseno.user_activities (user_id, created_at desc);

create index if not exists user_activities_action_created_idx
  on leseno.user_activities (action, created_at desc);

create index if not exists user_activities_created_idx
  on leseno.user_activities (created_at desc);

alter table leseno.user_activities enable row level security;

drop policy if exists user_activities_select_self on leseno.user_activities;
create policy user_activities_select_self
on leseno.user_activities for select
to authenticated
using (auth.uid() = user_id);

revoke all on table leseno.user_activities from anon, authenticated;
grant select on table leseno.user_activities to authenticated;
grant all on table leseno.user_activities to service_role;

/**
 * Authenticated client may append own activity rows (no update/delete).
 */
create or replace function public.log_my_activity(
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
  v_uid uuid := auth.uid();
  v_id uuid;
  v_action text := nullif(trim(p_action), '');
  v_meta jsonb := coalesce(p_metadata, '{}'::jsonb);
begin
  if v_uid is null then
    raise exception 'Nicht angemeldet.';
  end if;
  if v_action is null then
    raise exception 'action fehlt.';
  end if;
  if jsonb_typeof(v_meta) <> 'object' then
    v_meta := '{}'::jsonb;
  end if;

  insert into leseno.user_activities (user_id, action, label, path, metadata)
  values (
    v_uid,
    v_action,
    coalesce(nullif(trim(p_label), ''), ''),
    coalesce(nullif(trim(p_path), ''), ''),
    v_meta
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.log_my_activity(text, text, text, jsonb) from public;
grant execute on function public.log_my_activity(text, text, text, jsonb) to authenticated;
grant execute on function public.log_my_activity(text, text, text, jsonb) to service_role;

/**
 * Read own credits balance.
 */
create or replace function public.get_my_credits()
returns integer
language plpgsql
security definer
set search_path = public, leseno
as $$
declare
  v_uid uuid := auth.uid();
  v_credits integer;
begin
  if v_uid is null then
    raise exception 'Nicht angemeldet.';
  end if;

  select credits into v_credits
  from leseno.user_profiles
  where user_id = v_uid;

  return coalesce(v_credits, 0);
end;
$$;

revoke all on function public.get_my_credits() from public;
grant execute on function public.get_my_credits() to authenticated;
grant execute on function public.get_my_credits() to service_role;

/**
 * List own package booking history (newest first).
 */
create or replace function public.list_my_package_bookings()
returns table (
  id uuid,
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
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Nicht angemeldet.';
  end if;

  return query
  select
    b.id,
    b.package_id,
    b.started_at,
    b.ended_at,
    b.monthly_price,
    b.actual_price,
    b.notes,
    b.created_at
  from leseno.user_package_bookings as b
  where b.user_id = v_uid
  order by b.started_at desc, b.created_at desc;
end;
$$;

revoke all on function public.list_my_package_bookings() from public;
grant execute on function public.list_my_package_bookings() to authenticated;
grant execute on function public.list_my_package_bookings() to service_role;
