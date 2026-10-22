-- Pyramid contract embeddings (pgvector): mirror Top-Down layers for retrieval
-- at architect hops and final prose-prompt compile. Distinct from scene_embeddings
-- (prose summaries). Migration: run in Supabase SQL editor if Coolify does not.

create table if not exists leseno.pyramid_embeddings (
  node_id text not null,
  novel_id uuid not null references leseno.novels (id) on delete cascade,
  layer text not null,
  summary_text text not null default '',
  embedding extensions.vector(1536) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (novel_id, node_id)
);

create index if not exists pyramid_embeddings_novel_id_idx
  on leseno.pyramid_embeddings (novel_id);

create index if not exists pyramid_embeddings_layer_idx
  on leseno.pyramid_embeddings (novel_id, layer);

create index if not exists pyramid_embeddings_embedding_idx
  on leseno.pyramid_embeddings
  using hnsw (embedding extensions.vector_cosine_ops);

drop trigger if exists pyramid_embeddings_set_updated_at on leseno.pyramid_embeddings;
create trigger pyramid_embeddings_set_updated_at
before update on leseno.pyramid_embeddings
for each row
execute function leseno.set_updated_at();

alter table leseno.pyramid_embeddings enable row level security;
revoke all on table leseno.pyramid_embeddings from anon, authenticated;
grant all on table leseno.pyramid_embeddings to service_role;

create or replace function public.admin_upsert_pyramid_embedding(
  p_novel_id uuid,
  p_node_id text,
  p_layer text,
  p_summary_text text,
  p_embedding extensions.vector(1536)
)
returns void
language plpgsql
security definer
set search_path = leseno, public, extensions
as $$
begin
  insert into leseno.pyramid_embeddings (
    novel_id, node_id, layer, summary_text, embedding
  )
  values (
    p_novel_id,
    p_node_id,
    coalesce(nullif(trim(p_layer), ''), 'scenes'),
    coalesce(p_summary_text, ''),
    p_embedding
  )
  on conflict (novel_id, node_id) do update set
    layer = excluded.layer,
    summary_text = excluded.summary_text,
    embedding = excluded.embedding;
end;
$$;

revoke all on function public.admin_upsert_pyramid_embedding(uuid, text, text, text, extensions.vector) from public;
grant execute on function public.admin_upsert_pyramid_embedding(uuid, text, text, text, extensions.vector) to service_role;

create or replace function public.admin_match_pyramid_embeddings(
  p_novel_id uuid,
  p_query_embedding extensions.vector(1536),
  p_match_count int default 8,
  p_max_layer text default null,
  p_exclude_node_id text default null
)
returns table (
  node_id text,
  layer text,
  summary_text text,
  similarity float
)
language sql
stable
security definer
set search_path = leseno, public, extensions
as $$
  select
    e.node_id,
    e.layer,
    e.summary_text,
    (1 - (e.embedding <=> p_query_embedding))::float as similarity
  from leseno.pyramid_embeddings e
  where e.novel_id = p_novel_id
    and (p_exclude_node_id is null or e.node_id <> p_exclude_node_id)
    and (
      p_max_layer is null
      or case e.layer
        when 'idea' then 0
        when 'acts' then 1
        when 'chapters' then 2
        when 'scenes' then 3
        when 'situations' then 4
        else 9
      end
      <=
      case p_max_layer
        when 'idea' then 0
        when 'acts' then 1
        when 'chapters' then 2
        when 'scenes' then 3
        when 'situations' then 4
        else 9
      end
    )
  order by e.embedding <=> p_query_embedding
  limit greatest(1, least(coalesce(p_match_count, 8), 24));
$$;

revoke all on function public.admin_match_pyramid_embeddings(uuid, extensions.vector, int, text, text) from public;
grant execute on function public.admin_match_pyramid_embeddings(uuid, extensions.vector, int, text, text) to service_role;

create or replace function public.admin_delete_pyramid_embeddings_from_layer(
  p_novel_id uuid,
  p_from_layer text
)
returns int
language plpgsql
security definer
set search_path = leseno, public
as $$
declare
  v_rank int;
  v_count int;
begin
  v_rank := case coalesce(nullif(trim(p_from_layer), ''), 'scenes')
    when 'idea' then 0
    when 'acts' then 1
    when 'chapters' then 2
    when 'scenes' then 3
    when 'situations' then 4
    else 3
  end;
  delete from leseno.pyramid_embeddings e
  where e.novel_id = p_novel_id
    and case e.layer
      when 'idea' then 0
      when 'acts' then 1
      when 'chapters' then 2
      when 'scenes' then 3
      when 'situations' then 4
      else 9
    end >= v_rank;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.admin_delete_pyramid_embeddings_from_layer(uuid, text) from public;
grant execute on function public.admin_delete_pyramid_embeddings_from_layer(uuid, text) to service_role;
