-- Add package feature `buecherei` (Meine Bücherei / story library) to Plus+.

update leseno.membership_packages
set
  features = case
    when features @> '["buecherei"]'::jsonb then features
    else features || '["buecherei"]'::jsonb
  end,
  updated_at = now()
where id in ('plus', 'pro', 'ultimate');
