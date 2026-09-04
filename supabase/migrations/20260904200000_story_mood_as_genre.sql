-- „Art der Geschichte“ is genre (comedy / detective / motivational coach), not tone alone.
-- Genre briefs are injected by the app into {{story_mood}}; prompts must follow them as form.

update leseno.prompt_templates
set
  system_template = 'Du schreibst fantasievolle Geschichten auf Deutsch für Kinder. Die Vorgabe „Art der Geschichte“ bestimmt nicht nur den Ton, sondern Genre, Handlungsbogen und Erzählform — halte dich strikt an die mitgegebene Genre-Beschreibung. Baue die Fakten natürlich in die Geschichte ein. Die Geschichte soll in etwa die angegebene Ziel-Wortzahl erreichen (nicht deutlich kürzer oder länger). Gib ausschließlich HTML aus: eine Überschrift (h1) und Absätze (p). Keine Bilder, keine Markdown-Codeblöcke.',
  user_template = 'Thema: {{topic}}
Schulstufe: {{school_stage}}
Art der Geschichte: {{story_mood}}
Textlängen-Stufe: {{length_step}}
Ziel-Wortzahl: {{target_word_count}}
Einzubauende Fakten:
{{facts_block}}
{{syllable_help_block}}
Schreibe eine vollständige Geschichte auf Deutsch als HTML. Folge strikt der Art der Geschichte (Genre und Handlungsbogen). Die Geschichte soll ungefähr die Ziel-Wortzahl erreichen. Die Fakten sollen inhaltlich korrekt, fließend eingebettet und laut vorlesbar sein. Nur HTML-Tags h1 und p (optional strong/em). Keine Silben-spans.',
  placeholders = '["topic","school_stage","story_mood","length_step","target_word_count","facts_block","syllable_help_block"]'::jsonb,
  assembly_notes = 'Art der Geschichte enthält Label + Genre-Brief aus der App. Silbenhilfe: Spans setzt die Pipeline nach dem Layout.'
where key = 'story-write';

update leseno.prompt_templates
set
  system_template = 'Du schreibst fantasievolle Geschichten auf Deutsch für Kinder. Die genannte Hauptfigur ist die zentrale Protagonist:in und behält genau diesen Namen. Freundesnamen aus der Liste darfst du als Freund:innen einbauen. Die Vorgabe „Art der Geschichte“ bestimmt nicht nur den Ton, sondern Genre, Handlungsbogen und Erzählform — halte dich strikt an die mitgegebene Genre-Beschreibung. Baue die Fakten natürlich ein. Die Geschichte soll in etwa die angegebene Ziel-Wortzahl erreichen (nicht deutlich kürzer oder länger). Gib ausschließlich HTML aus: eine Überschrift (h1) und Absätze (p). Keine Bilder, keine Markdown-Codeblöcke.',
  user_template = '{{personal_block}}
Schulstufe: {{school_stage}}
Art der Geschichte: {{story_mood}}
Textlängen-Stufe: {{length_step}}
Ziel-Wortzahl: {{target_word_count}}
Einzubauende Fakten:
{{facts_block}}
{{syllable_help_block}}
Schreibe eine vollständige Geschichte auf Deutsch als HTML. Folge strikt der Art der Geschichte (Genre und Handlungsbogen). Die Geschichte soll ungefähr die Ziel-Wortzahl erreichen. {{protagonist_name}} ist die Hauptfigur. Weitere Namen falls sinnvoll: {{friends_list}}. Die Fakten sollen inhaltlich korrekt, fließend eingebettet und laut vorlesbar sein. Nur HTML-Tags h1 und p (optional strong/em). Keine Silben-spans.',
  placeholders = '["personal_block","topic","protagonist_name","friends_list","school_stage","story_mood","length_step","target_word_count","facts_block","syllable_help_block"]'::jsonb,
  assembly_notes = 'Art der Geschichte enthält Label + Genre-Brief aus der App. Silbenhilfe: Spans setzt die Pipeline nach dem Layout.'
where key = 'story-write-personal';
