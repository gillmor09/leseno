-- Package feature `mehr_tiefgang`: Nebenthema-Mix + realistische Konflikte (Pro+).

update leseno.membership_packages
set
  features = case
    when features @> '["mehr_tiefgang"]'::jsonb then features
    else features || '["mehr_tiefgang"]'::jsonb
  end,
  updated_at = now()
where id in ('pro', 'ultimate');
