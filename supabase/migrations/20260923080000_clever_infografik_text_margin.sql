-- Infografik: keep painted German labels off the canvas edge.

update leseno.roman_ki_rollen
set
  system_prompt = trim(both E'\n' from system_prompt) || E'\n\nTEXT-RAND: Jeder lesbare Buchstabe mindestens 8% vom Bildrand entfernt (oben, rechts, unten, links). Ruhiger leerer Rand, kein Text an der Kante. Motive dürfen näher an den Rand, Text nicht.',
  updated_at = now()
where key = 'clever_infografiker'
  and system_prompt not ilike '%TEXT-RAND%';
