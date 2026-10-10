-- Vorlesen (`tts-default`) → ElevenLabs Eleven v4 (multilingual / Hörbuch).

update leseno.ai_models
set
  provider = 'elevenlabs',
  model_slug = 'eleven_v4',
  label = 'Vorlesen',
  notes = 'Liest Geschichten und Hörbücher vor (Eleven v4, Sprache steuerbar, 90+ Sprachen).',
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
  'eleven_v4',
  false,
  false,
  true,
  'Liest Geschichten und Hörbücher vor (Eleven v4, Sprache steuerbar, 90+ Sprachen).'
where not exists (
  select 1 from leseno.ai_models where id = 'tts-default'
);
