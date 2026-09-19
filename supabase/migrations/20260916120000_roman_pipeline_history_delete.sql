-- Delete one pipeline history run (admin / service_role).

create or replace function public.admin_delete_roman_pipeline_history(
  p_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, leseno
as $$
begin
  delete from leseno.roman_pipeline_history
  where id = p_id;
end;
$$;

grant execute on function public.admin_delete_roman_pipeline_history(uuid)
  to service_role;
