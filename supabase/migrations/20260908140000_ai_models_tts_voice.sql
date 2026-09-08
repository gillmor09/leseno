-- Optional TTS voice id for Vorlesen (`tts-default` and any future TTS roles).

alter table leseno.ai_models
  add column if not exists tts_voice_id text;

comment on column leseno.ai_models.tts_voice_id is
  'Optional provider voice id for TTS roles (ElevenLabs/Inworld/Fish/OpenAI).';

-- Return type change requires DROP (CREATE OR REPLACE cannot alter OUT columns).
drop function if exists public.list_ai_models();

create or replace function public.list_ai_models()
returns table (
  id text,
  label text,
  provider text,
  model_slug text,
  supports_system_prompt boolean,
  supports_json_output boolean,
  is_active boolean,
  notes text,
  tts_voice_id text
)
language sql
security definer
set search_path = public, leseno
as $$
  select
    model.id,
    model.label,
    model.provider,
    model.model_slug,
    model.supports_system_prompt,
    model.supports_json_output,
    model.is_active,
    model.notes,
    model.tts_voice_id
  from leseno.ai_models as model
  order by model.id;
$$;

drop function if exists public.update_ai_model(
  text, text, text, text, boolean, boolean, boolean, text
);

create or replace function public.update_ai_model(
  p_id text,
  p_label text,
  p_provider text,
  p_model_slug text,
  p_supports_system_prompt boolean,
  p_supports_json_output boolean,
  p_is_active boolean,
  p_notes text,
  p_tts_voice_id text default null
)
returns void
language sql
security definer
set search_path = public, leseno
as $$
  update leseno.ai_models
  set label = p_label,
      provider = p_provider,
      model_slug = p_model_slug,
      supports_system_prompt = p_supports_system_prompt,
      supports_json_output = p_supports_json_output,
      is_active = p_is_active,
      notes = p_notes,
      tts_voice_id = nullif(trim(p_tts_voice_id), ''),
      updated_at = now()
  where id = p_id;
$$;

revoke execute on function public.list_ai_models() from anon, authenticated;
grant execute on function public.list_ai_models() to service_role;
grant execute on function public.update_ai_model(
  text, text, text, text, boolean, boolean, boolean, text, text
) to service_role;
