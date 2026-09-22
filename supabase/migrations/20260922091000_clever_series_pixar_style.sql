-- Clever series: harden shared Pixar art style for Cover + Infografik roles.
-- Append stil-schutz without wiping existing Disney/Pixar role text.

update leseno.roman_ki_rollen
set
  system_prompt = trim(both E'\n' from system_prompt) || E'\n\nSERIEN-STIL (verbindlich, wie Cover): Pixar-ähnlicher Animationsfilm — große ausdrucksstarke Augen, weiche Gesichtszüge, ausdrucksstarke Mimik, detailreiche Texturen, warmes realistisches Licht, Hauch von Magie, weich gesättigte Farben, freundlich einladend. Technisch hochwertig, realistisch aber leicht überzeichnet. Nie zu flacher Editorial-/Clipart-Grafik abschwächen.',
  updated_at = now()
where key = 'clever_infografiker'
  and system_prompt not ilike '%SERIEN-STIL (verbindlich%';

update leseno.roman_ki_rollen
set
  system_prompt = trim(both E'\n' from system_prompt) || E'\n\nSERIEN-STIL (verbindlich): Pixar-ähnlicher Animationsfilm — große ausdrucksstarke Augen, weiche Gesichtszüge, warmes Licht, Magie, weich gesättigte Farben. Diesen Stil immer wortnah im englischen Bildbrief halten — nicht zu flacher Clipart abschwächen.',
  updated_at = now()
where key = 'clever_cover_artdirector'
  and system_prompt not ilike '%SERIEN-STIL (verbindlich%';
