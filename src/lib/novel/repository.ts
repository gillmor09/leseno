/**
 * Service-role access for greenfield Roman (`leseno.novels` + related).
 */

import {
  mapNovelBundle,
  mapNovelSummary,
} from "@/lib/novel/parse";
import type {
  KnowledgeGraph,
  NovelBundle,
  NovelChapter,
  NovelIdeaInterviewMessage,
  NovelIdeaStatus,
  NovelPilotMode,
  NovelScene,
  NovelSummary,
  OrchestratorStatus,
  StyleGuide,
  WorldBuilding,
} from "@/lib/novel/types";
import { createServiceClient } from "@/lib/supabase/service";

export async function listNovels(): Promise<NovelSummary[]> {
  const supabase = createServiceClient(null);
  const { data, error } = await supabase.rpc("admin_list_novels");
  if (error) throw new Error(error.message);
  return ((data ?? []) as Record<string, unknown>[]).map(mapNovelSummary);
}

export async function getNovelBundle(
  id: string,
): Promise<NovelBundle | null> {
  const supabase = createServiceClient(null);
  const { data, error } = await supabase.rpc("admin_get_novel", {
    p_id: id,
  });
  if (error) throw new Error(error.message);
  return mapNovelBundle(data);
}

export async function createNovel(input: {
  title: string;
  highConceptIdea: string;
  ideaStatus?: NovelIdeaStatus;
}): Promise<NovelBundle> {
  const supabase = createServiceClient(null);
  const { data: id, error } = await supabase.rpc("admin_create_novel", {
    p_title: input.title.trim() || "Unbenannter Roman",
    p_high_concept_idea: input.highConceptIdea.trim(),
    p_idea_status: input.ideaStatus ?? "ready",
  });
  if (error) throw new Error(error.message);
  const bundle = await getNovelBundle(String(id));
  if (!bundle) throw new Error("Roman nach dem Anlegen nicht gefunden.");
  return bundle;
}

export async function updateNovel(input: {
  id: string;
  title?: string;
  highConceptIdea?: string;
  status?: string;
  orchestratorStatus?: OrchestratorStatus;
  ideaStatus?: NovelIdeaStatus;
  ideaInterview?: NovelIdeaInterviewMessage[];
  pilotMode?: NovelPilotMode;
  skeleton?: Record<string, unknown>;
  skeletonFrozen?: boolean;
  stateMatrix?: Record<string, unknown>;
}): Promise<void> {
  const supabase = createServiceClient(null);
  const args: Record<string, unknown> = {
    p_id: input.id,
    p_title: input.title ?? null,
    p_high_concept_idea: input.highConceptIdea ?? null,
    p_status: input.status ?? null,
    p_orchestrator_status: input.orchestratorStatus ?? null,
  };
  if (input.ideaStatus !== undefined) {
    args.p_idea_status = input.ideaStatus;
  }
  if (input.ideaInterview !== undefined) {
    args.p_idea_interview = input.ideaInterview;
  }
  if (input.pilotMode !== undefined) {
    args.p_pilot_mode = input.pilotMode;
  }
  if (input.skeleton !== undefined) {
    args.p_skeleton = input.skeleton;
  }
  if (input.skeletonFrozen !== undefined) {
    args.p_skeleton_frozen = input.skeletonFrozen;
  }
  if (input.stateMatrix !== undefined) {
    args.p_state_matrix = input.stateMatrix;
  }
  const { error } = await supabase.rpc("admin_update_novel", args);
  if (error) throw new Error(error.message);
}

export async function setOrchestratorStatus(
  novelId: string,
  status: OrchestratorStatus,
  novelStatus?: string,
): Promise<void> {
  await updateNovel({
    id: novelId,
    status: novelStatus,
    orchestratorStatus: {
      ...status,
      updatedAt: new Date().toISOString(),
    },
  });
}

