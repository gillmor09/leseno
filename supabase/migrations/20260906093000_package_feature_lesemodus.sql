-- Add package feature `lesemodus` (fullscreen reading + typography) from Basis up.

update leseno.membership_packages
set
  features = case
    when features @> '["lesemodus"]'::jsonb then features
    else features || '["lesemodus"]'::jsonb
  end,
  updated_at = now()
where id in ('basis', 'plus', 'pro', 'ultimate');
