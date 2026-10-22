/**
 * Top-Down Roman (Architect → State → Draft → Logic → Style) — domain types.
 * DB: `leseno.novels` + related (see `20261020210000_leseno_novels_top_down.sql`).
 */

export type NovelStatus =
  | "draft"
  | "setup"
  | "outlining"
  | "writing"
  | "paused"
  | "completed"
  | "error";

export type ChapterStatus =
  | "planned"
  | "scene_planning"
  | "drafting"
  | "reviewing"
  | "approved"
  | "approved_with_warnings"
  | "error";

/** Auto-pilot vs pause after each approved scene (HITL). */
export type NovelPilotMode = "auto" | "pause_after_scene";

export type SceneStatus =
  | "pending"
  | "briefing"
  | "drafting"
  | "auditing"
  | "polishing"
  | "reviewing"
  | "approved"
  | "error";

/** Persisted live label for Progress / Realtime. */
export type OrchestratorStatus = {
  phase:
    | "idle"
    | "architect_acts"
    | "architect_chapters"
    | "architect_manifests"
    | "skeleton_audit_acts"
    | "skeleton_audit_chapters"
    | "skeleton_audit_manifests"
    | "state_slice"
    | "scene_draft"
    | "logic_audit"
    | "style_polish"
    | "scene_tic_scrub"
    | "state_commit"
    | "chapter_audit"
    | "chapter_revise"
    | "scene_dispatch"
    | "prose_pending"
    | "compile_prose_briefs"
    | "completed"
    | "error"
    /** @deprecated sequential pipeline — ignored by new orchestrator */
    | "style_guide"
    | "voice_discovery"
    | "world_building"
    | "outline"
    | "scene_briefing"
    | "scene_review"
    | "scene_revise"
    | "scene_commit"
    | "formel_tic_scrub";
  label: string;
  chapterNumber?: number | null;
  sceneId?: string | null;
  iteration?: number | null;
  /** Next hop cursor for self-kick. */
  step?: string | null;
  error?: string | null;
  /**
   * Clean stop (not a crash): UI shows action choices.
   * skeleton_gate = wait for human freeze; structure_gate = acts/chapters/manifests audit failed;
   * logic_gate = max logic rewrites failed; chapter_gate = chapter dramaturgy audit failed;
   * pipeline_stall = self-kick/hop chain broke — auto-resume / Fortsetzen.
   */
  haltReason?:
    | "quality_gate"
    | "manual_pause"
    | "skeleton_gate"
    | "structure_gate"
    | "logic_gate"
    | "chapter_gate"
    | "pipeline_stall"
    | null;
  updatedAt?: string;
};

/** Extracted from High Concept — drives draft/voice-rewrite. */
export type NovelVoiceCard = {
  toneLabel: string;
  traits: string[];
  doWrite: string[];
  sampleLines: string[];
  endingRotation: string[];
};

export type StyleRules = {
  dos?: string[];
  donts?: string[];
  notes?: string;
  /** Positive voice target + few-shot lines (see `voice-card.ts`). */
  voiceCard?: NovelVoiceCard | null;
  [key: string]: unknown;
};

export type StyleGuide = {
  novelId: string;
  genre: string;
  subgenre: string;
  primaryTone: string;
  narrativePerspective: string;
  styleRules: StyleRules;
  createdAt: string;
  updatedAt: string;
};

export type WorldCharacter = {
  name: string;
  role?: string;
  goals?: string[];
  initialKnowledge?: string[];
  summary?: string;
  [key: string]: unknown;
};

export type WorldBuilding = {
  novelId: string;
  characters: WorldCharacter[];
  loreRules: unknown[];
  locations: unknown[];
  createdAt: string;
  updatedAt: string;
};

export type KnowledgeGraph = {
  novelId: string;
  entityStates: Record<string, unknown>;
  timelineEvents: unknown[];
  createdAt: string;
  updatedAt: string;
};

/** Micro-function of a scene under the chapter job. */
export type NovelSceneBeat =
  | "advance"
  | "turn"
  | "relief"
  | "cost"
  | "land";

export type ScenePlanBeat = {
  id?: string;
  summary: string;
  location?: string;
  characters?: string[];
  /** Scene micro-beat serving the chapter contract job. */
  beat?: NovelSceneBeat;
  [key: string]: unknown;
};

/** Dramatic job for one chapter — drives craft, not book voice. */
export type NovelChapterJob =
  | "setup"
  | "incite"
  | "escalate"
  | "reveal"
  | "confront"
  | "comic"
  | "aftermath"
  | "decision"
  | "climax"
  | "denouement";

/** Per-chapter craft contract from outline (empty/null = legacy fallback). */
export type NovelChapterContract = {
  job: NovelChapterJob;
  must: string[];
  mustNot: string[];
  endingFunction: string;
  mood?: string;
};