export async function upsertStyleGuide(guide: StyleGuide): Promise<void> {
  const supabase = createServiceClient(null);
  const { error } = await supabase.rpc("admin_upsert_style_guide", {
    p_novel_id: guide.novelId,
    p_genre: guide.genre,
    p_subgenre: guide.subgenre,
    p_primary_tone: guide.primaryTone,
    p_narrative_perspective: guide.narrativePerspective,
    p_style_rules: guide.styleRules,
  });
  if (error) throw new Error(error.message);
}

export async function upsertWorldBuilding(world: WorldBuilding): Promise<void> {
  const supabase = createServiceClient(null);
  const { error } = await supabase.rpc("admin_upsert_world_building", {
    p_novel_id: world.novelId,
    p_characters: world.characters,
    p_lore_rules: world.loreRules,
    p_locations: world.locations,
  });
  if (error) throw new Error(error.message);
  // Mirror into normalized tables for scene grounding / RAG context.
  await replaceNovelCharacters(world.novelId, world.characters);
  await replaceNovelLocations(world.novelId, world.locations);
}

export async function replaceNovelCharacters(
  novelId: string,
  characters: WorldBuilding["characters"],
): Promise<void> {
  const supabase = createServiceClient(null);
  const { error } = await supabase.rpc("admin_replace_novel_characters", {
    p_novel_id: novelId,
    p_characters: characters,
  });
  if (error) throw new Error(error.message);
}

export async function replaceNovelLocations(
  novelId: string,
  locations: unknown[],
): Promise<void> {
  const supabase = createServiceClient(null);
  const { error } = await supabase.rpc("admin_replace_novel_locations", {
    p_novel_id: novelId,
    p_locations: locations,
  });
  if (error) throw new Error(error.message);
}

export async function upsertKnowledgeGraph(
  kg: Pick<KnowledgeGraph, "novelId" | "entityStates" | "timelineEvents">,
): Promise<void> {
  const supabase = createServiceClient(null);
  const { error } = await supabase.rpc("admin_upsert_knowledge_graph", {
    p_novel_id: kg.novelId,
    p_entity_states: kg.entityStates,
    p_timeline_events: kg.timelineEvents,
  });
  if (error) throw new Error(error.message);
}

/**
 * Delete chapters with number > maxChapterNumber (cascade feedbacks).
 * Used by short re-run after a condensed outline.
 */
export async function deleteChaptersAboveNumber(
  novelId: string,
  maxChapterNumber: number,
): Promise<number> {
  // leseno schema is not exposed to PostgREST — delete via public RPC.
  // Migration: supabase/migrations/20261017170000_leseno_novels_delete_chapters_above.sql
  const supabase = createServiceClient(null);
  const { data, error } = await supabase.rpc("admin_delete_chapters_above", {
    p_novel_id: novelId,
    p_max_chapter_number: maxChapterNumber,
  });
  if (error) {
    const missing =
      /schema cache|Could not find the function/i.test(error.message) ||
      error.code === "PGRST202";
    throw new Error(
      missing
        ? "RPC admin_delete_chapters_above fehlt in der Datenbank. Migration 20261017170000_leseno_novels_delete_chapters_above.sql im Supabase-SQL-Editor ausführen, danach Short-Re-Run erneut."
        : error.message,
    );
  }
  const n = Number(data);
  return Number.isFinite(n) ? n : 0;
}

export async function upsertChapter(
  chapter: Partial<NovelChapter> & {
    novelId: string;
    chapterNumber: number;
  },
): Promise<string> {
  const supabase = createServiceClient(null);
  // Omit p_contract when null → PostgREST hits 9-arg overload (leaves contract).
  // Pass object only when setting/replacing from outline.
  const args: Record<string, unknown> = {
    p_id: chapter.id ?? null,
    p_novel_id: chapter.novelId,
    p_chapter_number: chapter.chapterNumber,
    p_title: chapter.title ?? "",
    p_outline: chapter.outline ?? "",
    p_scene_plan: chapter.scenePlan ?? [],
    p_raw_draft: chapter.rawDraft ?? "",
    p_final_text: chapter.finalText ?? "",
    p_status: chapter.status ?? "planned",
  };
  if (chapter.contract) {
    args.p_contract = chapter.contract;
  }
  const { data: id, error } = await supabase.rpc("admin_upsert_chapter", args);
  if (error) throw new Error(error.message);
  return String(id);
}

