-- Four-stage story pipeline: facts → (illustrate || story) → layout.
-- Adds two Mistral Small 24B models (IONOS openai-compatible) and two prompts.

insert into leseno.ai_models (
  id,
  label,
  provider,
  model_slug,
  supports_system_prompt,
  supports_json_output,
  is_active,
  notes
) values
  (
    'images-default',
    'Illustrationsmodell (Mistral)',
    'openai-compatible',
    'mistralai/Mistral-Small-24B-Instruct',
    true,
    true,
    true,
    'Plant kindgerechte Illustrationsprompts über IONOS. Pixelbilder erzeugt die Pipeline danach mit FLUX.2-klein (512×512).'
  ),
  (
    'layout-default',
    'Layoutmodell (Mistral)',
    'openai-compatible',
    'mistralai/Mistral-Small-24B-Instruct',
    true,
    false,
    true,
    'Betten Illustrationen inhaltlich passend in den HTML-Geschichtentext ein (IONOS openai-compatible).'
  )
on conflict (id) do update
set label = excluded.label,
    provider = excluded.provider,
    model_slug = excluded.model_slug,
    supports_system_prompt = excluded.supports_system_prompt,
    supports_json_output = excluded.supports_json_output,
    is_active = excluded.is_active,
    notes = excluded.notes;

-- Free stage_order 2 and 4 for the new prompts (story-write moves to 3).
update leseno.prompt_templates
set stage_order = 30
where key = 'story-write' and stage_order = 2;

update leseno.prompt_templates
set
  stage_order = 3,
  output_contract = 'Vollständige Geschichte als HTML (h1, p, ggf. strong/em). Keine Bilder.',
  system_template = 'Du schreibst warmherzige, fantasievolle Geschichten auf Deutsch für Kinder. Baue die Fakten natürlich in die Geschichte ein und achte darauf, dass der Ton zur gewünschten Stimmung passt. Gib ausschließlich HTML aus: eine Überschrift (h1) und Absätze (p). Keine Bilder, keine Markdown-Codeblöcke.',
  user_template = 'Thema: {{topic}}\nSchulstufe: {{school_stage}}\nGeschichts-Stimmung: {{story_mood}}\nTextlängen-Stufe: {{length_step}}\nZiel-Wortspanne: {{target_word_range}}\nEinzubauende Fakten:\n{{facts_block}}\nSchreibe eine vollständige Geschichte auf Deutsch als HTML. Die Fakten sollen inhaltlich korrekt, fließend eingebettet und laut vorlesbar sein. Nur HTML-Tags h1 und p (optional strong/em).'
where key = 'story-write';

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
    'story-illustrate',
    'Illustrationen planen',
    'Erzeugt aus Thema, Fakten, Schulstufe und Stimmung Bildprompts für kindgerechte Illustrationen (max. 512×512).',
    2,
    'images-default',
    'Du bist Illustrationsdirektor für Kinderbücher (5–10 Jahre). Du schreibst präzise, sichere Bildprompts auf Englisch für eine Text-zu-Bild-KI. Keine Schrift im Bild, keine Logos, keine Gewalt, keine realen Marken. Stil: warme, klare Kinderbuchillustration, weiches Licht.',
    'Thema: {{topic}}\nSchulstufe: {{school_stage}}\nGeschichts-Stimmung: {{story_mood}}\nFakten:\n{{facts_block}}\nPlane genau 2 Illustrationen (max. 512×512 px). Jede Illustration muss sich klar auf die Fakten und das Thema stützen und zur Stimmung passen.\nAntworte ausschließlich als JSON-Objekt mit diesem Schema:\n{"illustrations":[{"id":"ill-1","alt":"Kurzer deutscher Alternativtext","image_prompt":"Englischer Bildprompt, detailliert","placement_hint":"Wo im Text (z. B. nach dem Einstieg)"}]}\nids müssen ill-1 und ill-2 sein.',
    '["topic","school_stage","story_mood","facts_block"]'::jsonb,
    'Läuft parallel zur Geschichte. Die Pipeline erzeugt die Pixelbilder danach über IONOS FLUX.2-klein.',
    'JSON mit illustrations[].id, alt, image_prompt, placement_hint.'
  ),
  (
    'story-layout',
    'Bilder in HTML einbetten',
    'Setzt die fertigen Illustrationen inhaltlich passend in den HTML-Geschichtentext ein.',
    4,
    'layout-default',
    'Du bist ein sorgfältiger Layout-Redakteur für Kindergeschichten. Du erhältst fertiges HTML und eine Liste verfügbarer Illustrationen. Du bettest die Bilder mit den vorgegebenen Platzhalter-srcs inhaltlich passend ein, ohne den Textsinn zu ändern. Behalte vorhandene HTML-Formatierung (h1, p, strong, em). Gib nur HTML zurück — keine Markdown-Codeblöcke, keine Erklärungen.',
    'Thema: {{topic}}\nSchulstufe: {{school_stage}}\nGeschichts-Stimmung: {{story_mood}}\n\nVerfügbare Illustrationen (nutze genau diese src-Platzhalter):\n{{images_manifest}}\n\nGeschichten-HTML:\n{{story_html}}\n\nAufgabe: Betten die Illustrationen mit <img src="__ILL_id__" alt="…" width="512" height="512" class="story-illustration" /> an passenden Stellen in den Fließtext ein (zwischen Absätzen). Nutze jede Illustration höchstens einmal. Ändere den Textinhalt nicht. Gib ausschließlich das vollständige HTML zurück.',
    '["topic","school_stage","story_mood","images_manifest","story_html"]'::jsonb,
    'Startet erst, wenn Geschichte und Illustrationen fertig sind. Pipeline ersetzt __ILL_*__ durch data-URLs.',
    'Vollständiges HTML inkl. img-Tags mit __ILL_*-Platzhaltern.'
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
