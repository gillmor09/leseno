-- Leseno app schema (empty baseline). Extend with domain tables later.

create schema if not exists leseno;

grant usage on schema leseno to anon, authenticated, service_role;
grant all on schema leseno to postgres, service_role;

-- Example helper: set updated_at on row update (reuse in future tables)
create or replace function leseno.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
