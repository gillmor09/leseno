-- Bump Gemini Flash 3.6 → 3.8; add dedicated social text model.

update leseno.ai_models
set
  model_slug = 'gemini-3.8-flash',
  notes = replace(
    coalesce(notes, ''),
    'gemini-3.6-flash',
    'gemini-3.8-flash'
  ),
  updated_at = now()
where model_slug = 'gemini-3.6-flash'
   or id in ('facts-default', 'story-default');

insert into leseno.ai_models (
  id,
  label,
  provider,
  model_slug,
  supports_system_prompt,
  supports_json_output,
  is_active,
  notes
) values (
  'social-default',
  'Social Media Text (Gemini)',
  'gemini',
  'gemini-3.8-flash',
  true,
  false,
  true,
  'Captions + FLUX-Szenenplanung für Admin Social Media.'
)
on conflict (id) do update set
  label = excluded.label,
  provider = excluded.provider,
  model_slug = excluded.model_slug,
  supports_system_prompt = excluded.supports_system_prompt,
  supports_json_output = excluded.supports_json_output,
  is_active = excluded.is_active,
  notes = excluded.notes,
  updated_at = now();
