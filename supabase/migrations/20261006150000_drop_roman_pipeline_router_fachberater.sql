-- Remove obsolete belletristik KI roles: pipeline_router (unused cascade)
-- and fachberater (critique owned by entwicklungslektor).

update leseno.roman_pipeline_aufgaben
set
  rolle_key = 'entwicklungslektor',
  updated_at = now()
where rolle_key = 'fachberater';

delete from leseno.roman_pipeline_aufgaben
where task_key = 'pipeline.router'
   or rolle_key = 'pipeline_router';

delete from leseno.roman_ki_rollen
where key in ('pipeline_router', 'fachberater');
