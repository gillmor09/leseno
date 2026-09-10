-- Public sample stories for the marketing pinboard (/beispiele).
-- Only stories shared as Öffentlich (`book_club_share = 'public'`).

create or replace function public.list_public_story_samples(
  p_limit integer default 12
)
returns table (
  id uuid,
  title text,
  story_html text,
  facts jsonb,
  school_stage text,
  mood text,
  topic text,
  topic_secondary text,
  topic_seed_source text,
  personal_mode boolean,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public, leseno
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 12), 1), 24);
begin
  return query
  select
    s.id,
    s.title,
    s.story_html,
    s.facts,
    s.school_stage,
    s.mood,
    s.topic,
    s.topic_secondary,
    s.topic_seed_source,
    s.personal_mode,
    s.created_at
  from leseno.user_stories as s
  where s.book_club_share = 'public'
    and length(trim(coalesce(s.story_html, ''))) > 80
  order by random()
  limit v_limit;
end;
$$;

comment on function public.list_public_story_samples(integer) is
  'Random Öffentlich book-club stories for the public Beispiele pinboard.';

revoke all on function public.list_public_story_samples(integer) from public;
grant execute on function public.list_public_story_samples(integer)
  to anon, authenticated, service_role;
