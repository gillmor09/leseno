-- Silbenhilfe: LLM writes normal German; spans are applied server-side after layout.

update leseno.prompt_templates
set user_template = 'Thema: {{topic}}
Schulstufe: {{school_stage}}
Geschichts-Stimmung: {{story_mood}}
Textlängen-Stufe: {{length_step}}
Ziel-Wortspanne: {{target_word_range}}
Einzubauende Fakten:
{{facts_block}}
{{syllable_help_block}}
Schreibe eine vollständige Geschichte auf Deutsch als HTML. Die Fakten sollen inhaltlich korrekt, fließend eingebettet und laut vorlesbar sein. Nur HTML-Tags h1 und p (optional strong/em). Keine Silben-spans.',
    placeholders = '["topic","school_stage","story_mood","length_step","target_word_range","facts_block","syllable_help_block"]'::jsonb,
    assembly_notes = 'Silbenhilfe: syllable_help_block steuert nur Schreibregeln; Spans setzt die Pipeline nach dem Layout.',
    output_contract = 'Vollständige Geschichte als HTML (h1, p, ggf. strong/em). Keine Bilder, keine Silben-spans.'
where key = 'story-write';

update leseno.prompt_templates
set user_template = '{{personal_block}}
Schulstufe: {{school_stage}}
Geschichts-Stimmung: {{story_mood}}
Textlängen-Stufe: {{length_step}}
Ziel-Wortspanne: {{target_word_range}}
Einzubauende Fakten:
{{facts_block}}
{{syllable_help_block}}
Schreibe eine vollständige Geschichte auf Deutsch als HTML. {{protagonist_name}} ist die Hauptfigur. Weitere Namen falls sinnvoll: {{friends_list}}. Die Fakten sollen inhaltlich korrekt, fließend eingebettet und laut vorlesbar sein. Nur HTML-Tags h1 und p (optional strong/em). Keine Silben-spans.',
    placeholders = '["personal_block","topic","protagonist_name","friends_list","school_stage","story_mood","length_step","target_word_range","facts_block","syllable_help_block"]'::jsonb,
    assembly_notes = 'Silbenhilfe: syllable_help_block steuert nur Schreibregeln; Spans setzt die Pipeline nach dem Layout.',
    output_contract = 'Vollständige Geschichte als HTML (h1, p, ggf. strong/em). Keine Bilder, keine Silben-spans.'
where key = 'story-write-personal';
