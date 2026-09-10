-- Plus membership display price: 4 € / month.

update leseno.membership_packages
set price_eur = 4, updated_at = now()
where id = 'plus';
