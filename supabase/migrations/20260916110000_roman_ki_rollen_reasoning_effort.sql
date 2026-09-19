-- Per-role OpenAI reasoning_effort (empty = auto for the model).

alter table leseno.roman_ki_rollen
  add column if not exists reasoning_effort text not null default '';

comment on column leseno.roman_ki_rollen.reasoning_effort is
  'OpenAI reasoning_effort for this role (none|low|medium|high|xhigh|…); empty = auto.';

-- Volume default: low. Strong drafting roles can be raised in Admin later.
update leseno.roman_ki_rollen
set reasoning_effort = 'low'
where coalesce(nullif(trim(reasoning_effort), ''), '') = ''
  and model_slug ilike '%luna%';

-- Return type changes require DROP first (42P13).
drop function if exists public.list_roman_ki_rollen();

create or replace function public.list_roman_ki_rollen()
returns table (
  key text,
  label text,
  purpose text,
  system_prompt text,
  user_prompt_hint text,
  model_slug text,
  reasoning_effort text,
  sort_order smallint,
  updated_at timestamptz
)
language sql
security definer
set search_path = public, leseno
as $$
  select
    r.key,
    r.label,
    r.purpose,
    r.system_prompt,
    r.user_prompt_hint,
    r.model_slug,
    coalesce(r.reasoning_effort, '') as reasoning_effort,
    r.sort_order,
    r.updated_at
  from leseno.roman_ki_rollen as r
  order by r.sort_order, r.key;
$$;

drop function if exists public.upsert_roman_ki_rolle(text, text, text, text, text, text, smallint);

create or replace function public.upsert_roman_ki_rolle(
  p_key text,
  p_label text,
  p_purpose text,
  p_system_prompt text,
  p_user_prompt_hint text,
  p_model_slug text,
  p_sort_order smallint,
  p_reasoning_effort text default ''
)
returns void
language sql
security definer
set search_path = public, leseno
as $$
  insert into leseno.roman_ki_rollen (
    key, label, purpose, system_prompt, user_prompt_hint, model_slug,
    reasoning_effort, sort_order, updated_at
  ) values (
    p_key,
    p_label,
    coalesce(p_purpose, ''),
    coalesce(p_system_prompt, ''),
    coalesce(p_user_prompt_hint, ''),
    coalesce(nullif(trim(p_model_slug), ''), 'gemini-3.8-flash'),
    coalesce(p_reasoning_effort, ''),
    coalesce(p_sort_order, 0),
    now()
  )
  on conflict (key) do update set
    label = excluded.label,
    purpose = excluded.purpose,
    system_prompt = excluded.system_prompt,
    user_prompt_hint = excluded.user_prompt_hint,
    model_slug = excluded.model_slug,
    reasoning_effort = excluded.reasoning_effort,
    sort_order = excluded.sort_order,
    updated_at = now();
$$;

grant execute on function public.list_roman_ki_rollen() to service_role;
grant execute on function public.upsert_roman_ki_rolle(text, text, text, text, text, text, smallint, text)
  to service_role;
