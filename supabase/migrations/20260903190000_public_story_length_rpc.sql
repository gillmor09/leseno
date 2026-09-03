-- Public-schema RPC wrappers for story-length admin/public access.
-- This avoids direct PostgREST reads/writes against the custom `leseno` schema,
-- because only `public` is exposed via the REST schema cache.

create or replace function public.list_story_length_steps()
returns table (
  id text,
  label text,
  sort_order smallint
)
language sql
security definer
set search_path = public, leseno
as $$
  select
    step.id,
    step.label,
    step.sort_order
  from leseno.story_length_steps as step
  order by step.sort_order;
$$;

create or replace function public.list_story_length_limits()
returns table (
  id uuid,
  age_group_id text,
  step_id text,
  min_words integer,
  max_words integer,
  fact_count integer
)
language sql
security definer
set search_path = public, leseno
as $$
  select
    l.id,
    l.age_group_id,
    l.step_id,
    l.min_words,
    l.max_words,
    l.fact_count
  from leseno.story_length_limits as l
  join leseno.story_length_steps as s
    on s.id = l.step_id
  order by l.age_group_id, s.sort_order;
$$;

create or replace function public.update_story_length_limit(
  p_id uuid,
  p_min_words integer,
  p_max_words integer,
  p_fact_count integer
)
returns void
language sql
security definer
set search_path = public, leseno
as $$
  update leseno.story_length_limits
  set min_words = p_min_words,
      max_words = p_max_words,
      fact_count = p_fact_count
  where id = p_id;
$$;

grant execute on function public.list_story_length_steps() to anon, authenticated, service_role;
grant execute on function public.list_story_length_limits() to anon, authenticated, service_role;
grant execute on function public.update_story_length_limit(uuid, integer, integer, integer) to service_role;

