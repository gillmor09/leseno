-- Stripe billing: customer/subscription ids on profiles + webhook idempotency.

alter table leseno.user_profiles
  add column if not exists stripe_customer_id text;

alter table leseno.user_profiles
  add column if not exists stripe_subscription_id text;

create unique index if not exists user_profiles_stripe_customer_uidx
  on leseno.user_profiles (stripe_customer_id)
  where stripe_customer_id is not null;

comment on column leseno.user_profiles.stripe_customer_id is
  'Stripe Customer id (cus_…); linked from Checkout / Billing.';
comment on column leseno.user_profiles.stripe_subscription_id is
  'Active Stripe Subscription id (sub_…) when a paid package is booked.';

-- Plus marketing includes 500 credits; keep other packages at 0 unless admin changes.
update leseno.membership_packages
set credits = 500
where id = 'plus' and credits = 0;

create table if not exists leseno.stripe_webhook_events (
  event_id text primary key,
  event_type text not null default '',
  processed_at timestamptz not null default now()
);

comment on table leseno.stripe_webhook_events is
  'Idempotency log for Stripe webhook event ids.';

alter table leseno.stripe_webhook_events enable row level security;

revoke all on table leseno.stripe_webhook_events from anon, authenticated;
grant all on table leseno.stripe_webhook_events to service_role;
