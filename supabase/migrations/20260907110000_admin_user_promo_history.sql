-- List promo redemptions for a user (admin billing history).

create or replace function public.admin_list_promo_redemptions_for_user(
  p_user_id uuid
)
returns table (
  id uuid,
  promo_id uuid,
  promo_code text,
  promo_label text,
  package_id text,
  stripe_checkout_session_id text,
  stripe_subscription_id text,
  redeemed_at timestamptz
)
language sql
stable
security definer
set search_path = leseno, public
as $$
  select
    r.id,
    r.promo_id,
    p.code as promo_code,
    p.label as promo_label,
    r.package_id,
    r.stripe_checkout_session_id,
    r.stripe_subscription_id,
    r.redeemed_at
  from leseno.promo_redemptions r
  join leseno.promos p on p.id = r.promo_id
  where r.user_id = p_user_id
  order by r.redeemed_at desc;
$$;

revoke all on function public.admin_list_promo_redemptions_for_user(uuid) from public;
grant execute on function public.admin_list_promo_redemptions_for_user(uuid) to service_role;
