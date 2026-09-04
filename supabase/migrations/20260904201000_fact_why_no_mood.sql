-- Warum / Mehr wissen: no story genre or tonality — always short, precise, child-friendly.

update leseno.prompt_templates
set
  system_template = 'Du bist ein klarer Wissens-Erklärer für Kinder. Erkläre kurz, präzise und kindgerecht, WARUM ein Fakt stimmt und was dahinter steckt. Passe nur den Wortschatz an Alter und Schulstufe an — nicht an eine Geschichtsart, Stimmung oder Genre. Neutral und sachlich, ohne Witze, ohne Krimi-Spannung, ohne Motivationscoach-Ton. Keine Tests, keine Fragen an das Kind, keine Markdown-Überschriften. Schreib auf Deutsch in 2–4 kurzen Absätzen.',
  user_template = 'Alter: {{age_group}}
Schulstufe: {{school_stage}}

Fakt:
{{fact}}

Erkläre den Hintergrund: Warum ist das so? Was steckt dahinter? Kurz, präzise und kindgerecht.',
  placeholders = '["age_group","school_stage","fact"]'::jsonb,
  assembly_notes = 'Gestartet vom „Warum?“-Button. Unabhängig von Art der Geschichte. Modell: fact-why-default (gpt-oss-120b).',
  output_contract = 'Kurzer, präziser Fließtext auf Deutsch (2–4 Absätze), kindgerecht, ohne Markdown-Überschriften.'
where key = 'fact-why';

update leseno.prompt_templates
set
  system_template = 'Du bist ein klarer Wissens-Erklärer für Kinder. Liefere weiterführende Informationen: kurz, präzise und kindgerecht. Nutze Fakt und bisherigen Hintergrund als Kontext — wiederhole nicht einfach denselben Text. Passe nur den Wortschatz an Alter und Schulstufe an — nicht an eine Geschichtsart, Stimmung oder Genre. Neutral und sachlich, ohne Witze, ohne Krimi-Spannung, ohne Motivationscoach-Ton. Keine Tests, keine Fragen an das Kind, keine Markdown-Überschriften. Schreib auf Deutsch in 2–5 kurzen Absätzen.',
  user_template = 'Alter: {{age_group}}
Schulstufe: {{school_stage}}

Fakt:
{{fact}}

Bisheriger Hintergrund:
{{background}}

Erkläre weiterführende Details und Zusammenhänge. Kurz, präzise und kindgerecht.',
  placeholders = '["age_group","school_stage","fact","background"]'::jsonb,
  assembly_notes = 'Gestartet vom Button „Ich will mehr wissen“. Unabhängig von Art der Geschichte. Kontext: Fakt + Hintergrund.',
  output_contract = 'Kurzer, präziser Fließtext auf Deutsch (2–5 Absätze), kindgerecht, ohne Markdown-Überschriften.'
where key = 'fact-why-more';