export async function insertEditorFeedback(input: {
  chapterId: string;
  iteration: number;
  score: number;
  toneAlignmentScore: number;
  issues: string[];
  approved: boolean;
}): Promise<string> {
  const supabase = createServiceClient(null);
  const { data: id, error } = await supabase.rpc(
    "admin_insert_editor_feedback",
    {
      p_chapter_id: input.chapterId,
      p_iteration: input.iteration,
      p_score: input.score,
      p_tone_alignment_score: input.toneAlignmentScore,
      p_issues: input.issues,
      p_approved: input.approved,
    },
  );
  if (error) throw new Error(error.message);
  return String(id);
}

export async function deleteNovel(id: string): Promise<void> {
  const supabase = createServiceClient(null);
  const { error } = await supabase.rpc("admin_delete_novel", { p_id: id });
  if (error) throw new Error(error.message);
}

export async function upsertNovelExport(input: {
  id: string;
  subtitle?: string;
  summary?: string;
  keywords?: string[];
  autorName?: string;
  vorsatz?: Record<string, unknown> | null;
  coverImageDataUrl?: string;
  coverPrompt?: string;
}): Promise<void> {
  const supabase = createServiceClient(null);
  const { error } = await supabase.rpc("admin_upsert_novel_export", {
    p_id: input.id,
    p_subtitle: input.subtitle ?? null,
    p_summary: input.summary ?? null,
    p_keywords: input.keywords ?? null,
    p_autor_name: input.autorName ?? null,
    p_vorsatz: input.vorsatz ?? null,
    p_cover_image_data_url: input.coverImageDataUrl ?? null,
    p_cover_prompt: input.coverPrompt ?? null,
  });
  if (error) throw new Error(error.message);
}

export async function upsertNovelAbnahme(
  id: string,
  abnahme: Record<string, unknown>,
): Promise<void> {
  const supabase = createServiceClient(null);
  const { error } = await supabase.rpc("admin_upsert_novel_abnahme", {
    p_id: id,
    p_abnahme: abnahme,
  });
  if (error) throw new Error(error.message);
}

export async function upsertScene(
  scene: Partial<NovelScene> & {
    novelId: string;
    chapterId: string;
    sceneIndex: number;
  },
): Promise<string> {
  const supabase = createServiceClient(null);
  const { data: id, error } = await supabase.rpc("admin_upsert_scene", {
    p_id: scene.id ?? null,
    p_novel_id: scene.novelId,
    p_chapter_id: scene.chapterId,
    p_scene_index: scene.sceneIndex,
    p_status: scene.status ?? null,
    p_plan_summary: scene.planSummary ?? null,
    p_location: scene.location ?? null,
    p_characters: scene.characters ?? null,
    p_briefing: scene.briefing ?? null,
    p_raw_text: scene.rawText ?? null,
    p_final_text: scene.finalText ?? null,
    p_summary: scene.summary ?? null,
    p_score: scene.score ?? null,
    p_feedback: scene.feedback ?? null,
    p_iteration: scene.iteration ?? null,
    p_manifest: scene.manifest ?? null,
    p_logic_notes: scene.logicNotes ?? null,
  });
  if (error) throw new Error(error.message);
  return String(id);
}

export async function upsertSceneState(input: {
  sceneId: string;
  novelId: string;
  state: Record<string, unknown>;
}): Promise<void> {
  const supabase = createServiceClient(null);
  const { error } = await supabase.rpc("admin_upsert_scene_state", {
    p_scene_id: input.sceneId,
    p_novel_id: input.novelId,
    p_state: input.state,
  });
  if (error) throw new Error(error.message);
}

