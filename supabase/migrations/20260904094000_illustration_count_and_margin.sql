-- Document layout margin (1rem) and length-based illustration counts in notes.
-- Runtime image count is computed in code from story_length_limits word bands.

update leseno.prompt_templates
set
  purpose = 'Setzt Illustrationen so ein, dass der Text mit 1rem Abstand um die Bilder fließt.',
  system_template = 'Du bist Layout-Redakteur für Kindergeschichten. Du bettest fertige Illustrationen in bestehendes HTML ein, ohne den Textsinn zu ändern. Wichtig: Der Text muss um die Bilder herumfließen (CSS float über die vorgegebenen Klassen). Der Abstand zwischen Bild und Text beträgt überall 1rem (über die Klassen story-illustration--left / --right). Behalte h1, p, strong, em. Gib nur HTML zurück — keine Markdown-Codeblöcke, keine Erklärungen.',
  user_template = 'Thema: {{topic}}
Schulstufe: {{school_stage}}
Geschichts-Stimmung: {{story_mood}}

Verfügbare Illustrationen (nutze genau diese Attribute):
{{images_manifest}}

Geschichten-HTML:
{{story_html}}

Aufgabe:
- Betten jede Illustration genau einmal mit <img src="__ILL_id__" alt="…" width="256" height="256" class="story-illustration story-illustration--left|story-illustration--right" /> ein.
- Nutze die im Manifest genannte float-Klasse (--left oder --right), damit der Text am Bild vorbeifließt.
- Abstand Bild↔Text: immer 1rem (kein engeres margin, kein style-Attribut nötig — die Klassen setzen 1rem).
- Platziere die Bilder mitten im Fließtext (zwischen oder innerhalb von Absätzen), nicht als isolierten Block am Ende.
- Ändere den Textinhalt nicht.
- Gib ausschließlich das vollständige HTML zurück.',
  assembly_notes = 'Bildanzahl: ≤300 Wörter → 1, ≤1000 → 2, darüber → 3 (aus Textlängen-Limit). Pipeline ersetzt __ILL_*__ durch data-URLs.'
where key = 'story-layout';

update leseno.ai_models
set notes = 'Erzeugt Illustrationen direkt über IONOS FLUX.2-klein (256×256). Anzahl: ≤300 Wörter 1 Bild, ≤1000 zwei, darüber drei.'
where id = 'images-default';
