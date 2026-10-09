-- Kapitelgerüst + Szenenplot: only Entwicklungslektor (analytical).
-- Manuskript prose stays on co_autor.

insert into leseno.roman_pipeline_aufgaben (
  task_key, label, stage, kind, rolle_key, sort_order
) values
  ('kapitelgeruest.draft', 'Kapitelgerüst · Entwurf', 'kapitelgeruest', 'draft', 'entwicklungslektor', 100),
  ('kapitelgeruest.critique', 'Kapitelgerüst · Gegenlese', 'kapitelgeruest', 'critique', 'entwicklungslektor', 110)
on conflict (task_key) do update set
  label = excluded.label,
  stage = excluded.stage,
  kind = excluded.kind,
  rolle_key = excluded.rolle_key,
  sort_order = excluded.sort_order,
  updated_at = now();

update leseno.roman_pipeline_aufgaben
set
  rolle_key = 'entwicklungslektor',
  label = case
    when task_key = 'szenenplot.draft' then 'Szenenplot · Entwurf'
    when task_key = 'szenenplot.critique' then 'Szenenplot · Gegenlese'
    else label
  end,
  updated_at = now()
where task_key in ('szenenplot.draft', 'szenenplot.critique');
