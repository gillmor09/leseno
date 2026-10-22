-- Full-manuscript acceptance check (Lektor Haiku) for greenfield novels.

alter table leseno.novels
  add column if not exists abnahme jsonb not null default '{}'::jsonb;

create or replace function public.admin_upsert_novel_abnahme(
  p_id uuid,
  p_abnahme jsonb
)
returns void
language plpgsql
security definer
set search_path = leseno, public
as $$
begin
  update leseno.novels
  set abnahme = coalesce(p_abnahme, '{}'::jsonb)
  where id = p_id;
  if not found then
    raise exception 'Novel nicht gefunden.';
  end if;
end;
$$;

revoke all on function public.admin_upsert_novel_abnahme(uuid, jsonb) from public;
grant execute on function public.admin_upsert_novel_abnahme(uuid, jsonb) to service_role;
