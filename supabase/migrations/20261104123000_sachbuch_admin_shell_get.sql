-- Admin detail must not pull multi-MB cover / Infografik data URLs.
-- Prose + pixels load on demand via kapitel-body / export routes.

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
    s.idee,
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

-- Also slim the list RPC (same as 20261104120000; safe to re-run).
drop function if exists public.admin_list_sachbuch_kontexte();
create or replace function public.admin_list_sachbuch_kontexte()
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
  kapitel_count int,
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
    ''::text as stilbibel,
    ''::text as zielgruppe,
    '{}'::jsonb as agents,
    '[]'::jsonb as kapitel,
    coalesce(s.idee, '{}'::jsonb) as idee,
    '{}'::jsonb as evidenz,
    '{}'::jsonb as makro,
    coalesce(jsonb_array_length(s.kapitel), 0)::int as kapitel_count,
    s.created_at,
    s.updated_at
  from leseno.sachbuch_kontext s
  order by s.updated_at desc;
$$;

revoke all on function public.admin_list_sachbuch_kontexte() from public;
grant execute on function public.admin_list_sachbuch_kontexte() to service_role;
