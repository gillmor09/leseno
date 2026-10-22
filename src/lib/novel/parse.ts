/**
 * Map Supabase RPC / JSON rows → domain types.
 */

import { parseAbnahmeJson } from "@/lib/novel/abnahme";
import {
  normalizeScenePlan,
  parseChapterContract,
} from "@/lib/novel/chapter-contract";
import type {
  ChapterStatus,
  EditorFeedback,
  KnowledgeGraph,
  Novel,
  NovelBundle,
  NovelChapter,
  NovelCharacterRow,
  NovelIdeaInterviewMessage,
  NovelIdeaStatus,
  NovelLocationRow,
  NovelPilotMode,
  NovelScene,
  NovelSceneState,
  NovelStatus,
  NovelSummary,
  OrchestratorStatus,
  SceneStatus,
  StyleGuide,
  WorldBuilding,
} from "@/lib/novel/types";

function asRecord(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === "object" && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : {};
}

function asString(raw: unknown, fallback = ""): string {
  return typeof raw === "string" ? raw : fallback;
}

function asNumber(raw: unknown, fallback = 0): number {
  const n = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

export function parseOrchestratorStatus(raw: unknown): OrchestratorStatus {
  const r = asRecord(raw);
  const phase = asString(r.phase, "idle");
  const allowed: OrchestratorStatus["phase"][] = [
    "idle",
    "architect_acts",
    "architect_chapters",
    "architect_manifests",
    "skeleton_audit_acts",
    "skeleton_audit_chapters",
    "skeleton_audit_manifests",
    "state_slice",
    "scene_draft",
    "logic_audit",
    "style_polish",
    "state_commit",
    "chapter_audit",
    "chapter_revise",
    "scene_dispatch",
    "prose_pending",
    "compile_prose_briefs",
    "completed",
    "error",
    // legacy sequential (map to idle if unknown handled below)
    "style_guide",
    "voice_discovery",
    "world_building",
    "outline",
    "scene_briefing",
    "scene_review",
    "scene_revise",
    "scene_tic_scrub",
    "scene_commit",
    "formel_tic_scrub",
  ];
  return {
    phase: (allowed.includes(phase as OrchestratorStatus["phase"])
      ? phase
      : "idle") as OrchestratorStatus["phase"],
    label: asString(r.label, "Bereit"),
    chapterNumber:
      r.chapterNumber == null ? null : asNumber(r.chapterNumber, 0) || null,
    sceneId: r.sceneId == null ? null : asString(r.sceneId) || null,
    iteration: r.iteration == null ? null : asNumber(r.iteration, 0) || null,
    step: r.step == null ? null : asString(r.step),
    error: r.error == null ? null : asString(r.error),
    haltReason:
      r.haltReason === "quality_gate" ||
      r.haltReason === "manual_pause" ||
      r.haltReason === "skeleton_gate" ||
      r.haltReason === "structure_gate" ||
      r.haltReason === "logic_gate" ||
      r.haltReason === "chapter_gate" ||
      r.haltReason === "pipeline_stall"
        ? r.haltReason
        : null,
    updatedAt: asString(r.updatedAt) || undefined,
  };
}

function parsePilotMode(raw: unknown): NovelPilotMode {
  return raw === "pause_after_scene" ? "pause_after_scene" : "auto";
}

function parseIdeaStatus(raw: unknown): NovelIdeaStatus {
  return raw === "interview" ? "interview" : "ready";
}

function parseIdeaInterview(raw: unknown): NovelIdeaInterviewMessage[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return null;
      const o = item as Record<string, unknown>;
      const role = o.role === "user" ? "user" : "assistant";
      const content = asString(o.content).trim();
      if (!content) return null;
      return {
        id: asString(o.id) || crypto.randomUUID(),
        role,
        content,
        createdAt: asString(o.createdAt ?? o.created_at) || new Date().toISOString(),
      } satisfies NovelIdeaInterviewMessage;
    })
    .filter((m): m is NovelIdeaInterviewMessage => Boolean(m));
}

