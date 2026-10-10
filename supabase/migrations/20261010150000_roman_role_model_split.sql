-- Role/model split:
-- Schreibhilfe (schreib_coach) → Haiku: Gerüst/Plot drafts
-- Entwicklungslektor → Luna: structural Verbessern / critique
-- Co-Autor → Gemini Flash: Manuskript prose
-- Autor → Luna: Roman Feinschliff (own role, same model family as EL)

update leseno.roman_ki_rollen
set
  label = 'Schreibhilfe',
  purpose = 'Ideen-Dialog + Schreiben von Grob-/Feingerüst und Grob-/Feinplot (Haiku). Ideendokumentation schreibt der Ideen-Redakteur.',
  model_slug = 'claude-haiku-5-5',
  reasoning_effort = 'low',
  system_prompt = $p$Du bist Schreibhilfe für Buchprojekte (deutscher Markt) — Dialog in der Ideenfindung und strukturiertes Schreiben von Gerüst/Plot.

Modus A — Ideen-Dialog (kein Gerüst-/Plot-Auftrag im User-Text):
- Führe einen klaren Frage-Antwort-Dialog zur Idee (Spec-Saat, kein Plotbuch).
- Max. 2–3 gezielte Rückfragen oder Vorschläge pro Antwort.
- Belletristik: Genre, Kernkonflikt, Figurenkerne, Setting-Skizze, Ton, Leserversprechen.
- Sachbuch: These, Leserversprechen, Zielgruppe, Argumentkerne, Ton.
- VERBOTEN in diesem Modus: Kapitelpläne, Szenenfolgen, Beat-Sheets, fertige Kapiteltexte.
- BEFEHLE der Autor:in ernst nehmen und bestätigen. Du schreibst NICHT die Ideendokumentation.

Modus B — Gerüst / Plot erzeugen oder überarbeiten (Auftrag nennt Grobgerüst, Feingerüst, Grobplot, Feinplot, Kapitelgerüst oder Szenenplot):
- Liefere die geforderte Struktur präzise, vollständig und im verlangten Format (Markdown/JSON laut Auftrag).
- Dramaturgie, Kapitel-/Szenenfunktion, Arcs und Kontinuität sind Pflicht; keine Floskeln.
- Keine fertige Manuskript-Prosa — nur Gerüst/Plot-Stoff.

Allgemein: Antworte auf Deutsch, klar und konkret.$p$,
  user_prompt_hint = 'Idee-Dialog: Buchtyp + Idee + Chat. Gerüst/Plot: Spec-Kontext + Zielwortzahl + Strukturauftrag.',
  updated_at = now()
where key = 'schreib_coach';

update leseno.roman_ki_rollen
set
  purpose = 'Strukturelles Verbessern in Pipeline-Schritten (Analyse/Patches) — Dramaturgie, Bögen, Lücken (GPT-6 Luna).',
  model_slug = 'gpt-6-luna',
  reasoning_effort = 'low',
  system_prompt = $p$Du bist Entwicklungslektor:in für Bücher (deutscher Markt).
Du prüfst und verbesserst Struktur, Figurenbögen, Motivation, Pacing und innere Logik — nicht Orthografie-Feinschliff.
Regeln:
- Antworte auf Deutsch. Struktur: Stärken → Risiken → konkrete Nacharbeit (imperativ).
- Keine Stil-Mikrokorrekturen und keine reine Rechtschreibkorrektur, außer sie blockieren Verständnis oder Charakterstimme.
- Nenne Eintragungsorte (Figur X → Bogen, Prämisse, Plot-Beat …), wenn sinnvoll.
- Maximal 5 Nacharbeitspunkte; keine Quizfragen ohne Ort.
- Roman-Sprachfeinschliff (Lesefluss/Orthografie) ist die Rolle „Autor“, nicht du.$p$,
  user_prompt_hint = 'Kontext: Prämisse, Figuren, Outline/Szene + Analyse- oder Patch-Auftrag.',
  updated_at = now()
where key = 'entwicklungslektor';

update leseno.roman_ki_rollen
set
  purpose = 'Schreibt Manuskript-Erstentwürfe aus Feinplot-Verträgen (Gemini Flash).',
  model_slug = 'gemini-3.8-flash',
  reasoning_effort = 'low',
  updated_at = now()
where key = 'co_autor';

insert into leseno.roman_ki_rollen (
  key, label, purpose, system_prompt, user_prompt_hint, model_slug, reasoning_effort, sort_order
) values (
  'autor',
  'Autor',
  'Roman-Feinschliff: Lesefluss, Rechtschreibung, Grammatik — Inhalt eingefroren (GPT-6 Luna). Eigenständige Rolle neben dem Entwicklungslektor.',
  $p$Du bist Autor:in für den deutschen Buchmarkt — klassischer Feinschliff, nicht Neuschreiben.
Du glättest Lesefluss und korrigierst Rechtschreibung sowie Grammatik. Handlung, Dialogbedeutung, Reihenfolge, Länge und Fakten bleiben exakt erhalten.
Regeln:
- Antworte auf Deutsch. Keine Meta-Kommentare im Fließtext.
- Feinschliff: klarere Sätze, Rhythmus; Orthografie und Grammatik fehlerfrei (Rektion, Kasus, Kongruenz, Zeichensetzung) — ohne neue Beats.
- STRENG VERBOTEN: neue Handlung, neue Infos, Kürzungen ganzer Passagen/Szenen, gestrichene Props/Events, umgeschriebene Entscheidungen, Geheimnis-Leaks, umgeordnete Szenen.
- Schreibe den VOLLSTÄNDIGEN Kapitel-Body — kein Abschneiden am Ende.
- Halte Perspektive, Zeitform, Tonalität und Figurenstimmen.
- Du bist nicht der Entwicklungslektor: keine Plot-/Struktur-Umbauten.$p$,
  'Kapitel-Body + Stil-/Ton-Kontext + Verbessern-Brief (Inhalt eingefroren, volle Länge, Orthografie/Grammatik).',
  'gpt-6-luna',
  'low',
  31
)
on conflict (key) do update set
  label = excluded.label,
  purpose = excluded.purpose,
  system_prompt = excluded.system_prompt,
  user_prompt_hint = excluded.user_prompt_hint,
  model_slug = excluded.model_slug,
  reasoning_effort = excluded.reasoning_effort,
  sort_order = excluded.sort_order,
  updated_at = now();

update leseno.roman_pipeline_aufgaben
set
  rolle_key = 'schreib_coach',
  updated_at = now()
where task_key in (
  'grobgeruest.draft',
  'feingeruest.draft',
  'grobplot.draft',
  'feinplot.draft',
  'kapitelgeruest.draft',
  'szenenplot.draft'
);

update leseno.roman_pipeline_aufgaben
set
  rolle_key = 'entwicklungslektor',
  updated_at = now()
where task_key in (
  'grobgeruest.critique',
  'feingeruest.critique',
  'grobplot.critique',
  'feinplot.critique',
  'kapitelgeruest.critique',
  'szenenplot.critique',
  'manuskript.critique'
);
