-- Admin-managed Lesemodus / story-card typography defaults per school stage.

create table if not exists leseno.reading_typography_defaults (
  school_stage text primary key,
  font_scale numeric(4, 2) not null,
  line_height numeric(4, 2) not null,
  letter_spacing_em numeric(4, 3) not null,
  font_weight smallint not null,
  content_max_width_rem numeric(4, 1) not null,
  updated_at timestamptz not null default now(),
  constraint reading_typography_defaults_stage_chk
    check (school_stage in (
      'vorschule', 'klasse_1', 'klasse_2', 'klasse_3', 'klasse_4', 'hoeher'
    )),
  constraint reading_typography_defaults_weight_chk
    check (font_weight between 100 and 900)
);

drop trigger if exists reading_typography_defaults_set_updated_at
  on leseno.reading_typography_defaults;
create trigger reading_typography_defaults_set_updated_at
before update on leseno.reading_typography_defaults
for each row
execute function leseno.set_updated_at();

alter table leseno.reading_typography_defaults enable row level security;

-- Seed approximates former Tailwind story-card sizes (clamp to Lesemodus steps).
insert into leseno.reading_typography_defaults (
  school_stage,
  font_scale,
  line_height,
  letter_spacing_em,
  font_weight,
  content_max_width_rem
)
values
  ('vorschule', 1.45, 1.95, 0.030, 600, 48.0),
  ('klasse_1', 1.30, 1.95, 0.030, 600, 48.0),
  ('klasse_2', 1.30, 1.75, 0.010, 600, 48.0),
  ('klasse_3', 1.15, 1.75, 0.010, 600, 48.0),
  ('klasse_4', 1.15, 1.75, 0.010, 600, 48.0),
  ('hoeher', 1.05, 1.75, 0.000, 600, 48.0)
on conflict (school_stage) do nothing;

create or replace function public.list_reading_typography_defaults()
returns table (
  school_stage text,
  font_scale numeric,
  line_height numeric,
  letter_spacing_em numeric,
  font_weight smallint,
  content_max_width_rem numeric
)
language sql
security definer
set search_path = public, leseno
as $$
  select
    d.school_stage,
    d.font_scale,
    d.line_height,
    d.letter_spacing_em,
    d.font_weight,
    d.content_max_width_rem
  from leseno.reading_typography_defaults as d
  order by
    case d.school_stage
      when 'vorschule' then 1
      when 'klasse_1' then 2
      when 'klasse_2' then 3
      when 'klasse_3' then 4
      when 'klasse_4' then 5
      when 'hoeher' then 6
      else 99
    end;
$$;

create or replace function public.upsert_reading_typography_default(
  p_school_stage text,
  p_font_scale numeric,
  p_line_height numeric,
  p_letter_spacing_em numeric,
  p_font_weight smallint,
  p_content_max_width_rem numeric
)
returns void
language plpgsql
security definer
set search_path = public, leseno
as $$
begin
  if p_school_stage not in (
    'vorschule', 'klasse_1', 'klasse_2', 'klasse_3', 'klasse_4', 'hoeher'
  ) then
    raise exception 'Ungültige Schulstufe.';
  end if;

  insert into leseno.reading_typography_defaults (
    school_stage,
    font_scale,
    line_height,
    letter_spacing_em,
    font_weight,
    content_max_width_rem
  )
  values (
    p_school_stage,
    p_font_scale,
    p_line_height,
    p_letter_spacing_em,
    p_font_weight,
    p_content_max_width_rem
  )
  on conflict (school_stage) do update
  set font_scale = excluded.font_scale,
      line_height = excluded.line_height,
      letter_spacing_em = excluded.letter_spacing_em,
      font_weight = excluded.font_weight,
      content_max_width_rem = excluded.content_max_width_rem;
end;
$$;

grant execute on function public.list_reading_typography_defaults()
  to anon, authenticated, service_role;
grant execute on function public.upsert_reading_typography_default(
  text, numeric, numeric, numeric, smallint, numeric
) to service_role;
