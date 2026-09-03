-- Word-count bands for the story-length slider.
-- Two age groups (5–7, 8–10) × five steps. Public read; writes via service_role / admin.

create or replace function leseno.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists leseno.age_groups (
  id text primary key,
  label text not null,
  min_age smallint not null,
  max_age smallint not null,
  constraint age_groups_range_chk check (min_age > 0 and max_age >= min_age)
);

create table if not exists leseno.story_length_steps (
  id text primary key,
  label text not null,
  sort_order smallint not null unique
);

create table if not exists leseno.story_length_limits (
  id uuid primary key default gen_random_uuid(),
  age_group_id text not null references leseno.age_groups (id) on delete cascade,
  step_id text not null references leseno.story_length_steps (id) on delete cascade,
  min_words integer not null,
  max_words integer,
  updated_at timestamptz not null default now(),
  constraint story_length_limits_unique unique (age_group_id, step_id),
  constraint story_length_limits_min_chk check (min_words > 0),
  constraint story_length_limits_max_chk check (max_words is null or max_words >= min_words)
);

drop trigger if exists story_length_limits_set_updated_at on leseno.story_length_limits;
create trigger story_length_limits_set_updated_at
before update on leseno.story_length_limits
for each row
execute function leseno.set_updated_at();

insert into leseno.age_groups (id, label, min_age, max_age) values
  ('5-7', '5–7 Jahre', 5, 7),
  ('8-10', '8–10 Jahre', 8, 10)
on conflict (id) do update
set label = excluded.label,
    min_age = excluded.min_age,
    max_age = excluded.max_age;

insert into leseno.story_length_steps (id, label, sort_order) values
  ('sehr_kurz', 'Sehr kurz', 1),
  ('kurz', 'Kurz', 2),
  ('mittel', 'Mittel', 3),
  ('lang', 'Lang', 4),
  ('sehr_lang', 'Sehr lang', 5)
on conflict (id) do update
set label = excluded.label,
    sort_order = excluded.sort_order;

insert into leseno.story_length_limits (age_group_id, step_id, min_words, max_words) values
  ('5-7', 'sehr_kurz', 10, 30),
  ('5-7', 'kurz', 30, 80),
  ('5-7', 'mittel', 80, 150),
  ('5-7', 'lang', 150, 300),
  ('5-7', 'sehr_lang', 300, null),
  ('8-10', 'sehr_kurz', 50, 150),
  ('8-10', 'kurz', 150, 350),
  ('8-10', 'mittel', 350, 700),
  ('8-10', 'lang', 700, 1000),
  ('8-10', 'sehr_lang', 1200, null)
on conflict (age_group_id, step_id) do update
set min_words = excluded.min_words,
    max_words = excluded.max_words;

alter table leseno.age_groups enable row level security;
alter table leseno.story_length_steps enable row level security;
alter table leseno.story_length_limits enable row level security;

drop policy if exists age_groups_select_public on leseno.age_groups;
create policy age_groups_select_public
on leseno.age_groups for select
to anon, authenticated
using (true);

drop policy if exists story_length_steps_select_public on leseno.story_length_steps;
create policy story_length_steps_select_public
on leseno.story_length_steps for select
to anon, authenticated
using (true);

drop policy if exists story_length_limits_select_public on leseno.story_length_limits;
create policy story_length_limits_select_public
on leseno.story_length_limits for select
to anon, authenticated
using (true);

grant select on leseno.age_groups, leseno.story_length_steps, leseno.story_length_limits
to anon, authenticated;
grant all on leseno.age_groups, leseno.story_length_steps, leseno.story_length_limits
to service_role;
