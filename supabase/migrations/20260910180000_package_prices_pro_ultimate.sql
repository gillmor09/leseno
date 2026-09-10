-- Align membership display prices with Stripe: Pro 9 €, Ultimate 14 €.

update leseno.membership_packages
set price_eur = 9, updated_at = now()
where id = 'pro';

update leseno.membership_packages
set price_eur = 14, updated_at = now()
where id = 'ultimate';