export async function upsertSceneEmbedding(input: {
  sceneId: string;
  novelId: string;
  summaryText: string;
  embedding: number[];
}): Promise<void> {
  const supabase = createServiceClient(null);
  // pgvector via PostgREST: pass as `[…]` literal string.
  const embeddingLiteral = `[${input.embedding.join(",")}]`;
  const { error } = await supabase.rpc("admin_upsert_scene_embedding", {
    p_scene_id: input.sceneId,
    p_novel_id: input.novelId,
    p_summary_text: input.summaryText,
    p_embedding: embeddingLiteral,
  });
  if (error) throw new Error(error.message);
}

export async function matchSceneEmbeddings(input: {
  novelId: string;
  queryEmbedding: number[];
  matchCount?: number;
  excludeSceneId?: string;
}): Promise<
  Array<{
    sceneId: string;
    chapterId: string;
    sceneIndex: number;
    summaryText: string;
    similarity: number;
  }>
> {
  const supabase = createServiceClient(null);
  const embeddingLiteral = `[${input.queryEmbedding.join(",")}]`;
  const { data, error } = await supabase.rpc("admin_match_scene_embeddings", {
    p_novel_id: input.novelId,
    p_query_embedding: embeddingLiteral,
    p_match_count: input.matchCount ?? 5,
    p_exclude_scene_id: input.excludeSceneId ?? null,
  });
  if (error) throw new Error(error.message);
  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    sceneId: String(row.scene_id ?? row.sceneId ?? ""),
    chapterId: String(row.chapter_id ?? row.chapterId ?? ""),
    sceneIndex: Number(row.scene_index ?? row.sceneIndex ?? 0),
    summaryText: String(row.summary_text ?? row.summaryText ?? ""),
    similarity: Number(row.similarity ?? 0),
  }));
}

export async function deleteNovelScenes(novelId: string): Promise<number> {
  const supabase = createServiceClient(null);
  const { data, error } = await supabase.rpc("admin_delete_novel_scenes", {
    p_novel_id: novelId,
  });
  if (error) throw new Error(error.message);
  const n = Number(data);
  return Number.isFinite(n) ? n : 0;
}

export async function upsertPyramidEmbedding(input: {
  novelId: string;
  nodeId: string;
  layer: string;
  summaryText: string;
  embedding: number[];
}): Promise<void> {
  const supabase = createServiceClient(null);
  const embeddingLiteral = `[${input.embedding.join(",")}]`;
  const { error } = await supabase.rpc("admin_upsert_pyramid_embedding", {
    p_novel_id: input.novelId,
    p_node_id: input.nodeId,
    p_layer: input.layer,
    p_summary_text: input.summaryText,
    p_embedding: embeddingLiteral,
  });
  if (error) throw new Error(error.message);
}

export async function matchPyramidEmbeddings(input: {
  novelId: string;
  queryEmbedding: number[];
  matchCount?: number;
  maxLayer?: string;
  excludeNodeId?: string;
}): Promise<
  Array<{
    nodeId: string;
    layer: string;
    summaryText: string;
    similarity: number;
  }>
> {
  const supabase = createServiceClient(null);
  const embeddingLiteral = `[${input.queryEmbedding.join(",")}]`;
  const { data, error } = await supabase.rpc("admin_match_pyramid_embeddings", {
    p_novel_id: input.novelId,
    p_query_embedding: embeddingLiteral,
    p_match_count: input.matchCount ?? 8,
    p_max_layer: input.maxLayer ?? null,
    p_exclude_node_id: input.excludeNodeId ?? null,
  });
  if (error) throw new Error(error.message);
  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    nodeId: String(row.node_id ?? row.nodeId ?? ""),
    layer: String(row.layer ?? ""),
    summaryText: String(row.summary_text ?? row.summaryText ?? ""),
    similarity: Number(row.similarity ?? 0),
  }));
}

export async function deletePyramidEmbeddingsFromLayer(
  novelId: string,
  fromLayer: string,
): Promise<number> {
  const supabase = createServiceClient(null);
  const { data, error } = await supabase.rpc(
    "admin_delete_pyramid_embeddings_from_layer",
    {
      p_novel_id: novelId,
      p_from_layer: fromLayer,
    },
  );
  if (error) throw new Error(error.message);
  const n = Number(data);
  return Number.isFinite(n) ? n : 0;
}
