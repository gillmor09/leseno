-- OpenAI TTS model row for admin catalog (Vorlesen).

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
  'tts-default',
  'Vorlesen (OpenAI TTS)',
  'openai-tts',
  'tts-1',
  false,
  false,
  true,
  'Liest die Geschichte vor über OpenAI /v1/audio/speech (OPENAI_API_KEY, Stimme nova).'
)
on conflict (id) do update
set label = excluded.label,
    provider = excluded.provider,
    model_slug = excluded.model_slug,
    supports_system_prompt = excluded.supports_system_prompt,
    supports_json_output = excluded.supports_json_output,
    is_active = excluded.is_active,
    notes = excluded.notes;
