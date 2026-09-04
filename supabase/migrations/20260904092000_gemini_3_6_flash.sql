-- Gemini 2.0 Flash retired; switch facts/story defaults to gemini-3.6-flash.

update leseno.ai_models
set model_slug = 'gemini-3.6-flash',
    notes = coalesce(
      nullif(notes, ''),
      'Sammelt belastbare Fakten über Gemini.'
    )
where id = 'facts-default'
  and model_slug = 'gemini-2.0-flash';

update leseno.ai_models
set model_slug = 'gemini-3.6-flash',
    notes = coalesce(
      nullif(notes, ''),
      'Formuliert die Geschichte als HTML über Gemini.'
    )
where id = 'story-default'
  and model_slug = 'gemini-2.0-flash';

-- Also catch any other leftover gemini-2.0-flash rows.
update leseno.ai_models
set model_slug = 'gemini-3.6-flash'
where model_slug = 'gemini-2.0-flash';
