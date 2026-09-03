-- Point both pipeline stages at Gemini for the first production AI wave.

update leseno.ai_models
set provider = 'gemini',
    model_slug = 'gemini-2.0-flash',
    supports_system_prompt = true,
    supports_json_output = true,
    is_active = true,
    notes = 'Sammelt belastbare Fakten über Gemini. Später austauschbar gegen andere Provider.'
where id = 'facts-default';

update leseno.ai_models
set provider = 'gemini',
    model_slug = 'gemini-2.0-flash',
    supports_system_prompt = true,
    supports_json_output = false,
    is_active = true,
    notes = 'Formuliert aus Thema, Fakten und Auswahlfeldern die finale Geschichte über Gemini.'
where id = 'story-default';
