-- Public-schema RPC wrappers for admin prompt/model access.
-- This avoids direct PostgREST reads/writes against the custom `leseno` schema.

create or replace function public.list_ai_models()
returns table (
  id text,
  label text,
  provider text,
  model_slug text,
  supports_system_prompt boolean,
  supports_json_output boolean,
  is_active boolean,
  notes text
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
    model.notes
  from leseno.ai_models as model
  order by model.id;
$$;

create or replace function public.list_prompt_templates()
returns table (
  id uuid,
  key text,
  label text,
  purpose text,
  stage_order smallint,
  model_id text,
  system_template text,
  user_template text,
  placeholders jsonb,
  assembly_notes text,
  output_contract text
)
language sql
security definer
set search_path = public, leseno
as $$
  select
    prompt.id,
    prompt.key,
    prompt.label,
    prompt.purpose,
    prompt.stage_order,
    prompt.model_id,
    prompt.system_template,
    prompt.user_template,
    prompt.placeholders,
    prompt.assembly_notes,
    prompt.output_contract
  from leseno.prompt_templates as prompt
  order by prompt.stage_order;
$$;

create or replace function public.update_ai_model(
  p_id text,
  p_label text,
  p_provider text,
  p_model_slug text,
  p_supports_system_prompt boolean,
  p_supports_json_output boolean,
  p_is_active boolean,
  p_notes text
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
      notes = p_notes
  where id = p_id;
$$;

create or replace function public.update_prompt_template(
  p_id uuid,
  p_label text,
  p_purpose text,
  p_model_id text,
  p_system_template text,
  p_user_template text,
  p_placeholders jsonb,
  p_assembly_notes text,
  p_output_contract text
)
returns void
language sql
security definer
set search_path = public, leseno
as $$
  update leseno.prompt_templates
  set label = p_label,
      purpose = p_purpose,
      model_id = p_model_id,
      system_template = p_system_template,
      user_template = p_user_template,
      placeholders = p_placeholders,
      assembly_notes = p_assembly_notes,
      output_contract = p_output_contract
  where id = p_id;
$$;

grant execute on function public.list_ai_models() to anon, authenticated, service_role;
grant execute on function public.list_prompt_templates() to anon, authenticated, service_role;
grant execute on function public.update_ai_model(text, text, text, text, boolean, boolean, boolean, text) to service_role;
grant execute on function public.update_prompt_template(uuid, text, text, text, text, text, jsonb, text, text) to service_role;
