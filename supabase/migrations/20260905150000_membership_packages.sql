-- Membership packages catalog (Bezeichnung, Preis, Credits, feature flags).
-- Marketing/admin source of truth; booking history still stores package_id + prices at booking time.

create table if not exists leseno.membership_packages (
  id text primary key,
  label text not null,
  price_eur numeric(10, 2) not null,
  credits integer not null default 0,
  features jsonb not null default '[]'::jsonb,
  sort_order smallint not null default 0,
  updated_at timestamptz not null default now(),
  constraint membership_packages_price_nonneg check (price_eur >= 0),
  constraint membership_packages_credits_nonneg check (credits >= 0),
  constraint membership_packages_features_is_array
    check (jsonb_typeof(features) = 'array'),
  constraint membership_packages_id_chk
    check (id in ('basis', 'plus', 'pro', 'ultimate'))
);

comment on table leseno.membership_packages is
  'Subscription packages: label, monthly price, included credits, enabled feature ids.';

drop trigger if exists membership_packages_set_updated_at on leseno.membership_packages;
create trigger membership_packages_set_updated_at
before update on leseno.membership_packages
for each row
execute function leseno.set_updated_at();

alter table leseno.membership_packages enable row level security;

revoke all on table leseno.membership_packages from anon, authenticated;
grant select on table leseno.membership_packages to service_role;
grant all on table leseno.membership_packages to service_role;

-- Seed aligned with /preise marketing (features are catalog ids).
insert into leseno.membership_packages (
  id, label, price_eur, credits, features, sort_order
) values
  (
    'basis',
    'Basis',
    0,
    0,
    '[]'::jsonb,
    0
  ),
  (
    'plus',
    'Plus',
    5,
    0,
    '["export","meine_welt"]'::jsonb,
    1
  ),
  (
    'pro',
    'Pro',
    10,
    0,
    '["meine_welt","meine_welt_familie","bilder","warum"]'::jsonb,
    2
  ),
  (
    'ultimate',
    'Ultimate',
    15,
    0,
    '["meine_welt","meine_welt_familie","bilder","warum","export","silbenmethode","markierung","vorlesen","hintergrund"]'::jsonb,
    3
  )
on conflict (id) do update
set label = excluded.label,
    price_eur = excluded.price_eur,
    credits = excluded.credits,
    features = excluded.features,
    sort_order = excluded.sort_order;

-- Public list for marketing / app; updates only via service_role.
create or replace function public.list_membership_packages()
returns table (
  id text,
  label text,
  price_eur numeric,
  credits integer,
  features jsonb,
  sort_order smallint,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = leseno, public
as $$
  select
    p.id,
    p.label,
    p.price_eur,
    p.credits,
    p.features,
    p.sort_order,
    p.updated_at
  from leseno.membership_packages p
  order by p.sort_order asc, p.label asc;
$$;

create or replace function public.update_membership_package(
  p_id text,
  p_label text,
  p_price_eur numeric,
  p_credits integer,
  p_features jsonb,
  p_sort_order smallint default null
)
returns void
language plpgsql
security definer
set search_path = leseno, public
as $$
begin
  if p_id is null or char_length(trim(p_id)) = 0 then
    raise exception 'package id required';
  end if;
  if p_label is null or char_length(trim(p_label)) = 0 then
    raise exception 'package label required';
  end if;
  if p_price_eur is null or p_price_eur < 0 then
    raise exception 'price must be >= 0';
  end if;
  if p_credits is null or p_credits < 0 then
    raise exception 'credits must be >= 0';
  end if;
  if p_features is null or jsonb_typeof(p_features) <> 'array' then
    raise exception 'features must be a json array';
  end if;

  update leseno.membership_packages
  set
    label = trim(p_label),
    price_eur = p_price_eur,
    credits = p_credits,
    features = p_features,
    sort_order = coalesce(p_sort_order, sort_order)
  where id = p_id;

  if not found then
    raise exception 'unknown package id: %', p_id;
  end if;
end;
$$;

revoke all on function public.list_membership_packages() from public;
grant execute on function public.list_membership_packages() to anon, authenticated, service_role;

revoke all on function public.update_membership_package(
  text, text, numeric, integer, jsonb, smallint
) from public;
grant execute on function public.update_membership_package(
  text, text, numeric, integer, jsonb, smallint
) to service_role;
