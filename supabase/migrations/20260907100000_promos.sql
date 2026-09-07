-- Promo codes: Leseno catalog + Stripe Coupon/Promotion Code ids.
-- Checkout applies Stripe discounts; redemptions are recorded after paid checkout.

create table if not exists leseno.promos (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  label text not null,
  discount_kind text not null,
  percent_off numeric(5, 2),
  amount_off_eur numeric(10, 2),
  duration_kind text not null,
  duration_months integer,
  package_ids jsonb not null default '["plus","pro","ultimate"]'::jsonb,
  active boolean not null default true,
  starts_at timestamptz,
  ends_at timestamptz,
  max_redemptions integer,
  redemption_count integer not null default 0,
  stripe_coupon_id text,
  stripe_promotion_code_id text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint promos_code_unique unique (code),
  constraint promos_discount_kind_chk
    check (discount_kind in ('percent', 'amount', 'free')),
  constraint promos_duration_kind_chk
    check (duration_kind in ('once', 'repeating', 'forever')),
  constraint promos_percent_chk
    check (
      discount_kind <> 'percent'
      or (percent_off is not null and percent_off > 0 and percent_off <= 100)
    ),
  constraint promos_amount_chk
    check (
      discount_kind <> 'amount'
      or (amount_off_eur is not null and amount_off_eur > 0)
    ),
  constraint promos_free_chk
    check (
      discount_kind <> 'free'
      or percent_off is null
    ),
  constraint promos_duration_months_chk
    check (
      (duration_kind = 'repeating' and duration_months is not null and duration_months >= 1)
      or (duration_kind <> 'repeating' and duration_months is null)
    ),
  constraint promos_max_redemptions_chk
    check (max_redemptions is null or max_redemptions >= 1),
  constraint promos_redemption_count_chk
    check (redemption_count >= 0),
  constraint promos_package_ids_array_chk
    check (jsonb_typeof(package_ids) = 'array')
);

comment on table leseno.promos is
  'Admin-managed promo codes synced to Stripe Coupons / Promotion Codes.';

create table if not exists leseno.promo_redemptions (
  id uuid primary key default gen_random_uuid(),
  promo_id uuid not null references leseno.promos (id) on delete cascade,
  user_id uuid not null,
  package_id text not null,
  stripe_checkout_session_id text,
  stripe_subscription_id text,
  redeemed_at timestamptz not null default now(),
  constraint promo_redemptions_user_promo_unique unique (promo_id, user_id),
  constraint promo_redemptions_package_chk
    check (package_id in ('plus', 'pro', 'ultimate'))
);

comment on table leseno.promo_redemptions is
  'One successful membership checkout redemption per user per promo.';

create table if not exists leseno.user_promo_pending (
  user_id uuid primary key,
  promo_code text not null,
  captured_at timestamptz not null default now()
);

comment on table leseno.user_promo_pending is
  'Promo captured at signup / link; applied on next membership Checkout.';

drop trigger if exists promos_set_updated_at on leseno.promos;
create trigger promos_set_updated_at
before update on leseno.promos
for each row
execute function leseno.set_updated_at();

alter table leseno.promos enable row level security;
alter table leseno.promo_redemptions enable row level security;
alter table leseno.user_promo_pending enable row level security;

revoke all on table leseno.promos from anon, authenticated;
revoke all on table leseno.promo_redemptions from anon, authenticated;
revoke all on table leseno.user_promo_pending from anon, authenticated;
grant all on table leseno.promos to service_role;
grant all on table leseno.promo_redemptions to service_role;
grant all on table leseno.user_promo_pending to service_role;

-- ── Admin list ──────────────────────────────────────────────────────────────

