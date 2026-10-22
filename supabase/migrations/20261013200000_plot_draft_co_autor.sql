-- Plot Ereignisplan: Co-Autor (Dramaturgie aus Exposé), nicht Schreibhilfe/Haiku.
-- suggest-kapitelgeruest resolves co_autor directly; keep aufgaben in sync for UI/history.

insert into leseno.roman_pipeline_aufgaben (
  task_key, label, stage, kind, rolle_key, sort_order
) values
  ('plot.draft', 'Plot · Entwurf', 'plot', 'draft', 'co_autor', 100),
  ('plot.critique', 'Plot · Gegenlese', 'plot', 'critique', 'entwicklungslektor', 105)
on conflict (task_key) do update set
  label = excluded.label,
  stage = excluded.stage,
  kind = excluded.kind,
  rolle_key = excluded.rolle_key,
  sort_order = excluded.sort_order,
  updated_at = now();

update leseno.roman_pipeline_aufgaben
set
  rolle_key = 'co_autor',
  updated_at = now()
where task_key in ('plot.draft', 'kapitelgeruest.draft', 'feingeruest.draft');
