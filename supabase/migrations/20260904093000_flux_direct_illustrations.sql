-- Direct FLUX illustrations (no Mistral planning). Keep Mistral for HTML layout + text wrap.

update leseno.ai_models
set label = 'Illustrationsmodell (FLUX.2)',
    provider = 'ionos-image',
    model_slug = 'black-forest-labs/FLUX.2-klein-4B',
    supports_system_prompt = false,
    supports_json_output = false,
    is_active = true,
    notes = 'Erzeugt Illustrationen direkt über IONOS /v1/images/generations (256×256).'
where id = 'images-default';

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
  'images-default',
  'Illustrationsmodell (FLUX.2)',
  'ionos-image',
  'black-forest-labs/FLUX.2-klein-4B',
  false,
  false,
  true,
  'Erzeugt Illustrationen direkt über IONOS /v1/images/generations (256×256).'
)
on conflict (id) do update
set label = excluded.label,
    provider = excluded.provider,
    model_slug = excluded.model_slug,
    supports_system_prompt = excluded.supports_system_prompt,
    supports_json_output = excluded.supports_json_output,
    is_active = excluded.is_active,
    notes = excluded.notes;

update leseno.ai_models
set notes = 'Betten Illustrationen ein; Text soll um die Bilder herum fließen.'
where id = 'layout-default';

-- Drop the obsolete Mistral illustration-planning prompt.
delete from leseno.prompt_templates
where key = 'story-illustrate';

-- Renumber remaining stages: facts=1, story=2, layout=3.
update leseno.prompt_templates
set stage_order = 20
where key = 'story-write';

update leseno.prompt_templates
set stage_order = 30
where key = 'story-layout';

update leseno.prompt_templates
set stage_order = 2,
    assembly_notes = 'Läuft parallel zur direkten FLUX-Bildgenerierung. Danach folgt die Layout-Stufe.'
where key = 'story-write';

update leseno.prompt_templates
set
  stage_order = 3,
  purpose = 'Setzt Illustrationen so ein, dass der Text um die Bilder herumfließt.',
  system_template = 'Du bist Layout-Redakteur für Kindergeschichten. Du bettest fertige Illustrationen in bestehendes HTML ein, ohne den Textsinn zu ändern. Wichtig: Der Text muss um die Bilder herumfließen (CSS float über die vorgegebenen Klassen). Behalte h1, p, strong, em. Gib nur HTML zurück — keine Markdown-Codeblöcke, keine Erklärungen.',
  user_template = 'Thema: {{topic}}
Schulstufe: {{school_stage}}
Geschichts-Stimmung: {{story_mood}}

Verfügbare Illustrationen (nutze genau diese Attribute):
{{images_manifest}}

Geschichten-HTML:
{{story_html}}

Aufgabe:
- Betten jede Illustration genau einmal mit <img src="__ILL_id__" alt="…" width="256" height="256" class="story-illustration story-illustration--left|story-illustration--right" /> ein.
- Nutze die im Manifest genannte float-Klasse (--left oder --right), damit der Text links bzw. rechts am Bild vorbeifließt.
- Platziere die Bilder mitten im Fließtext (zwischen oder innerhalb von Absätzen), nicht als isolierten Block am Ende.
- Ändere den Textinhalt nicht.
- Gib ausschließlich das vollständige HTML zurück.',
  assembly_notes = 'Startet erst, wenn Geschichte und FLUX-Bilder fertig sind. Pipeline ersetzt __ILL_*__ durch data-URLs.',
  output_contract = 'Vollständiges HTML mit floatenden img-Tags (256×256) und __ILL_*-Platzhaltern.'
where key = 'story-layout';
