-- Ultimate-only Advent calendar book: 24 linked days, PIN preview, library entry.

update leseno.membership_packages
set
  features = case
    when features @> '["adventskalender"]'::jsonb then features
    else features || '["adventskalender"]'::jsonb
  end,
  updated_at = now()
where id = 'ultimate';

create table if not exists leseno.advent_books (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  child_profile_id uuid references leseno.child_profiles (id) on delete set null,
  title text not null,
  year integer not null,
  topic text,
  school_stage text not null,
  length_step text not null,
  mood text not null,
  personal_mode boolean not null default false,
  syllable_help boolean not null default false,
  include_images boolean not null default false,
  pin_hash text not null,
  days_ready integer not null default 0,
  credits_charged integer,
  status text not null default 'generating'
    check (status in ('generating', 'ready', 'failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint advent_books_title_not_blank check (length(trim(title)) > 0),
  constraint advent_books_year_valid check (year >= 2024 and year <= 2100),
  constraint advent_books_days_ready_valid check (days_ready >= 0 and days_ready <= 24)
);

create index if not exists advent_books_user_created_idx
  on leseno.advent_books (user_id, created_at desc);

drop trigger if exists advent_books_set_updated_at on leseno.advent_books;
create trigger advent_books_set_updated_at
before update on leseno.advent_books
for each row
execute function leseno.set_updated_at();

create table if not exists leseno.advent_days (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references leseno.advent_books (id) on delete cascade,
  day_number integer not null check (day_number between 1 and 24),
  title text not null,
  story_html text not null,
  facts jsonb not null default '[]'::jsonb,
  user_story_id uuid references leseno.user_stories (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint advent_days_unique_book_day unique (book_id, day_number),
  constraint advent_days_facts_is_array check (jsonb_typeof(facts) = 'array'),
  constraint advent_days_title_not_blank check (length(trim(title)) > 0),
  constraint advent_days_story_html_not_blank check (length(trim(story_html)) > 0)
);

create index if not exists advent_days_book_day_idx
  on leseno.advent_days (book_id, day_number);

drop trigger if exists advent_days_set_updated_at on leseno.advent_days;
create trigger advent_days_set_updated_at
before update on leseno.advent_days
for each row
execute function leseno.set_updated_at();

alter table leseno.advent_books enable row level security;
alter table leseno.advent_days enable row level security;

-- No direct client reads of day HTML (date/PIN gating lives in app + gated RPCs).
revoke all on leseno.advent_books from authenticated;
revoke all on leseno.advent_days from authenticated;
grant all on leseno.advent_books to service_role;
grant all on leseno.advent_days to service_role;

create or replace function public.create_my_advent_book(
  p_title text,
  p_year integer,
  p_topic text,
  p_school_stage text,
  p_length_step text,
  p_mood text,
  p_pin_hash text,
  p_child_profile_id uuid default null,
  p_personal_mode boolean default false,
  p_syllable_help boolean default false,
  p_include_images boolean default false,
  p_credits_charged integer default null
)
returns uuid
language plpgsql
security definer
set search_path = public, leseno
as $$
declare
  uid uuid := auth.uid();
  v_id uuid;
  v_title text := trim(coalesce(p_title, ''));
begin
  if uid is null then
    raise exception 'Nicht angemeldet.';
  end if;

  if v_title = '' then
    v_title := 'Adventskalenderbuch';
  end if;

  if p_year is null or p_year < 2024 or p_year > 2100 then
    raise exception 'Ungültiges Adventsjahr.';
  end if;

  if length(trim(coalesce(p_pin_hash, ''))) = 0 then
    raise exception 'PIN fehlt.';
  end if;

  if p_child_profile_id is not null then
    if not exists (
      select 1
      from leseno.child_profiles as p
      where p.id = p_child_profile_id
        and p.user_id = uid
    ) then
      raise exception 'Profil nicht gefunden.';
    end if;
  end if;

  insert into leseno.advent_books (
    user_id,
    child_profile_id,
    title,
    year,
    topic,
    school_stage,
    length_step,
    mood,
    personal_mode,
    syllable_help,
    include_images,
    pin_hash,
    days_ready,
    credits_charged,
    status
  )
  values (
    uid,
    p_child_profile_id,
    v_title,
    p_year,
    nullif(trim(p_topic), ''),
    coalesce(nullif(trim(p_school_stage), ''), 'klasse_3'),
    coalesce(nullif(trim(p_length_step), ''), 'mittel'),
    coalesce(nullif(trim(p_mood), ''), 'spannend'),
    coalesce(p_personal_mode, false),
    coalesce(p_syllable_help, false),
    coalesce(p_include_images, false),
    trim(p_pin_hash),
    0,
    p_credits_charged,
    'generating'
  )
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.save_my_advent_day(
  p_book_id uuid,
  p_day_number integer,
  p_title text,
  p_story_html text,
  p_facts jsonb,
  p_user_story_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public, leseno
as $$
declare
  uid uuid := auth.uid();
  v_id uuid;
  v_title text := trim(coalesce(p_title, ''));
  v_html text := coalesce(p_story_html, '');
  v_facts jsonb := coalesce(p_facts, '[]'::jsonb);
  v_ready integer;
begin
  if uid is null then
    raise exception 'Nicht angemeldet.';
  end if;

  if p_day_number is null or p_day_number < 1 or p_day_number > 24 then
    raise exception 'Ungültiger Adventstag.';
  end if;

  if not exists (
    select 1 from leseno.advent_books as b
    where b.id = p_book_id and b.user_id = uid
  ) then
    raise exception 'Adventskalenderbuch nicht gefunden.';
  end if;

  if v_title = '' then
    v_title := format('Tür %s', p_day_number);
  end if;

  if length(trim(v_html)) = 0 then
    raise exception 'Geschichte fehlt.';
  end if;

  if jsonb_typeof(v_facts) is distinct from 'array' then
    raise exception 'Fakten müssen ein Array sein.';
  end if;

  insert into leseno.advent_days (
    book_id, day_number, title, story_html, facts, user_story_id
  )
  values (
    p_book_id, p_day_number, v_title, v_html, v_facts, p_user_story_id
  )
  on conflict (book_id, day_number) do update
  set
    title = excluded.title,
    story_html = excluded.story_html,
    facts = excluded.facts,
    user_story_id = coalesce(excluded.user_story_id, leseno.advent_days.user_story_id),
    updated_at = now()
  returning id into v_id;

  select count(*)::integer into v_ready
  from leseno.advent_days
  where book_id = p_book_id;

  update leseno.advent_books
  set
    days_ready = v_ready,
    status = case when v_ready >= 24 then 'ready' else 'generating' end,
    updated_at = now()
  where id = p_book_id
    and user_id = uid;

  return v_id;
end;
$$;

create or replace function public.mark_my_advent_book_failed(p_book_id uuid)
returns void
language plpgsql
security definer
set search_path = public, leseno
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Nicht angemeldet.';
  end if;

  update leseno.advent_books
  set status = 'failed', updated_at = now()
  where id = p_book_id
    and user_id = uid;
end;
$$;

create or replace function public.list_my_advent_books()
returns table (
  id uuid,
  title text,
  year integer,
  topic text,
  school_stage text,
  length_step text,
  mood text,
  personal_mode boolean,
  child_profile_id uuid,
  profile_display_name text,
  days_ready integer,
  status text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public, leseno
as $$
#variable_conflict use_column
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Nicht angemeldet.';
  end if;

  return query
  select
    b.id,
    b.title,
    b.year,
    b.topic,
    b.school_stage,
    b.length_step,
    b.mood,
    b.personal_mode,
    b.child_profile_id,
    p.display_name as profile_display_name,
    b.days_ready,
    b.status,
    b.created_at
  from leseno.advent_books as b
  left join leseno.child_profiles as p
    on p.id = b.child_profile_id
  where b.user_id = uid
  order by b.created_at desc;
end;
$$;

create or replace function public.get_my_advent_book(p_id uuid)
returns table (
  id uuid,
  title text,
  year integer,
  topic text,
  school_stage text,
  length_step text,
  mood text,
  personal_mode boolean,
  syllable_help boolean,
  include_images boolean,
  child_profile_id uuid,
  profile_display_name text,
  days_ready integer,
  status text,
  pin_hash text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public, leseno
as $$
#variable_conflict use_column
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Nicht angemeldet.';
  end if;

  return query
  select
    b.id,
    b.title,
    b.year,
    b.topic,
    b.school_stage,
    b.length_step,
    b.mood,
    b.personal_mode,
    b.syllable_help,
    b.include_images,
    b.child_profile_id,
    p.display_name as profile_display_name,
    b.days_ready,
    b.status,
    b.pin_hash,
    b.created_at
  from leseno.advent_books as b
  left join leseno.child_profiles as p
    on p.id = b.child_profile_id
  where b.user_id = uid
    and b.id = p_id;
end;
$$;

-- Day list without story bodies (safe for calendar UI).
create or replace function public.list_my_advent_day_meta(p_book_id uuid)
returns table (
  day_number integer,
  title text,
  has_story boolean,
  user_story_id uuid
)
language plpgsql
security definer
set search_path = public, leseno
as $$
#variable_conflict use_column
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Nicht angemeldet.';
  end if;

  if not exists (
    select 1 from leseno.advent_books as b
    where b.id = p_book_id and b.user_id = uid
  ) then
    raise exception 'Adventskalenderbuch nicht gefunden.';
  end if;

  return query
  select
    d.day_number,
    d.title,
    true as has_story,
    d.user_story_id
  from leseno.advent_days as d
  where d.book_id = p_book_id
  order by d.day_number asc;
end;
$$;

-- Date-gated body: Europe/Berlin calendar date must be >= year-12-day.
create or replace function public.get_my_advent_day(
  p_book_id uuid,
  p_day_number integer
)
returns table (
  day_number integer,
  title text,
  story_html text,
  facts jsonb,
  user_story_id uuid,
  is_locked boolean,
  unlock_date date
)
language plpgsql
security definer
set search_path = public, leseno
as $$
#variable_conflict use_column
declare
  uid uuid := auth.uid();
  v_year integer;
  v_unlock date;
  v_today date;
  v_locked boolean;
begin
  if uid is null then
    raise exception 'Nicht angemeldet.';
  end if;

  if p_day_number is null or p_day_number < 1 or p_day_number > 24 then
    raise exception 'Ungültiger Adventstag.';
  end if;

  select b.year into v_year
  from leseno.advent_books as b
  where b.id = p_book_id and b.user_id = uid;

  if v_year is null then
    raise exception 'Adventskalenderbuch nicht gefunden.';
  end if;

  v_unlock := make_date(v_year, 12, p_day_number);
  v_today := (timezone('Europe/Berlin', now()))::date;
  v_locked := v_today < v_unlock;

  return query
  select
    d.day_number,
    case
      when v_locked then format('Tür %s', d.day_number)
      else d.title
    end as title,
    case when v_locked then null else d.story_html end as story_html,
    case when v_locked then '[]'::jsonb else d.facts end as facts,
    d.user_story_id,
    v_locked as is_locked,
    v_unlock as unlock_date
  from leseno.advent_days as d
  where d.book_id = p_book_id
    and d.day_number = p_day_number;
end;
$$;

-- Previous day HTML for sequential generation (owner only, no date gate).
create or replace function public.get_my_advent_day_html_for_generate(
  p_book_id uuid,
  p_day_number integer
)
returns text
language plpgsql
security definer
set search_path = public, leseno
as $$
declare
  uid uuid := auth.uid();
  v_html text;
begin
  if uid is null then
    raise exception 'Nicht angemeldet.';
  end if;

  if not exists (
    select 1 from leseno.advent_books as b
    where b.id = p_book_id and b.user_id = uid and b.status in ('generating', 'failed')
  ) then
    raise exception 'Adventskalenderbuch nicht bereit für Generierung.';
  end if;

  select d.story_html into v_html
  from leseno.advent_days as d
  where d.book_id = p_book_id
    and d.day_number = p_day_number;

  return v_html;
end;
$$;

create or replace function public.link_my_advent_day_story(
  p_book_id uuid,
  p_day_number integer,
  p_user_story_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, leseno
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Nicht angemeldet.';
  end if;

  update leseno.advent_days as d
  set user_story_id = p_user_story_id, updated_at = now()
  from leseno.advent_books as b
  where d.book_id = b.id
    and b.user_id = uid
    and d.book_id = p_book_id
    and d.day_number = p_day_number;
end;
$$;

revoke all on function public.create_my_advent_book(
  text, integer, text, text, text, text, text, uuid, boolean, boolean, boolean, integer
) from public;
grant execute on function public.create_my_advent_book(
  text, integer, text, text, text, text, text, uuid, boolean, boolean, boolean, integer
) to authenticated, service_role;

revoke all on function public.save_my_advent_day(
  uuid, integer, text, text, jsonb, uuid
) from public;
grant execute on function public.save_my_advent_day(
  uuid, integer, text, text, jsonb, uuid
) to authenticated, service_role;

revoke all on function public.mark_my_advent_book_failed(uuid) from public;
grant execute on function public.mark_my_advent_book_failed(uuid)
  to authenticated, service_role;

revoke all on function public.list_my_advent_books() from public;
grant execute on function public.list_my_advent_books()
  to authenticated, service_role;

revoke all on function public.get_my_advent_book(uuid) from public;
grant execute on function public.get_my_advent_book(uuid)
  to authenticated, service_role;

revoke all on function public.list_my_advent_day_meta(uuid) from public;
grant execute on function public.list_my_advent_day_meta(uuid)
  to authenticated, service_role;

revoke all on function public.get_my_advent_day(uuid, integer) from public;
grant execute on function public.get_my_advent_day(uuid, integer)
  to authenticated, service_role;

revoke all on function public.get_my_advent_day_html_for_generate(uuid, integer) from public;
grant execute on function public.get_my_advent_day_html_for_generate(uuid, integer)
  to authenticated, service_role;

revoke all on function public.link_my_advent_day_story(uuid, integer, uuid) from public;
grant execute on function public.link_my_advent_day_story(uuid, integer, uuid)
  to authenticated, service_role;

-- Service-only full day read (parent preview after server PIN/cookie check).
create or replace function public.service_get_advent_day(
  p_user_id uuid,
  p_book_id uuid,
  p_day_number integer
)
returns table (
  day_number integer,
  title text,
  story_html text,
  facts jsonb,
  user_story_id uuid,
  unlock_date date
)
language plpgsql
security definer
set search_path = public, leseno
as $$
#variable_conflict use_column
declare
  v_year integer;
begin
  if p_user_id is null then
    raise exception 'Benutzer fehlt.';
  end if;

  select b.year into v_year
  from leseno.advent_books as b
  where b.id = p_book_id and b.user_id = p_user_id;

  if v_year is null then
    return;
  end if;

  return query
  select
    d.day_number,
    d.title,
    d.story_html,
    d.facts,
    d.user_story_id,
    make_date(v_year, 12, p_day_number) as unlock_date
  from leseno.advent_days as d
  where d.book_id = p_book_id
    and d.day_number = p_day_number;
end;
$$;

revoke all on function public.service_get_advent_day(uuid, uuid, integer) from public;
grant execute on function public.service_get_advent_day(uuid, uuid, integer)
  to service_role;

insert into leseno.prompt_templates (
  key,
  label,
  purpose,
  stage_order,
  model_id,
  system_template,
  user_template,
  placeholders,
  assembly_notes,
  output_contract
) values (
  'story-advent-day',
  'Adventskalenderbuch (Tag)',
  'Schreibt einen von 24 aufeinander aufbauenden Adventstagen für das Adventskalenderbuch.',
  21,
  'story-default',
  'Du schreibst ein Adventskalenderbuch für Kinder auf Deutsch: 24 fortlaufende Kapitel (1.–24. Dezember). Die Vorgabe „Art der Geschichte“ bestimmt Genre und Ton. Jedes Kapitel ist eine eigenständige Episode mit eigenem Mini-Höhepunkt, knüpft aber klar an die Vorgeschichte an und bereitet den Bogen für die nächsten Tage vor. Wiederhole den bisherigen Text nicht. Die Geschichte soll in etwa die angegebene Ziel-Wortzahl erreichen. Gib ausschließlich HTML aus: eine Überschrift (h1) und Absätze (p). Keine Bilder, keine Markdown-Codeblöcke.',
  'Adventstag: {{advent_day}} von 24
Adventsjahr: {{advent_year}}
Thema / Rahmenhandlung: {{topic}}
Schulstufe: {{school_stage}}
Art der Geschichte: {{story_mood}}
Textlängen-Stufe: {{length_step}}
Ziel-Wortzahl: {{target_word_count}}
{{syllable_help_block}}
{{personal_block}}

Bisherige Geschichte (Vortag, vollständig — leer bei Tag 1):
{{previous_story_html}}

Erstelle auf Basis der Auswahl und der bisherigen Geschichte das Kapitel für diesen Adventstag.
Schreibe es als neues HTML (h1 + p, optional strong/em). Keine Silben-spans.
Die Überschrift darf den Adventstag andeuten (z. B. „Tür {{advent_day}}: …“).',
  '["advent_day","advent_year","topic","school_stage","story_mood","length_step","target_word_count","syllable_help_block","personal_block","previous_story_html"]'::jsonb,
  'Ein Aufruf pro Tag 1–24. Tag 1 ohne Vorgeschichte; danach Vortag vollständig. Ultimate-Feature adventskalender.',
  'Ein Adventstag als HTML (h1, p, ggf. strong/em). Keine Bilder, keine Silben-spans.'
)
on conflict (key) do update
set label = excluded.label,
    purpose = excluded.purpose,
    stage_order = excluded.stage_order,
    model_id = excluded.model_id,
    system_template = excluded.system_template,
    user_template = excluded.user_template,
    placeholders = excluded.placeholders,
    assembly_notes = excluded.assembly_notes,
    output_contract = excluded.output_contract;