export function mapNovelRow(row: Record<string, unknown>): Novel {
  const keywordsRaw = row.keywords;
  const keywords = Array.isArray(keywordsRaw)
    ? keywordsRaw.map((k) => String(k).trim()).filter(Boolean)
    : [];
  const vorsatzRaw = row.vorsatz;
  return {
    id: asString(row.id),
    title: asString(row.title, "Unbenannter Roman"),
    highConceptIdea: asString(
      row.high_concept_idea ?? row.highConceptIdea,
    ),
    status: asString(row.status, "draft") as NovelStatus,
    orchestratorStatus: parseOrchestratorStatus(
      row.orchestrator_status ?? row.orchestratorStatus,
    ),
    ideaStatus: parseIdeaStatus(row.idea_status ?? row.ideaStatus),
    ideaInterview: parseIdeaInterview(
      row.idea_interview ?? row.ideaInterview,
    ),
    pilotMode: parsePilotMode(row.pilot_mode ?? row.pilotMode),
    skeleton: asRecord(row.skeleton),
    skeletonFrozen: Boolean(row.skeleton_frozen ?? row.skeletonFrozen),
    stateMatrix: asRecord(row.state_matrix ?? row.stateMatrix),
    subtitle: asString(row.subtitle),
    summary: asString(row.summary),
    keywords,
    autorName: asString(row.autor_name ?? row.autorName, "Jannis Fynk"),
    vorsatz:
      vorsatzRaw && typeof vorsatzRaw === "object"
        ? (vorsatzRaw as Record<string, unknown>)
        : null,
    coverImageDataUrl: asString(
      row.cover_image_data_url ?? row.coverImageDataUrl,
    ),
    coverPrompt: asString(row.cover_prompt ?? row.coverPrompt),
    abnahme: parseAbnahmeJson(row.abnahme),
    createdAt: asString(row.created_at ?? row.createdAt),
    updatedAt: asString(row.updated_at ?? row.updatedAt),
  };
}

export function mapNovelSummary(row: Record<string, unknown>): NovelSummary {
  return {
    ...mapNovelRow(row),
    chapterCount: asNumber(row.chapter_count ?? row.chapterCount, 0),
  };
}

export function mapStyleGuide(row: Record<string, unknown>): StyleGuide {
  return {
    novelId: asString(row.novel_id ?? row.novelId),
    genre: asString(row.genre),
    subgenre: asString(row.subgenre),
    primaryTone: asString(row.primary_tone ?? row.primaryTone),
    narrativePerspective: asString(
      row.narrative_perspective ?? row.narrativePerspective,
    ),
    styleRules: asRecord(row.style_rules ?? row.styleRules),
    createdAt: asString(row.created_at ?? row.createdAt),
    updatedAt: asString(row.updated_at ?? row.updatedAt),
  };
}

export function mapWorldBuilding(row: Record<string, unknown>): WorldBuilding {
  const characters = Array.isArray(row.characters) ? row.characters : [];
  return {
    novelId: asString(row.novel_id ?? row.novelId),
    characters: characters as WorldBuilding["characters"],
    loreRules: Array.isArray(row.lore_rules ?? row.loreRules)
      ? ((row.lore_rules ?? row.loreRules) as unknown[])
      : [],
    locations: Array.isArray(row.locations) ? (row.locations as unknown[]) : [],
    createdAt: asString(row.created_at ?? row.createdAt),
    updatedAt: asString(row.updated_at ?? row.updatedAt),
  };
}

export function mapKnowledgeGraph(row: Record<string, unknown>): KnowledgeGraph {
  return {
    novelId: asString(row.novel_id ?? row.novelId),
    entityStates: asRecord(row.entity_states ?? row.entityStates),
    timelineEvents: Array.isArray(row.timeline_events ?? row.timelineEvents)
      ? ((row.timeline_events ?? row.timelineEvents) as unknown[])
      : [],
    createdAt: asString(row.created_at ?? row.createdAt),
    updatedAt: asString(row.updated_at ?? row.updatedAt),
  };
}

export function mapChapter(row: Record<string, unknown>): NovelChapter {
  const plan = row.scene_plan ?? row.scenePlan;
  const chapterNumber = asNumber(row.chapter_number ?? row.chapterNumber, 1);
  return {
    id: asString(row.id),
    novelId: asString(row.novel_id ?? row.novelId),
    chapterNumber,
    title: asString(row.title),
    outline: asString(row.outline),
    contract: parseChapterContract(row.contract),
    scenePlan: Array.isArray(plan)
      ? normalizeScenePlan(plan)
      : [],
    rawDraft: asString(row.raw_draft ?? row.rawDraft),
    finalText: asString(row.final_text ?? row.finalText),
    status: asString(row.status, "planned") as ChapterStatus,
    createdAt: asString(row.created_at ?? row.createdAt),
    updatedAt: asString(row.updated_at ?? row.updatedAt),
  };
}

export function mapFeedback(row: Record<string, unknown>): EditorFeedback {
  const issues = row.issues;
  return {
    id: asString(row.id),
    chapterId: asString(row.chapter_id ?? row.chapterId),
    iteration: asNumber(row.iteration, 1),
    score: asNumber(row.score, 0),
    toneAlignmentScore: asNumber(
      row.tone_alignment_score ?? row.toneAlignmentScore,
      0,
    ),
    issues: Array.isArray(issues)
      ? issues.map((x) => String(x))
      : [],
    approved: Boolean(row.approved),
    createdAt: asString(row.created_at ?? row.createdAt),
  };
}

