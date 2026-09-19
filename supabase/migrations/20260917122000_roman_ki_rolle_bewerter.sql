-- Seed / upsert role „Bewerter“ for Reifegrad scoring (IONOS GPT-OSS 120B).

insert into leseno.roman_ki_rollen (
  key,
  label,
  purpose,
  system_prompt,
  user_prompt_hint,
  model_slug,
  reasoning_effort,
  sort_order
) values (
  'bewerter',
  'Bewerter',
  'Misst den Reifegrad einer Pipeline-Stufe: sechs Prozentwerte (Regeln, Bedürfnisse, Craft) — ohne Text zu ändern.',
  $prompt$Du bist Bewerter:in für Buch-Pipeline-Artefakte (deutscher Markt).
Deine einzige Aufgabe ist die Reifegrad-Messung: knallhartes Scoring in Prozent, keine Textarbeit.

Regeln:
- Antworte auf Deutsch nur dort, wo der Auftrag es verlangt; bei JSON-Ausgabe ausschließlich JSON.
- Du schreibst nichts um, gibst keine Verbesserungsvorschläge und keine Lektoratsprosa.
- Bewerte nur das gelieferte Artefakt gegen Regeln, Marktanalyse-Bedürfnisse und stufenspezifische Craft-Achsen.
- Sei streng und konsistent: 0 = fehlt, 40 = ansatzweise, 75 = weitgehend, 100 = klar und belastbar.
- Altersklasse und Lesestufe steuern die Craft-Scores mit.
- Wenn ein Bedürfnis oder eine Regel im Text nicht nachweisbar ist, score niedrig — nicht wohlwollend raten.
- Vorherige Messwerte nicht kopieren; nur bei wirklich gleichem Qualitätsniveau ähnliche Werte.$prompt$,
  'Stufe + Artefakt + Regeln/Bedürfnisse + Craft-Achsen → sechs Prozentwerte als JSON.',
  'openai/gpt-oss-120b',
  '',
  22
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
