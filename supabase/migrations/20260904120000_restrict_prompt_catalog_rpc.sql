-- Restrict prompt/model catalog RPCs: no anon/authenticated read of full templates.
-- Server pipeline and admin load via service_role only (`loadPromptAdminCatalog`).

revoke execute on function public.list_ai_models() from anon, authenticated;
revoke execute on function public.list_prompt_templates() from anon, authenticated;

grant execute on function public.list_ai_models() to service_role;
grant execute on function public.list_prompt_templates() to service_role;
