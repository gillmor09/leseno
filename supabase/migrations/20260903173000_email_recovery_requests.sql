-- Support-style recovery requests for people who forgot which email they used.
-- Supabase Auth cannot recover an unknown email automatically, so the app stores
-- a structured request for manual follow-up.

create or replace function leseno.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists leseno.email_recovery_requests (
  id uuid primary key default gen_random_uuid(),
  contact_email text not null,
  remembered_name text,
  guessed_email text,
  notes text,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint email_recovery_requests_status_chk
    check (status in ('open', 'resolved', 'closed'))
);

drop trigger if exists email_recovery_requests_set_updated_at on leseno.email_recovery_requests;
create trigger email_recovery_requests_set_updated_at
before update on leseno.email_recovery_requests
for each row
execute function leseno.set_updated_at();

alter table leseno.email_recovery_requests enable row level security;

drop policy if exists email_recovery_requests_select_none on leseno.email_recovery_requests;
create policy email_recovery_requests_select_none
on leseno.email_recovery_requests for select
to authenticated
using (false);

grant all on leseno.email_recovery_requests to service_role;
