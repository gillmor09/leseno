-- Strip hardcoded model/provider names from role labels and notes.
-- The selected model slug already carries provider + API identity.

update leseno.ai_models
set
  label = case id
    when 'facts-default' then 'Fakten'
    when 'story-default' then 'Geschichte'
    when 'images-default' then 'Illustrationen'
    when 'layout-default' then 'Layout'
    when 'tts-default' then 'Vorlesen'
    when 'fact-why-default' then 'Fakt-Hintergrund'
    when 'social-default' then 'Social Media'
    else label
  end,
  notes = case id
    when 'facts-default' then 'Recherche für kindgerechte, belastbare Fakten zur Geschichte.'
    when 'story-default' then 'Formuliert aus Thema, Fakten und Auswahlfeldern die Geschichte als HTML.'
    when 'images-default' then 'Pixelbilder für Geschichten und Social Media.'
    when 'layout-default' then 'Betten Illustrationen ein; Text fließt mit 1rem Abstand um die Bilder.'
    when 'tts-default' then 'Liest die Geschichte vor (Stimme nova).'
    when 'fact-why-default' then 'Erklärt Fakt-Hintergründe und Vertiefungen („Warum?“ / mehr wissen).'
    when 'social-default' then 'Captions und Bildszenenplanung für Admin Social Media.'
    else notes
  end,
  updated_at = now()
where id in (
  'facts-default',
  'story-default',
  'images-default',
  'layout-default',
  'tts-default',
  'fact-why-default',
  'social-default'
);

update leseno.prompt_templates
set
  assembly_notes = 'Gestartet vom „Warum?“-Button. Unabhängig von Art der Geschichte.',
  updated_at = now()
where key = 'fact-why'
  and assembly_notes like '%gpt-oss%';
