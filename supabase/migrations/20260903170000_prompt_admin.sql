-- Prompt and model configuration for the Leseno story pipeline.
-- Supports multiple AI models and two prompt stages: fact gathering and story writing.

create or replace function leseno.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists leseno.ai_models (
  id text primary key,
  label text not null,
  provider text not null,
  model_slug text not null,
  supports_system_prompt boolean not null default true,
  supports_json_output boolean not null default false,
  is_active boolean not null default true,
  notes text,
  updated_at timestamptz not null default now()
);

create table if not exists leseno.prompt_templates (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  label text not null,
  purpose text not null,
  stage_order smallint not null unique,
  model_id text references leseno.ai_models (id) on delete set null,
  system_template text not null,
  user_template text not null,
  placeholders jsonb not null default '[]'::jsonb,
  assembly_notes text,
  output_contract text,
  updated_at timestamptz not null default now()
);

drop trigger if exists ai_models_set_updated_at on leseno.ai_models;
create trigger ai_models_set_updated_at
before update on leseno.ai_models
for each row
execute function leseno.set_updated_at();

drop trigger if exists prompt_templates_set_updated_at on leseno.prompt_templates;
create trigger prompt_templates_set_updated_at
before update on leseno.prompt_templates
for each row
execute function leseno.set_updated_at();

insert into leseno.ai_models (
  id,
  label,
  provider,
  model_slug,
  supports_system_prompt,
  supports_json_output,
  is_active,
  notes
) values
  (
    'facts-default',
    'Faktenmodell Standard',
    'gemini',
    'gemini-2.0-flash',
    true,
    true,
    true,
    'Sammelt belastbare Fakten über Gemini. Später austauschbar gegen andere Provider.'
  ),
  (
    'story-default',
    'Geschichtenmodell Standard',
    'gemini',
    'gemini-2.0-flash',
    true,
    false,
    true,
    'Formuliert aus Thema, Fakten und Auswahlfeldern die finale Geschichte über Gemini.'
  )
on conflict (id) do update
set label = excluded.label,
    provider = excluded.provider,
    model_slug = excluded.model_slug,
    supports_system_prompt = excluded.supports_system_prompt,
    supports_json_output = excluded.supports_json_output,
    is_active = excluded.is_active,
    notes = excluded.notes;

insert into leseno.prompt_templates (
  key,
  label,
  purpose,
  stage_order,
  model_id,
  system_template,
  user_template,
  placeholders,
  assembly_notes,
  output_contract
) values
  (
    'facts-research',
    'Fakten zum Thema',
    'Holt kindgerechte, korrekte Fakten passend zu Thema und Textlänge.',
    1,
    'facts-default',
    'Du bist ein sorgfältiger Recherche-Assistent für Bildungsinhalte. Gib ausschließlich sachlich korrekte Aussagen zurück. Halte sie präzise, altersgerecht und konkret.',
    'Thema: {{topic}}\nSchulstufe: {{school_stage}}\nGeschichts-Stimmung: {{story_mood}}\nTextlängen-Stufe: {{length_step}}\nGewünschte Faktenanzahl: {{fact_count}}\nGib {{fact_count}} kurze Fakten zurück, die korrekt, spezifisch und gut für eine Kindergeschichte verwendbar sind. Keine Duplikate. Wenn ein Fakt unsicher ist, lass ihn weg.',
    '["topic","school_stage","story_mood","length_step","fact_count"]'::jsonb,
    'Der spätere Builder setzt hier Thema, Schulstufe, Stimmung und die aus der Textlänge abgeleitete Faktenanzahl ein.',
    'Bevorzugt JSON-Liste oder klar trennbare Faktenzeilen.'
  ),
  (
    'story-write',
    'Geschichte ausformulieren',
    'Verarbeitet Thema, Auswahlfelder und recherchierte Fakten zu einer vollständigen Geschichte.',
    2,
    'story-default',
    'Du schreibst warmherzige, fantasievolle Geschichten auf Deutsch für Kinder. Baue die Fakten natürlich in die Geschichte ein und achte darauf, dass der Ton zur gewünschten Stimmung passt.',
    'Thema: {{topic}}\nSchulstufe: {{school_stage}}\nGeschichts-Stimmung: {{story_mood}}\nTextlängen-Stufe: {{length_step}}\nZiel-Wortspanne: {{target_word_range}}\nEinzubauende Fakten:\n{{facts_block}}\nSchreibe eine vollständige Geschichte auf Deutsch. Die Fakten sollen inhaltlich korrekt, fließend eingebettet und laut vorlesbar sein.',
    '["topic","school_stage","story_mood","length_step","target_word_range","facts_block"]'::jsonb,
    'Der spätere Builder übergibt hier die bereits geholten Fakten als Block und ergänzt die aus der DB geladene Wortspanne.',
    'Lange, zusammenhängende Geschichte als Fließtext.'
  )
on conflict (key) do update
set label = excluded.label,
    purpose = excluded.purpose,
    stage_order = excluded.stage_order,
    model_id = excluded.model_id,
    system_template = excluded.system_template,
    user_template = excluded.user_template,
    placeholders = excluded.placeholders,
    assembly_notes = excluded.assembly_notes,
    output_contract = excluded.output_contract;

alter table leseno.ai_models enable row level security;
alter table leseno.prompt_templates enable row level security;

drop policy if exists ai_models_select_public on leseno.ai_models;
create policy ai_models_select_public
on leseno.ai_models for select
to anon, authenticated
using (true);

drop policy if exists prompt_templates_select_public on leseno.prompt_templates;
create policy prompt_templates_select_public
on leseno.prompt_templates for select
to anon, authenticated
using (true);

grant select on leseno.ai_models, leseno.prompt_templates
to anon, authenticated;
grant all on leseno.ai_models, leseno.prompt_templates
to service_role;
