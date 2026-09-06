-- Monthly package credit grants (anniversary billing via Stripe invoices).
-- Idempotent ledger: each paid subscription invoice grants at most once.
-- Credits never expire; balance is only decremented by spend RPCs.

create table if not exists leseno.credit_grants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  amount integer not null check (amount > 0),
  reason text not null,
  stripe_invoice_id text,
  stripe_checkout_session_id text,
  package_id text,
  period_start timestamptz,
  period_end timestamptz,
  notes text not null default '',
  created_at timestamptz not null default now(),
  constraint credit_grants_reason_chk check (
    reason in (
      'subscription_period',
      'credits_pack',
      'basis_signup',
      'admin',
      'refund_restore'
    )
  )
);

create unique index if not exists credit_grants_stripe_invoice_uidx
  on leseno.credit_grants (stripe_invoice_id)
  where stripe_invoice_id is not null;

create unique index if not exists credit_grants_checkout_session_uidx
  on leseno.credit_grants (stripe_checkout_session_id)
  where stripe_checkout_session_id is not null;

create index if not exists credit_grants_user_created_idx
  on leseno.credit_grants (user_id, created_at desc);

comment on table leseno.credit_grants is
  'Idempotent credit grant ledger. Subscription months keyed by Stripe invoice id; unused credits carry forever.';

alter table leseno.credit_grants enable row level security;

revoke all on table leseno.credit_grants from anon, authenticated;
grant all on table leseno.credit_grants to service_role;

/**
 * Inserts a grant row and adds credits atomically.
 * Returns new balance when the grant is new; null when duplicate (already granted).
 */
create or replace function public.admin_grant_credits_once(
  p_user_id uuid,
  p_amount integer,
  p_reason text,
  p_stripe_invoice_id text default null,
  p_stripe_checkout_session_id text default null,
  p_package_id text default null,
  p_period_start timestamptz default null,
  p_period_end timestamptz default null,
  p_notes text default ''
)
returns integer
language plpgsql
security definer
set search_path = public, leseno
as $$
declare
  v_next integer;
begin
  if p_user_id is null then
    raise exception 'user_id required';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'credits amount must be > 0';
  end if;
  if p_reason is null or p_reason not in (
    'subscription_period',
    'credits_pack',
    'basis_signup',
    'admin',
    'refund_restore'
  ) then
    raise exception 'invalid grant reason';
  end if;

  begin
    insert into leseno.credit_grants (
      user_id,
      amount,
      reason,
      stripe_invoice_id,
      stripe_checkout_session_id,
      package_id,
      period_start,
      period_end,
      notes
    )
    values (
      p_user_id,
      p_amount,
      p_reason,
      nullif(trim(coalesce(p_stripe_invoice_id, '')), ''),
      nullif(trim(coalesce(p_stripe_checkout_session_id, '')), ''),
      nullif(trim(coalesce(p_package_id, '')), ''),
      p_period_start,
      p_period_end,
      coalesce(p_notes, '')
    );
  exception
    when unique_violation then
      return null;
  end;

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

revoke all on function public.admin_grant_credits_once(
  uuid, integer, text, text, text, text, timestamptz, timestamptz, text
) from public;
grant execute on function public.admin_grant_credits_once(
  uuid, integer, text, text, text, text, timestamptz, timestamptz, text
) to service_role;
