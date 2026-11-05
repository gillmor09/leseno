-- Tab switches must not full-get + upsert the whole Sachbuch (multi-MB kapitel).
-- Only touch idee.guide.currentStep; optionally slim fat Hörbuch track bodies in shell.

create or replace function public.admin_patch_sachbuch_guide_step(
  p_id uuid,
  p_step text
)
returns void
language plpgsql
security definer
set search_path = leseno, public
as $$
begin
  if p_step is null or length(trim(p_step)) = 0 then
    raise exception 'Guide-Schritt fehlt.';
  end if;

  update leseno.sachbuch_kontext
  set
    idee = coalesce(idee, '{}'::jsonb) || jsonb_build_object(
      'guide',
      coalesce(idee->'guide', '{}'::jsonb)
        || jsonb_build_object('currentStep', to_jsonb(trim(p_step)))
    ),
    updated_at = now()
  where id = p_id;

  if not found then
    raise exception 'Sachbuch nicht gefunden.';
  end if;
end;
$$;

revoke all on function public.admin_patch_sachbuch_guide_step(uuid, text) from public;
grant execute on function public.admin_patch_sachbuch_guide_step(uuid, text) to service_role;

-- Patch idee JSON only (no kapitel rewrite) — e.g. slim Hörbuch track previews.
create or replace function public.admin_patch_sachbuch_idee(
  p_id uuid,
  p_idee jsonb
)
returns void
language plpgsql
security definer
set search_path = leseno, public
as $$
begin
  if p_idee is null or jsonb_typeof(p_idee) <> 'object' then
    raise exception 'idee JSON fehlt.';
  end if;

  update leseno.sachbuch_kontext
  set
    idee = p_idee,
    updated_at = now()
  where id = p_id;

  if not found then
    raise exception 'Sachbuch nicht gefunden.';
  end if;
end;
$$;

revoke all on function public.admin_patch_sachbuch_idee(uuid, jsonb) from public;
grant execute on function public.admin_patch_sachbuch_idee(uuid, jsonb) to service_role;

-- Shell: trim Hörbuch track spoken bodies (preview only) so fat DB rows
-- do not freeze every admin tab / RSC payload.
create or replace function public.admin_get_sachbuch_kontext_shell(p_id uuid)
returns table (
  id uuid,
  title text,
  stilbibel text,
  zielgruppe text,
  agents jsonb,
  kapitel jsonb,
  idee jsonb,
  evidenz jsonb,
  makro jsonb,
  suggested_title text,
  subtitle text,
  summary text,
  keywords jsonb,
  autor_name text,
  vorsatz jsonb,
  cover_image_data_url text,
  cover_prompt text,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = leseno, public
as $$
  select
    s.id,
    s.title,
    s.stilbibel,
    s.zielgruppe,
    s.agents,
    coalesce(
      (
        select jsonb_agg(
          (
            elem
            - 'draftPass1'
            - 'critiquePass2'
            - 'finalText'
            - 'interviewBriefing'
            - 'interviewMessages'
            - 'groundingSources'
            - 'infografikDataUrl'
            - 'infografikPrompt'
          )
          || jsonb_build_object(
            'draftPass1', '',
            'critiquePass2', '',
            'finalText', '',
            'interviewBriefing', '',
            'interviewMessages', '[]'::jsonb,
            'groundingSources', '[]'::jsonb,
            'infografikDataUrl', null,
            'infografikPrompt', '',
            'infografiken', coalesce(
              (
                select jsonb_agg(
                  jsonb_build_object(
                    'key', coalesce(img->>'key', ''),
                    'title', coalesce(img->>'title', ''),
                    'dataUrl', '',
                    'prompt', ''
                  )
                )
                from jsonb_array_elements(
                  case
                    when jsonb_typeof(elem->'infografiken') = 'array'
                    then elem->'infografiken'
                    else '[]'::jsonb
                  end
                ) as img
              ),
              '[]'::jsonb
            ),
            'abschnitte', coalesce(
              (
                select jsonb_agg(
                  (a - 'draftText' - 'authorReply' - 'revisions')
                  || jsonb_build_object(
                    'draftText', '',
                    'authorReply', '',
                    'revisions', '[]'::jsonb
                  )
                )
                from jsonb_array_elements(
                  case
                    when jsonb_typeof(elem->'abschnitte') = 'array'
                    then elem->'abschnitte'
                    else '[]'::jsonb
                  end
                ) as a
              ),
              '[]'::jsonb
            ),
            'manuscript', coalesce(elem->'manuscript', '{}'::jsonb)
              || jsonb_build_object(
                'draftText', '',
                'improvedText', '',
                'herstellungText', ''
              )
          )
          order by ordinality
        )
        from jsonb_array_elements(
          case
            when jsonb_typeof(s.kapitel) = 'array' then s.kapitel
            else '[]'::jsonb
          end
        ) with ordinality as t(elem, ordinality)
      ),
      '[]'::jsonb
    ) as kapitel,
    case
      when jsonb_typeof(s.idee->'hoerbuch'->'tracks') = 'array' then
        (coalesce(s.idee, '{}'::jsonb) - 'hoerbuch')
        || jsonb_build_object(
          'hoerbuch',
          coalesce(s.idee->'hoerbuch', '{}'::jsonb)
          || jsonb_build_object(
            'tracks',
            coalesce(
              (
                select jsonb_agg(
                  (tr - 'text')
                  || jsonb_build_object(
                    'text', left(coalesce(tr->>'text', ''), 280),
                    'charCount',
                    coalesce(
                      nullif(tr->>'charCount', '')::int,
                      length(coalesce(tr->>'text', ''))
                    )
                  )
                  order by ordinality
                )
                from jsonb_array_elements(
                  s.idee->'hoerbuch'->'tracks'
                ) with ordinality as x(tr, ordinality)
              ),
              '[]'::jsonb
            )
          )
        )
      else s.idee
    end as idee,
    s.evidenz,
    s.makro,
    s.suggested_title,
    s.subtitle,
    s.summary,
    s.keywords,
    s.autor_name,
    s.vorsatz,
    case
      when nullif(trim(s.cover_image_data_url), '') is null then ''
      else '__has_cover__'
    end as cover_image_data_url,
    left(coalesce(s.cover_prompt, ''), 2000) as cover_prompt,
    s.created_at,
    s.updated_at
  from leseno.sachbuch_kontext s
  where s.id = p_id;
$$;

revoke all on function public.admin_get_sachbuch_kontext_shell(uuid) from public;
grant execute on function public.admin_get_sachbuch_kontext_shell(uuid) to service_role;
