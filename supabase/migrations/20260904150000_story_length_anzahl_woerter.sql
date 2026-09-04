-- Single target word count instead of min/max band.
-- Renames min_words → anzahl_woerter and drops max_words.

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'leseno'
      and table_name = 'story_length_limits'
      and column_name = 'min_words'
  ) then
    alter table leseno.story_length_limits
      rename column min_words to anzahl_woerter;
  end if;
end $$;

alter table leseno.story_length_limits
  drop column if exists max_words;

alter table leseno.story_length_limits
  drop constraint if exists story_length_limits_min_chk;

alter table leseno.story_length_limits
  drop constraint if exists story_length_limits_anzahl_woerter_chk;

alter table leseno.story_length_limits
  add constraint story_length_limits_anzahl_woerter_chk
  check (anzahl_woerter > 0);

-- Return row shape changed — CREATE OR REPLACE cannot change OUT columns.
drop function if exists public.list_story_length_limits();

create or replace function public.list_story_length_limits()
returns table (
  id uuid,
  age_group_id text,
  step_id text,
  anzahl_woerter integer,
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
    l.anzahl_woerter,
    l.fact_count
  from leseno.story_length_limits as l
  join leseno.story_length_steps as s
    on s.id = l.step_id
  order by l.age_group_id, s.sort_order;
$$;

drop function if exists public.update_story_length_limit(uuid, integer, integer, integer);
drop function if exists public.update_story_length_limit(uuid, integer, integer);

create or replace function public.update_story_length_limit(
  p_id uuid,
  p_anzahl_woerter integer,
  p_fact_count integer
)
returns void
language sql
security definer
set search_path = public, leseno
as $$
  update leseno.story_length_limits
  set anzahl_woerter = p_anzahl_woerter,
      fact_count = p_fact_count
  where id = p_id;
$$;

grant execute on function public.list_story_length_limits() to anon, authenticated, service_role;
grant execute on function public.update_story_length_limit(uuid, integer, integer) to service_role;

-- Prompt copy: Ziel-Wortzahl instead of Wortspanne
update leseno.prompt_templates
set user_template = replace(
      replace(user_template, 'Ziel-Wortspanne: {{target_word_range}}', 'Ziel-Wortzahl: ca. {{target_word_count}} Wörter'),
      '{{target_word_range}}',
      '{{target_word_count}}'
    ),
    placeholders = replace(
      placeholders::text,
      'target_word_range',
      'target_word_count'
    )::jsonb
where user_template like '%target_word_range%'
   or placeholders::text like '%target_word_range%';
