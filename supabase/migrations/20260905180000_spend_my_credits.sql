-- Atomic debit of own credits (story generation). Returns the new balance.

create or replace function public.spend_my_credits(p_amount integer)
returns integer
language plpgsql
security definer
set search_path = public, leseno
as $$
declare
  v_uid uuid := auth.uid();
  v_next integer;
begin
  if v_uid is null then
    raise exception 'Nicht angemeldet.';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'Credit-Betrag ungültig.';
  end if;

  update leseno.user_profiles
  set credits = credits - p_amount
  where user_id = v_uid
    and credits >= p_amount
  returning credits into v_next;

  if v_next is null then
    raise exception 'Nicht genug Credits.';
  end if;

  return v_next;
end;
$$;

comment on function public.spend_my_credits(integer) is
  'Debits the signed-in user credits atomically; fails when balance is too low.';

revoke all on function public.spend_my_credits(integer) from public;
grant execute on function public.spend_my_credits(integer) to authenticated;
grant execute on function public.spend_my_credits(integer) to service_role;
