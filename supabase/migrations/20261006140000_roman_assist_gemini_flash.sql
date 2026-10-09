-- Non-prose assist roles → Gemini 3.8 Flash (Manuskript prose stays on co_autor).
-- Code also forces gemini-3.8-flash via resolveRomanAssistModel() for Gerüst/Graph/Packet.

update leseno.roman_ki_rollen
set
  model_slug = 'gemini-3.8-flash',
  updated_at = now()
where key in (
  'entwicklungslektor',
  'bewerter',
  'pipeline_router',
  'fachberater',
  'testleser_fanbase',
  'schreib_coach',
  'ideen_redakteur'
)
and model_slug is distinct from 'gemini-3.8-flash';
