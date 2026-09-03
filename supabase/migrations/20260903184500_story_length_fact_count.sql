-- Adds a configurable fact count per story-length band.
-- The value is used later when building the research prompt.

alter table leseno.story_length_limits
add column if not exists fact_count integer;

update leseno.story_length_limits
set fact_count = case step_id
  when 'sehr_kurz' then 1
  when 'kurz' then 2
  when 'mittel' then 3
  when 'lang' then 4
  when 'sehr_lang' then 5
  else 2
end
where fact_count is null;

alter table leseno.story_length_limits
alter column fact_count set not null;

alter table leseno.story_length_limits
alter column fact_count set default 2;

alter table leseno.story_length_limits
add constraint story_length_limits_fact_count_chk
check (fact_count >= 1);
