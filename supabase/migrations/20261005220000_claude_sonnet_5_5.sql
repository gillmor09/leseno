-- Wire Claude Sonnet 5.5 as selectable text model (Co-Autor / Manuskript).

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
  'claude-sonnet-5-5',
  'Claude Sonnet 5.5',
  'claude',
  'claude-sonnet-5-5',
  true,
  true,
  true,
  'Aktuelles Sonnet für Manuskript / Co-Autor. API: thinking between_tools + output_config.effort.'
)
on conflict (id) do update set
  label = excluded.label,
  provider = excluded.provider,
  model_slug = excluded.model_slug,
  supports_system_prompt = excluded.supports_system_prompt,
  supports_json_output = excluded.supports_json_output,
  is_active = excluded.is_active,
  notes = excluded.notes,
  updated_at = now();
