-- Set Vorlesen (`tts-default`) to Inworld TTS 2 Flash.

update leseno.ai_models
set
  provider = 'inworld',
  model_slug = 'inworld-tts-2-flash',
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
  'inworld',
  'inworld-tts-2-flash',
  false,
  false,
  true,
  'Liest die Geschichte vor.'
where not exists (
  select 1 from leseno.ai_models where id = 'tts-default'
);