export function mapScene(row: Record<string, unknown>): NovelScene {
  const chars = row.characters;
  const feedback = row.feedback;
  return {
    id: asString(row.id),
    novelId: asString(row.novel_id ?? row.novelId),
    chapterId: asString(row.chapter_id ?? row.chapterId),
    sceneIndex: asNumber(row.scene_index ?? row.sceneIndex, 1),
    status: asString(row.status, "pending") as SceneStatus,
    planSummary: asString(row.plan_summary ?? row.planSummary),
    location: asString(row.location),
    characters: Array.isArray(chars)
      ? chars.map((c) => String(c)).filter(Boolean)
      : [],
    briefing: asString(row.briefing),
    manifest: asRecord(row.manifest),
    rawText: asString(row.raw_text ?? row.rawText),
    finalText: asString(row.final_text ?? row.finalText),
    summary: asString(row.summary),
    score: asNumber(row.score, 0),
    feedback: Array.isArray(feedback)
      ? feedback.map((f) => String(f))
      : [],
    logicNotes: asString(row.logic_notes ?? row.logicNotes),
    iteration: asNumber(row.iteration, 0),
    createdAt: asString(row.created_at ?? row.createdAt),
    updatedAt: asString(row.updated_at ?? row.updatedAt),
  };
}

export function mapSceneState(row: Record<string, unknown>): NovelSceneState {
  return {
    sceneId: asString(row.scene_id ?? row.sceneId),
    novelId: asString(row.novel_id ?? row.novelId),
    state: asRecord(row.state),
    createdAt: asString(row.created_at ?? row.createdAt),
    updatedAt: asString(row.updated_at ?? row.updatedAt),
  };
}

export function mapNovelCharacter(row: Record<string, unknown>): NovelCharacterRow {
  return {
    id: asString(row.id),
    novelId: asString(row.novel_id ?? row.novelId),
    name: asString(row.name),
    role: asString(row.role),
    summary: asString(row.summary),
    facts: asRecord(row.facts),
    sortIndex: asNumber(row.sort_index ?? row.sortIndex, 0),
  };
}

export function mapNovelLocation(row: Record<string, unknown>): NovelLocationRow {
  return {
    id: asString(row.id),
    novelId: asString(row.novel_id ?? row.novelId),
    name: asString(row.name),
    summary: asString(row.summary),
    facts: asRecord(row.facts),
    sortIndex: asNumber(row.sort_index ?? row.sortIndex, 0),
  };
}

export function mapNovelBundle(raw: unknown): NovelBundle | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const novelRaw = r.novel;
  if (!novelRaw || typeof novelRaw !== "object") return null;
  const style = r.style_guide ?? r.styleGuide;
  const world = r.world_building ?? r.worldBuilding;
  const kg = r.knowledge_graph ?? r.knowledgeGraph;
  const chapters = Array.isArray(r.chapters) ? r.chapters : [];
  const scenes = Array.isArray(r.scenes) ? r.scenes : [];
  const sceneStates = Array.isArray(r.scene_states ?? r.sceneStates)
    ? ((r.scene_states ?? r.sceneStates) as unknown[])
    : [];
  const characters = Array.isArray(r.characters) ? r.characters : [];
  const locations = Array.isArray(r.locations) ? r.locations : [];
  const feedbacks = Array.isArray(r.editor_feedbacks ?? r.editorFeedbacks)
    ? ((r.editor_feedbacks ?? r.editorFeedbacks) as unknown[])
    : [];
  return {
    novel: mapNovelRow(novelRaw as Record<string, unknown>),
    styleGuide:
      style && typeof style === "object"
        ? mapStyleGuide(style as Record<string, unknown>)
        : null,
    worldBuilding:
      world && typeof world === "object"
        ? mapWorldBuilding(world as Record<string, unknown>)
        : null,
    knowledgeGraph:
      kg && typeof kg === "object"
        ? mapKnowledgeGraph(kg as Record<string, unknown>)
        : null,
    chapters: chapters.map((c) => mapChapter(c as Record<string, unknown>)),
    scenes: scenes.map((s) => mapScene(s as Record<string, unknown>)),
    sceneStates: sceneStates.map((s) =>
      mapSceneState(s as Record<string, unknown>),
    ),
    characters: characters.map((c) =>
      mapNovelCharacter(c as Record<string, unknown>),
    ),
    locations: locations.map((l) =>
      mapNovelLocation(l as Record<string, unknown>),
    ),
    editorFeedbacks: feedbacks.map((f) =>
      mapFeedback(f as Record<string, unknown>),
    ),
  };
}
