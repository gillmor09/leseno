-- Set Vorlesen (`tts-default`) to ElevenLabs Eleven v3 (German via API language_code).

update leseno.ai_models
set
  provider = 'elevenlabs',
  model_slug = 'eleven_v3',
  label = 'Vorlesen',
  notes = 'Liest die Geschichte vor (Eleven v3, Deutsch).',
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
  'elevenlabs',
  'eleven_v3',
  false,
  false,
  true,
  'Liest die Geschichte vor (Eleven v3, Deutsch).'
where not exists (
  select 1 from leseno.ai_models where id = 'tts-default'
);
