-- Package feature `fortsetzen` (story continuation) from Pro upward.
-- Links continuations via parent_story_id; seeds story-continue prompt.

update leseno.membership_packages
set
  features = case
    when features @> '["fortsetzen"]'::jsonb then features
    else features || '["fortsetzen"]'::jsonb
  end,
  updated_at = now()
where id in ('pro', 'ultimate');

alter table leseno.user_stories
  add column if not exists parent_story_id uuid
    references leseno.user_stories (id) on delete set null;

create index if not exists user_stories_user_parent_idx
  on leseno.user_stories (user_id, parent_story_id, created_at asc);

-- Return types / save signature change → drop before recreate.
drop function if exists public.list_my_stories() cascade;
drop function if exists public.get_my_story(uuid) cascade;
drop function if exists public.save_my_story(
  text, text, jsonb, text, uuid, text, text, text, boolean, boolean, boolean, integer
);

create function public.save_my_story(
  p_title text,
  p_story_html text,
  p_facts jsonb,
  p_school_stage text,
  p_child_profile_id uuid default null,
  p_length_step text default null,
  p_mood text default null,
  p_topic text default null,
  p_personal_mode boolean default false,
  p_syllable_help boolean default false,
  p_include_images boolean default false,
  p_credits_charged integer default null,
  p_parent_story_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public, leseno
as $$
declare
  uid uuid := auth.uid();
  v_id uuid;
  v_title text := trim(coalesce(p_title, ''));
  v_html text := coalesce(p_story_html, '');
  v_facts jsonb := coalesce(p_facts, '[]'::jsonb);
begin
  if uid is null then
    raise exception 'Nicht angemeldet.';
  end if;

  if v_title = '' then
    v_title := 'Ohne Titel';
  end if;

  if length(trim(v_html)) = 0 then
    raise exception 'Geschichte fehlt.';
  end if;

  if jsonb_typeof(v_facts) is distinct from 'array' then
    raise exception 'Fakten müssen ein Array sein.';
  end if;

  if p_child_profile_id is not null then
    if not exists (
      select 1
      from leseno.child_profiles as p
      where p.id = p_child_profile_id
        and p.user_id = uid
    ) then
      raise exception 'Profil nicht gefunden.';
    end if;
  end if;

  if p_parent_story_id is not null then
    if not exists (
      select 1
      from leseno.user_stories as s
      where s.id = p_parent_story_id
        and s.user_id = uid
    ) then
      raise exception 'Vorgeschichte nicht gefunden.';
    end if;
  end if;

  insert into leseno.user_stories (
    user_id,
    child_profile_id,
    title,
    story_html,
    facts,
    school_stage,
    length_step,
    mood,
    topic,
    personal_mode,
    syllable_help,
    include_images,
    credits_charged,
    parent_story_id
  )
  values (
    uid,
    p_child_profile_id,
    v_title,
    v_html,
    v_facts,
    coalesce(nullif(trim(p_school_stage), ''), 'klasse_3'),
    nullif(trim(p_length_step), ''),
    nullif(trim(p_mood), ''),
    nullif(trim(p_topic), ''),
    coalesce(p_personal_mode, false),
    coalesce(p_syllable_help, false),
    coalesce(p_include_images, false),
    p_credits_charged,
    p_parent_story_id
  )
  returning id into v_id;

  return v_id;
end;
$$;

create function public.list_my_stories()
returns table (
  id uuid,
  title text,
  child_profile_id uuid,
  profile_display_name text,
  is_favorite boolean,
  is_read boolean,
  school_stage text,
  personal_mode boolean,
  parent_story_id uuid,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public, leseno
as $$
#variable_conflict use_column
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Nicht angemeldet.';
  end if;

  return query
  select
    s.id,
    s.title,
    s.child_profile_id,
    p.display_name as profile_display_name,
    s.is_favorite,
    s.is_read,
    s.school_stage,
    s.personal_mode,
    s.parent_story_id,
    s.created_at
  from leseno.user_stories as s
  left join leseno.child_profiles as p
    on p.id = s.child_profile_id
  where s.user_id = uid
  order by s.is_favorite desc, s.created_at desc;
end;
$$;

create function public.get_my_story(p_id uuid)
returns table (
  id uuid,
  title text,
  child_profile_id uuid,
  profile_display_name text,
  story_html text,
  facts jsonb,
  school_stage text,
  length_step text,
  mood text,
  topic text,
  personal_mode boolean,
  syllable_help boolean,
  include_images boolean,
  is_favorite boolean,
  is_read boolean,
  credits_charged integer,
  parent_story_id uuid,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public, leseno
as $$
#variable_conflict use_column
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Nicht angemeldet.';
  end if;

  return query
  select
    s.id,
    s.title,
    s.child_profile_id,
    p.display_name as profile_display_name,
    s.story_html,
    s.facts,
    s.school_stage,
    s.length_step,
    s.mood,
    s.topic,
    s.personal_mode,
    s.syllable_help,
    s.include_images,
    s.is_favorite,
    s.is_read,
    s.credits_charged,
    s.parent_story_id,
    s.created_at
  from leseno.user_stories as s
  left join leseno.child_profiles as p
    on p.id = s.child_profile_id
  where s.user_id = uid
    and s.id = p_id;
end;
$$;

revoke all on function public.save_my_story(
  text, text, jsonb, text, uuid, text, text, text, boolean, boolean, boolean, integer, uuid
) from public;
grant execute on function public.save_my_story(
  text, text, jsonb, text, uuid, text, text, text, boolean, boolean, boolean, integer, uuid
) to authenticated, service_role;

revoke all on function public.list_my_stories() from public;
grant execute on function public.list_my_stories() to authenticated, service_role;

revoke all on function public.get_my_story(uuid) from public;
grant execute on function public.get_my_story(uuid) to authenticated, service_role;

-- Continuation prompt (admin-editable).
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
) values (
  'story-continue',
  'Geschichte fortsetzen',
  'Schreibt eine Fortsetzung auf Basis der Auswahlfelder und der bisherigen Geschichte.',
  20,
  'story-default',
  'Du schreibst Fortsetzungen fantasievoller Kindergeschichten auf Deutsch. Die Vorgabe „Art der Geschichte“ bestimmt Genre und Ton — halte dich daran. Die Fortsetzung knüpft nahtlos an die mitgegebene Vorgeschichte an, ohne den bisherigen Text zu wiederholen. Die Geschichte soll in etwa die angegebene Ziel-Wortzahl erreichen. Gib ausschließlich HTML aus: eine Überschrift (h1) und Absätze (p). Keine Bilder, keine Markdown-Codeblöcke.',
  'Thema / Fortsetzungsrichtung: {{topic}}
Schulstufe: {{school_stage}}
Art der Geschichte: {{story_mood}}
Textlängen-Stufe: {{length_step}}
Ziel-Wortzahl: {{target_word_count}}
{{syllable_help_block}}

Bisherige Geschichte (vollständig):
{{previous_story_html}}

Erstelle auf Basis der Auswahl und der Geschichte eine mögliche Fortsetzung.
Schreibe die Fortsetzung als neues HTML (h1 + p, optional strong/em). Keine Silben-spans.',
  '["topic","school_stage","story_mood","length_step","target_word_count","syllable_help_block","previous_story_html"]'::jsonb,
  'Gestartet vom Button „Wie könnte es weitergehen?“. Vollständige Vorgeschichte wird mitgegeben. Silbenhilfe nur als Schreibregel; Spans setzt die Pipeline danach.',
  'Fortsetzung als HTML (h1, p, ggf. strong/em). Keine Bilder, keine Silben-spans.'
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
