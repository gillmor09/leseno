-- Protect Infografik-Designer art style (e.g. Disney) from being flattened by
-- hardcoded “editorial” wording in code. Append stil-schutz; keep existing prompt.

update leseno.roman_ki_rollen
set
  system_prompt = trim(both E'\n' from system_prompt) || E'\n\nSTIL-SCHUTZ: Deinen eigenen Art-Style (z. B. Disney, Pixar, Animationsfilm) immer wortnah in den englischen Bildprompt übernehmen — nie zu flacher Editorial-/Clipart-Infografik abschwächen.',
  updated_at = now()
where key = 'clever_infografiker'
  and system_prompt not ilike '%STIL-SCHUTZ%';
