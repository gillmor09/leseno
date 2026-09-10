-- Rename display labels: Pro → Familie, Ultimate → Komplett (ids stay pro/ultimate).

update leseno.membership_packages
set label = 'Familie', updated_at = now()
where id = 'pro';

update leseno.membership_packages
set label = 'Komplett', updated_at = now()
where id = 'ultimate';
