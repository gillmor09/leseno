-- Package feature `buchclub` (Mein Buchclub) from Plus upward
-- (needs Bücherei to share stories — not on Basis).

update leseno.membership_packages
set
  features = case
    when features @> '["buchclub"]'::jsonb then features
    else features || '["buchclub"]'::jsonb
  end,
  updated_at = now()
where id in ('plus', 'pro', 'ultimate');

-- If an earlier draft seeded Basis with buchclub, strip it.
update leseno.membership_packages
set
  features = features - 'buchclub',
  updated_at = now()
where id = 'basis'
  and features @> '["buchclub"]'::jsonb;
