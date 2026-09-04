-- Fact „Warum?“ explanations via IONOS gpt-oss-120b.

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
  'fact-why-default',
  'Fakt-Hintergrund (GPT-OSS 120B)',
  'openai-compatible',
  'openai/gpt-oss-120b',
  true,
  false,
  true,
  'Erklärt Fakt-Hintergründe und Vertiefungen über IONOS openai/gpt-oss-120b.'
)
on conflict (id) do update
set label = excluded.label,
    provider = excluded.provider,
    model_slug = excluded.model_slug,
    supports_system_prompt = excluded.supports_system_prompt,
    supports_json_output = excluded.supports_json_output,
    is_active = excluded.is_active,
    notes = excluded.notes;

insert into leseno.prompt_templates (
  key,
  label,
  purpose,
  stage_order,
  model_id,
  system_template,
  user_template,
  placeholders,
  assembly_notes,
  output_contract
) values
  (
    'fact-why',
    'Fakt: Warum?',
    'Erklärt kindgerecht den Hintergrund eines einzelnen Fakten-Satzes.',
    40,
    'fact-why-default',
    'Du bist ein neugieriger Wissens-Coach für Kinder. Erkläre kurz, präzise und unterhaltsam, WARUM ein Fakt stimmt und was dahinter steckt. Passe Wortschatz und Ton an Alter, Schulstufe und Stimmung an. Keine Tests, keine Fragen an das Kind, keine Markdown-Überschriften. Schreib auf Deutsch in 2–4 kurzen Absätzen.',
    'Alter: {{age_group}}
Schulstufe: {{school_stage}}
Stimmung: {{story_mood}}

Fakt:
{{fact}}

Erkläre den Hintergrund: Warum ist das so? Was steckt dahinter?',
    '["age_group","school_stage","story_mood","fact"]'::jsonb,
    'Gestartet vom „Warum?“-Button in der Faktenliste. Modell: fact-why-default (gpt-oss-120b).',
    'Kurzer Fließtext auf Deutsch (2–4 Absätze), ohne Markdown-Überschriften.'
  ),
  (
    'fact-why-more',
    'Fakt: Ich will mehr wissen',
    'Vertieft einen Fakt anhand des bisherigen Hintergrunds mit zusätzlichem Kontext.',
    41,
    'fact-why-default',
    'Du bist ein neugieriger Wissens-Coach für Kinder. Liefere weiterführende Informationen: kurz, präzise, unterhaltsam. Nutze Fakt und bisherigen Hintergrund als Kontext — wiederhole nicht einfach denselben Text. Passe Wortschatz und Ton an Alter, Schulstufe und Stimmung an. Keine Tests, keine Fragen an das Kind, keine Markdown-Überschriften. Schreib auf Deutsch in 2–5 kurzen Absätzen.',
    'Alter: {{age_group}}
Schulstufe: {{school_stage}}
Stimmung: {{story_mood}}

Fakt:
{{fact}}

Bisheriger Hintergrund:
{{background}}

Erkläre jetzt weiterführende Details und Zusammenhänge, die noch spannender machen, warum das so ist.',
    '["age_group","school_stage","story_mood","fact","background"]'::jsonb,
    'Gestartet vom Button „Ich will mehr wissen“ im Warum-Dialog. Kontext: Fakt + Hintergrund.',
    'Kurzer Fließtext auf Deutsch (2–5 Absätze), ohne Markdown-Überschriften.'
  )
on conflict (key) do update
set label = excluded.label,
    purpose = excluded.purpose,
    stage_order = excluded.stage_order,
    model_id = excluded.model_id,
    system_template = excluded.system_template,
    user_template = excluded.user_template,
    placeholders = excluded.placeholders,
    assembly_notes = excluded.assembly_notes,
    output_contract = excluded.output_contract;
