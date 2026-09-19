-- Unify pipeline Erzeugen/Gegenlesen roles: Co-Autor drafts, Entwicklungslektor critiques.

update leseno.roman_pipeline_aufgaben
set rolle_key = 'co_autor',
    label = case task_key
      when 'idee.draft' then 'Idee · Entwurf'
      when 'welt.draft' then 'Welt · Entwurf'
      else label
    end,
    updated_at = now()
where kind = 'draft'
  and stage in ('idee', 'charaktere', 'welt', 'expose', 'szenenplot', 'manuskript');

update leseno.roman_pipeline_aufgaben
set rolle_key = 'entwicklungslektor',
    updated_at = now()
where kind = 'critique'
  and stage in ('idee', 'charaktere', 'welt', 'expose', 'szenenplot', 'manuskript');
