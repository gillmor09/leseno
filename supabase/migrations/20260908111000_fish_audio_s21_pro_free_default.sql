-- Default Vorlesen to Fish Audio free tier (same API key / endpoint).

update leseno.ai_models
set
  provider = 'fish-audio',
  model_slug = 's2.1-pro-free',
  label = 'Vorlesen',
  notes = 'Liest die Geschichte vor.',
  is_active = true,
  updated_at = now()
where id = 'tts-default';
