-- Personal-mode prompt variants for facts + story (Meine Welt cast).

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
    'facts-research-personal',
    'Fakten (ganz persönlich)',
    'Holt Fakten zum persönlichen Kern aus Meine Welt (Interesse oder Wunsch-Erlebnis).',
    11,
    'facts-default',
    'Du bist ein sorgfältiger Recherche-Assistent für Bildungsinhalte. Gib ausschließlich sachlich korrekte Aussagen zurück. Halte sie präzise, altersgerecht und konkret. Der persönliche Kern ist ein Interesse oder ein Wunsch („Das möchte ich mal erleben“) — recherchiere dazu echte Fakten, keine erfundenen.',
    '{{personal_block}}
Schulstufe: {{school_stage}}
Geschichts-Stimmung: {{story_mood}}
Textlängen-Stufe: {{length_step}}
Gewünschte Faktenanzahl: {{fact_count}}
Gib {{fact_count}} kurze Fakten zurück, die zum persönlichen Kern („{{topic}}“) passen, korrekt, spezifisch und gut für eine Kindergeschichte mit der Hauptfigur {{protagonist_name}} verwendbar sind. Keine Duplikate. Wenn ein Fakt unsicher ist, lass ihn weg.',
    '["personal_block","topic","protagonist_name","school_stage","story_mood","length_step","fact_count"]'::jsonb,
    'Nur bei „Ganz persönlich“. Topic kommt zufällig aus Interessen oder Wunsch-Erlebnissen.',
    'Bevorzugt JSON-Liste oder klar trennbare Faktenzeilen.'
  ),
  (
    'story-write-personal',
    'Geschichte (ganz persönlich)',
    'Schreibt eine HTML-Geschichte mit dem Kind als Protagonist:in und Freunden aus Meine Welt.',
    12,
    'story-default',
    'Du schreibst warmherzige, fantasievolle Geschichten auf Deutsch für Kinder. Die genannte Hauptfigur ist die zentrale Protagonist:in und behält genau diesen Namen. Freundesnamen aus der Liste darfst du als Freund:innen einbauen. Baue die Fakten natürlich ein. Gib ausschließlich HTML aus: eine Überschrift (h1) und Absätze (p). Keine Bilder, keine Markdown-Codeblöcke.',
    '{{personal_block}}
Schulstufe: {{school_stage}}
Geschichts-Stimmung: {{story_mood}}
Textlängen-Stufe: {{length_step}}
Ziel-Wortspanne: {{target_word_range}}
Einzubauende Fakten:
{{facts_block}}
Schreibe eine vollständige Geschichte auf Deutsch als HTML. {{protagonist_name}} ist die Hauptfigur. Weitere Namen falls sinnvoll: {{friends_list}}. Die Fakten sollen inhaltlich korrekt, fließend eingebettet und laut vorlesbar sein. Nur HTML-Tags h1 und p (optional strong/em).',
    '["personal_block","topic","protagonist_name","friends_list","school_stage","story_mood","length_step","target_word_range","facts_block"]'::jsonb,
    'Nur bei „Ganz persönlich“. Protagonist und Freunde kommen aus Meine Welt.',
    'Vollständige Geschichte als HTML (h1, p, ggf. strong/em). Keine Bilder.'
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
