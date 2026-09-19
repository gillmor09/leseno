-- Co-Autor: prefer Claude for character sheets — Gemini often blocks fiction conflict as PROHIBITED_CONTENT.

update leseno.roman_ki_rollen
set
  model_slug = 'claude-sonnet-5',
  updated_at = now()
where key = 'co_autor'
  and model_slug like 'gemini%';
