-- Set Vorlesen (`tts-default`) to Fish Audio S2.1 Pro Free (same key/endpoint).

update leseno.ai_models
set
  provider = 'fish-audio',
  model_slug = 's2.1-pro-free',
  label = 'Vorlesen',
  notes = 'Liest die Geschichte vor.',
  supports_system_prompt = false,
  supports_json_output = false,
  is_active = true,
  updated_at = now()
where id = 'tts-default';

insert into leseno.ai_models (
  id,
  label,
  provider,
  model_slug,
  supports_system_prompt,
  supports_json_output,
  is_active,
  notes
)
select
  'tts-default',
  'Vorlesen',
  'fish-audio',
  's2.1-pro-free',
  false,
  false,
  true,
  'Liest die Geschichte vor.'
where not exists (
  select 1 from leseno.ai_models where id = 'tts-default'
);
