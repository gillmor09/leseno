-- Cover pixel model: Gemini 3 Pro Image (Art-Director role picks the image endpoint).

update leseno.roman_ki_rollen
set
  model_slug = 'gemini-3-pro-image',
  purpose = 'Plant das Cover-Motiv; Bildmodell Gemini 3 Pro Image. Logos/Titel kommen später per Overlay.',
  updated_at = now()
where key = 'clever_cover_artdirector';