export type NovelChapter = {
  id: string;
  novelId: string;
  chapterNumber: number;
  title: string;
  outline: string;
  /** Dramatic job + must/mustNot/ending; null when not yet assigned. */
  contract: NovelChapterContract | null;
  scenePlan: ScenePlanBeat[];
  rawDraft: string;
  finalText: string;
  status: ChapterStatus;
  createdAt: string;
  updatedAt: string;
};

export type EditorFeedback = {
  id: string;
  chapterId: string;
  iteration: number;
  score: number;
  toneAlignmentScore: number;
  issues: string[];
  approved: boolean;
  createdAt: string;
};

/** Minimum overall score for „bestanden“ when AI-voice gate is clear. */
export const ABNAHME_PASS_OVERALL_MIN = 7;

/** Full-manuscript Lektor Abnahme (1–10 + AI-voice gate). */
export type NovelAbnahmeScores = {
  genre: number;
  tonalitaet: number;
  logik: number;
  dramaturgie: number;
  stil: number;
  versprechen: number;
};

export type NovelAbnahme = {
  overall: number;
  scores: NovelAbnahmeScores;
  /** Hard gate: clearly AI-sounding prose. */
  soundsLikeAi: boolean;
  soundsLikeAiNotes: string;
  menschlichkeit: number;
  /** passed = !soundsLikeAi && overall >= ABNAHME_PASS_OVERALL_MIN */
  passed: boolean;
  verdict: string;
  strengths: string[];
  weaknesses: string[];
  recommendations: string[];
  checkedAt: string;
  modelSlug: string;
};

/** Idea intake: ready for orchestrator, or interview Q&A in progress. */
export type NovelIdeaStatus = "ready" | "interview";

export type NovelIdeaInterviewMessage = {
  id: string;
  role: "assistant" | "user";
  content: string;
  createdAt: string;
};

export type NovelScene = {
  id: string;
  novelId: string;
  chapterId: string;
  sceneIndex: number;
  status: SceneStatus;
  planSummary: string;
  location: string;
  characters: string[];
  /** @deprecated sequential briefing text — prefer `manifest`. */
  briefing: string;
  /** Immutable datasheet (JSON). */
  manifest: Record<string, unknown>;
  rawText: string;
  finalText: string;
  summary: string;
  score: number;
  feedback: string[];
  logicNotes: string;
  iteration: number;
  createdAt: string;
  updatedAt: string;
};

export type NovelSceneState = {
  sceneId: string;
  novelId: string;
  state: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type NovelCharacterRow = {
  id: string;
  novelId: string;
  name: string;
  role: string;
  summary: string;
  facts: Record<string, unknown>;
  sortIndex: number;
};

export type NovelLocationRow = {
  id: string;
  novelId: string;
  name: string;
  summary: string;
  facts: Record<string, unknown>;
  sortIndex: number;
};

export type Novel = {
  id: string;
  title: string;
  highConceptIdea: string;
  status: NovelStatus;
  orchestratorStatus: OrchestratorStatus;
  /** ready = Start erlaubt; interview = Idee-Q&A. */
  ideaStatus: NovelIdeaStatus;
  ideaInterview: NovelIdeaInterviewMessage[];
  /** auto | pause_after_scene */
  pilotMode: NovelPilotMode;
  /** Architect tree (acts/chapters). */
  skeleton: Record<string, unknown>;
  skeletonFrozen: boolean;
  /** Book-wide state vector. */
  stateMatrix: Record<string, unknown>;
  /** Export / marketing */
  subtitle: string;
  summary: string;
  keywords: string[];
  autorName: string;
  /** Front matter JSON (titelseite, impressum, motto, …). */
  vorsatz: Record<string, unknown> | null;
  coverImageDataUrl: string;
  coverPrompt: string;
  /** Last full-manuscript Abnahmecheck, or null if never run. */
  abnahme: NovelAbnahme | null;
  createdAt: string;
  updatedAt: string;
};

export type NovelSummary = Novel & {
  chapterCount: number;
};

export type NovelBundle = {
  novel: Novel;
  styleGuide: StyleGuide | null;
  worldBuilding: WorldBuilding | null;
  knowledgeGraph: KnowledgeGraph | null;
  chapters: NovelChapter[];
  scenes: NovelScene[];
  sceneStates: NovelSceneState[];
  characters: NovelCharacterRow[];
  locations: NovelLocationRow[];
  editorFeedbacks: EditorFeedback[];
};

/** Job hop body (async continue). */
export type NovelJobHop = {
  novelId: string;
  step: string;
  chapterNumber?: number;
  sceneId?: string;
  iteration?: number;
  /** Transient timeout/abort auto-retries for this hop (capped in orchestrator). */
  retry?: number;
  /** Optional delay before the next self-kick. */
  delayMs?: number;
};
