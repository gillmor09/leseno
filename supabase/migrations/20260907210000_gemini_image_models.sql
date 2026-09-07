-- Allow Gemini Image (Nano Banana) as selectable pixel model alongside FLUX.
-- Admin switches `images-default` via KI-Modelle; defaults stay FLUX until changed.

update leseno.ai_models
set
  label = 'Illustrationsmodell',
  notes = 'Pixel für Geschichten + Social. Wechselbar: FLUX.2 (IONOS), Gemini 3.1 Flash Image oder Gemini 3 Pro Image.',
  updated_at = now()
where id = 'images-default';
