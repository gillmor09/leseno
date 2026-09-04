-- Silbenhilfe: story-write prompts + layout keep span.silbe classes.

update leseno.prompt_templates
set user_template = 'Thema: {{topic}}
Schulstufe: {{school_stage}}
Geschichts-Stimmung: {{story_mood}}
Textlängen-Stufe: {{length_step}}
Ziel-Wortspanne: {{target_word_range}}
Einzubauende Fakten:
{{facts_block}}
{{syllable_help_block}}
Schreibe eine vollständige Geschichte auf Deutsch als HTML. Die Fakten sollen inhaltlich korrekt, fließend eingebettet und laut vorlesbar sein. Nur HTML-Tags h1 und p (optional strong/em; bei Silbenhilfe zusätzlich span.silbe).',
    placeholders = '["topic","school_stage","story_mood","length_step","target_word_range","facts_block","syllable_help_block"]'::jsonb,
    assembly_notes = 'Läuft parallel zur direkten FLUX-Bildgenerierung. syllable_help_block ist leer oder enthält Silbenhilfe-Regeln.',
    output_contract = 'Vollständige Geschichte als HTML (h1, p, ggf. strong/em, ggf. span.silbe). Keine Bilder.'
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
Schreibe eine vollständige Geschichte auf Deutsch als HTML. {{protagonist_name}} ist die Hauptfigur. Weitere Namen falls sinnvoll: {{friends_list}}. Die Fakten sollen inhaltlich korrekt, fließend eingebettet und laut vorlesbar sein. Nur HTML-Tags h1 und p (optional strong/em; bei Silbenhilfe zusätzlich span.silbe).',
    placeholders = '["personal_block","topic","protagonist_name","friends_list","school_stage","story_mood","length_step","target_word_range","facts_block","syllable_help_block"]'::jsonb,
    assembly_notes = 'Nur bei „Ganz persönlich“. syllable_help_block ist leer oder enthält Silbenhilfe-Regeln.',
    output_contract = 'Vollständige Geschichte als HTML (h1, p, ggf. strong/em, ggf. span.silbe). Keine Bilder.'
where key = 'story-write-personal';

update leseno.prompt_templates
set system_template = 'Du bist Layout-Redakteur für Kindergeschichten. Du bettest fertige Illustrationen in bestehendes HTML ein, ohne den Textsinn zu ändern. Der Text muss um die Bilder fließen. Abstände setzt das CSS (1rem) — setze kein style-Attribut. Behalte h1, p, strong, em und alle span.silbe / silbe--a / silbe--b unverändert. Gib nur HTML zurück — keine Markdown-Codeblöcke, keine Erklärungen.',
    user_template = 'Thema: {{topic}}
Schulstufe: {{school_stage}}
Geschichts-Stimmung: {{story_mood}}

Verfügbare Illustrationen (nutze genau diese Attribute):
{{images_manifest}}

Geschichten-HTML:
{{story_html}}

Aufgabe:
- Betten jede Illustration genau einmal so ein, dass das <img> das erste Kind seines <p> ist und der Umfließ-Text im selben <p> direkt danach folgt:
  <p><img src="__ILL_id__" alt="…" width="256" height="256" class="story-illustration story-illustration--left" />Text der auf gleicher Höhe wie die Bildoberkante beginnt und rechts/links umfließt…</p>
- Nutze die Manifest-Klasse (--left oder --right).
- Kein alleinstehendes Bild zwischen zwei leeren Absätzen; Text und Bild gehören in denselben Absatz.
- Kein style-Attribut; Abstände (1rem oben und seitlich) kommen aus CSS.
- Ändere den Textinhalt nicht — insbesondere Silben-<span class="silbe …"> und deren Klassen beibehalten.
- Gib ausschließlich das vollständige HTML zurück.'
where key = 'story-layout';