create or replace function public.admin_list_promos()
returns table (
  id uuid,
  code text,
  label text,
  discount_kind text,
  percent_off numeric,
  amount_off_eur numeric,
  duration_kind text,
  duration_months integer,
  package_ids jsonb,
  active boolean,
  starts_at timestamptz,
  ends_at timestamptz,
  max_redemptions integer,
  redemption_count integer,
  stripe_coupon_id text,
  stripe_promotion_code_id text,
  notes text,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = leseno, public
as $$
  select
    p.id,
    p.code,
    p.label,
    p.discount_kind,
    p.percent_off,
    p.amount_off_eur,
    p.duration_kind,
    p.duration_months,
    p.package_ids,
    p.active,
    p.starts_at,
    p.ends_at,
    p.max_redemptions,
    p.redemption_count,
    p.stripe_coupon_id,
    p.stripe_promotion_code_id,
    p.notes,
    p.created_at,
    p.updated_at
  from leseno.promos p
  order by p.created_at desc;
$$;

revoke all on function public.admin_list_promos() from public;
grant execute on function public.admin_list_promos() to service_role;

-- ── Admin insert (Stripe ids filled by app after API create) ──────────────

create or replace function public.admin_insert_promo(
  p_code text,
  p_label text,
  p_discount_kind text,
  p_percent_off numeric,
  p_amount_off_eur numeric,
  p_duration_kind text,
  p_duration_months integer,
  p_package_ids jsonb,
  p_active boolean,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_max_redemptions integer,
  p_stripe_coupon_id text,
  p_stripe_promotion_code_id text,
  p_notes text
)
returns uuid
language plpgsql
security definer
set search_path = leseno, public
as $$
declare
  v_id uuid;
  v_code text := lower(trim(p_code));
begin
  if v_code is null or v_code = '' or char_length(v_code) > 64 then
    raise exception 'Invalid promo code.';
  end if;
  if p_label is null or trim(p_label) = '' then
    raise exception 'Label required.';
  end if;

  insert into leseno.promos (
    code,
    label,
    discount_kind,
    percent_off,
    amount_off_eur,
    duration_kind,
    duration_months,
    package_ids,
    active,
    starts_at,
    ends_at,
    max_redemptions,
    stripe_coupon_id,
    stripe_promotion_code_id,
    notes
  ) values (
    v_code,
    trim(p_label),
    p_discount_kind,
    case when p_discount_kind = 'percent' then p_percent_off
         else null end,
    case when p_discount_kind = 'amount' then p_amount_off_eur else null end,
    p_duration_kind,
    case when p_duration_kind = 'repeating' then p_duration_months else null end,
    coalesce(p_package_ids, '["plus","pro","ultimate"]'::jsonb),
    coalesce(p_active, true),
    p_starts_at,
    p_ends_at,
    p_max_redemptions,
    nullif(trim(p_stripe_coupon_id), ''),
    nullif(trim(p_stripe_promotion_code_id), ''),
    nullif(trim(p_notes), '')
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.admin_insert_promo(
  text, text, text, numeric, numeric, text, integer, jsonb, boolean,
  timestamptz, timestamptz, integer, text, text, text
) from public;
grant execute on function public.admin_insert_promo(
  text, text, text, numeric, numeric, text, integer, jsonb, boolean,
  timestamptz, timestamptz, integer, text, text, text
) to service_role;

-- ── Admin update (mutable ops fields; discount math stays as created) ─────

create or replace function public.admin_update_promo(
  p_id uuid,
  p_label text,
  p_package_ids jsonb,
  p_active boolean,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_max_redemptions integer,
  p_notes text,
  p_stripe_coupon_id text default null,
  p_stripe_promotion_code_id text default null
)
returns void
language plpgsql
security definer
set search_path = leseno, public
as $$
begin
  update leseno.promos
  set
    label = trim(p_label),
    package_ids = coalesce(p_package_ids, package_ids),
    active = coalesce(p_active, active),
    starts_at = p_starts_at,
    ends_at = p_ends_at,
    max_redemptions = p_max_redemptions,
    notes = nullif(trim(p_notes), ''),
    stripe_coupon_id = coalesce(
      nullif(trim(p_stripe_coupon_id), ''),
      stripe_coupon_id
    ),
    stripe_promotion_code_id = coalesce(
      nullif(trim(p_stripe_promotion_code_id), ''),
      stripe_promotion_code_id
    )
  where id = p_id;

  if not found then
    raise exception 'Promo not found.';
  end if;
end;
$$;

revoke all on function public.admin_update_promo(
  uuid, text, jsonb, boolean, timestamptz, timestamptz, integer, text, text, text
) from public;
grant execute on function public.admin_update_promo(
  uuid, text, jsonb, boolean, timestamptz, timestamptz, integer, text, text, text
) to service_role;

create or replace function public.admin_delete_promo(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = leseno, public
as $$
declare
  v_deleted boolean := false;
begin
  delete from leseno.promos where id = p_id returning true into v_deleted;
  return coalesce(v_deleted, false);
end;
$$;

revoke all on function public.admin_delete_promo(uuid) from public;
grant execute on function public.admin_delete_promo(uuid) to service_role;

-- ── Lookup by code (checkout / pending) ───────────────────────────────────

create or replace function public.get_promo_by_code(p_code text)
returns table (
  id uuid,
  code text,
  label text,
  discount_kind text,
  percent_off numeric,
  amount_off_eur numeric,
  duration_kind text,
  duration_months integer,
  package_ids jsonb,
  active boolean,
  starts_at timestamptz,
  ends_at timestamptz,
  max_redemptions integer,
  redemption_count integer,
  stripe_coupon_id text,
  stripe_promotion_code_id text,
  notes text,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = leseno, public
as $$
  select
    p.id,
    p.code,
    p.label,
    p.discount_kind,
    p.percent_off,
    p.amount_off_eur,
    p.duration_kind,
    p.duration_months,
    p.package_ids,
    p.active,
    p.starts_at,
    p.ends_at,
    p.max_redemptions,
    p.redemption_count,
    p.stripe_coupon_id,
    p.stripe_promotion_code_id,
    p.notes,
    p.created_at,
    p.updated_at
  from leseno.promos p
  where p.code = lower(trim(p_code))
  limit 1;
$$;

revoke all on function public.get_promo_by_code(text) from public;
grant execute on function public.get_promo_by_code(text) to service_role;

-- ── Pending promo on user ─────────────────────────────────────────────────

create or replace function public.set_user_promo_pending(
  p_user_id uuid,
  p_promo_code text
)
returns void
language plpgsql
security definer
set search_path = leseno, public
as $$
declare
  v_code text := lower(trim(p_promo_code));
begin
  if p_user_id is null then
    raise exception 'user_id required.';
  end if;
  if v_code is null or v_code = '' then
    raise exception 'promo code required.';
  end if;

  insert into leseno.user_promo_pending (user_id, promo_code, captured_at)
  values (p_user_id, v_code, now())
  on conflict (user_id) do update
  set promo_code = excluded.promo_code,
      captured_at = now();
end;
$$;

revoke all on function public.set_user_promo_pending(uuid, text) from public;
grant execute on function public.set_user_promo_pending(uuid, text) to service_role;

create or replace function public.get_user_promo_pending(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = leseno, public
as $$
  select promo_code
  from leseno.user_promo_pending
  where user_id = p_user_id;
$$;

revoke all on function public.get_user_promo_pending(uuid) from public;
grant execute on function public.get_user_promo_pending(uuid) to service_role;

create or replace function public.clear_user_promo_pending(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = leseno, public
as $$
begin
  delete from leseno.user_promo_pending where user_id = p_user_id;
end;
$$;

revoke all on function public.clear_user_promo_pending(uuid) from public;
grant execute on function public.clear_user_promo_pending(uuid) to service_role;

-- ── Record redemption (idempotent per user+promo) ─────────────────────────

create or replace function public.record_promo_redemption(
  p_promo_id uuid,
  p_user_id uuid,
  p_package_id text,
  p_stripe_checkout_session_id text,
  p_stripe_subscription_id text
)
returns boolean
language plpgsql
security definer
set search_path = leseno, public
as $$
declare
  v_id uuid;
begin
  insert into leseno.promo_redemptions (
    promo_id,
    user_id,
    package_id,
    stripe_checkout_session_id,
    stripe_subscription_id
  ) values (
    p_promo_id,
    p_user_id,
    p_package_id,
    nullif(trim(p_stripe_checkout_session_id), ''),
    nullif(trim(p_stripe_subscription_id), '')
  )
  on conflict (promo_id, user_id) do nothing
  returning id into v_id;

  if v_id is not null then
    update leseno.promos
    set redemption_count = redemption_count + 1
    where id = p_promo_id;
  end if;

  delete from leseno.user_promo_pending where user_id = p_user_id;

  return v_id is not null;
end;
$$;

revoke all on function public.record_promo_redemption(
  uuid, uuid, text, text, text
) from public;
grant execute on function public.record_promo_redemption(
  uuid, uuid, text, text, text
) to service_role;
