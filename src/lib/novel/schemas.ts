/**
 * Zod schemas for Haiku Structured JSON (Lektor review + knowledge-graph sync).
 */

import { z } from "zod";

const VOICE_SAMPLE_LINE_MAX = 280;

/** Clip/coerce LLM sample lines so long excerpts don't fail Zod. */
function coerceVoiceStringList(
  raw: unknown,
  opts: { minItems: number; maxItems: number; minLen: number; maxLen: number },
): string[] {
  const asList = Array.isArray(raw)
    ? raw
    : typeof raw === "string" && raw.trim()
      ? [raw]
      : [];
  const clipped = asList
    .map((x) => String(x ?? "").trim().replace(/\s+/g, " "))
    .filter(Boolean)
    .map((s) =>
      s.length > opts.maxLen ? `${s.slice(0, opts.maxLen - 1).trimEnd()}…` : s,
    )
    .filter((s) => s.length >= Math.min(opts.minLen, 2))
    .slice(0, opts.maxItems);
  // Pad so min() does not fail when the model returned one long block.
  while (clipped.length > 0 && clipped.length < opts.minItems) {
    clipped.push(clipped[clipped.length - 1]!);
  }
  return clipped;
}

export const voiceCardExtractSchema = z.object({
  toneLabel: z.string().min(2).max(120),
  traits: z.preprocess(
    (raw) =>
      coerceVoiceStringList(raw, {
        minItems: 4,
        maxItems: 10,
        minLen: 2,
        maxLen: 160,
      }),
    z.array(z.string().min(2).max(160)).min(4).max(10),
  ),
  doWrite: z.preprocess(
    (raw) =>
      coerceVoiceStringList(raw, {
        minItems: 3,
        maxItems: 8,
        minLen: 2,
        maxLen: 200,
      }),
    z.array(z.string().min(2).max(200)).min(3).max(8),
  ),
  sampleLines: z.preprocess(
    (raw) =>
      coerceVoiceStringList(raw, {
        minItems: 2,
        maxItems: 4,
        minLen: 8,
        maxLen: VOICE_SAMPLE_LINE_MAX,
      }),
    z
      .array(z.string().min(8).max(VOICE_SAMPLE_LINE_MAX + 1))
      .min(2)
      .max(4),
  ),
  endingRotation: z.preprocess(
    (raw) =>
      coerceVoiceStringList(raw, {
        minItems: 3,
        maxItems: 6,
        minLen: 2,
        maxLen: 40,
      }),
    z.array(z.string().min(2).max(40)).min(3).max(6),
  ),
});

export const styleGuideExtractSchema = z.object({
  genre: z.string().min(1),
  subgenre: z.string().default(""),
  primaryTone: z.string().min(1),
  narrativePerspective: z.string().min(1),
  styleRules: z
    .object({
      dos: z.array(z.string()).default([]),
      donts: z.array(z.string()).default([]),
      notes: z.string().optional(),
    })
    .passthrough(),
  /** Positive voice + few-shot; stored under styleRules.voiceCard. */
  voiceCard: voiceCardExtractSchema.optional(),
  suggestedTitle: z.string().optional(),
});

export const worldBuildingExtractSchema = z.object({
  characters: z
    .array(
      z
        .object({
          name: z.string().min(1),
          role: z.string().optional(),
          goals: z.array(z.string()).optional(),
          initialKnowledge: z.array(z.string()).optional(),
          summary: z.string().optional(),
        })
        .passthrough(),
    )
    .min(1),
  loreRules: z.array(z.unknown()).default([]),
  locations: z.array(z.unknown()).default([]),
  entityStates: z.record(z.string(), z.unknown()).default({}),
  timelineEvents: z.array(z.unknown()).default([]),
});

/**
 * Chapter count is chosen by the model from idea + genre (no fixed band in the
 * prompt). Schema only guards extreme outliers (novella … long novel).
 *
 * Outline JSON from Luna is often slightly off-type (string numbers, must as
 * string, long arrays) — coerce before validate; job/must normalize later.
 */
function asOptionalStringList(raw: unknown, max = 3): string[] | undefined {
  if (raw == null || raw === "") return undefined;
  if (typeof raw === "string") {
    const t = raw.trim();
    return t ? [t.slice(0, 200)] : undefined;
  }
  if (!Array.isArray(raw)) return undefined;
  const list = raw
    .map((x) => String(x ?? "").trim())
    .filter(Boolean)
    .map((s) => s.slice(0, 200))
    .slice(0, max);
  return list.length ? list : undefined;
}

function asOptionalTrimmed(raw: unknown, max: number): string | undefined {
  if (raw == null) return undefined;
  const t = String(raw).trim();
  if (!t) return undefined;
  return t.slice(0, max);
}

const outlineChapterSchema = z.preprocess(
  (raw) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
    const o = raw as Record<string, unknown>;
    const num =
      typeof o.chapterNumber === "number"
        ? o.chapterNumber
        : typeof o.chapter_number === "number"
          ? o.chapter_number
          : Number(o.chapterNumber ?? o.chapter_number);
    return {
      chapterNumber: Number.isFinite(num) ? Math.round(num) : o.chapterNumber,
      title: String(o.title ?? "").trim() || "Kapitel",
      outline: String(o.outline ?? o.summary ?? "").trim(),
      job: o.job ?? o.chapterJob ?? undefined,
      must: asOptionalStringList(o.must ?? o.muss),
      mustNot: asOptionalStringList(o.mustNot ?? o.must_not ?? o.darfNicht),
      endingFunction: asOptionalTrimmed(
        o.endingFunction ?? o.ending_function ?? o.ending,
        80,
      ),
      mood: asOptionalTrimmed(o.mood ?? o.stimmung, 80),
    };
  },
  z.object({
    chapterNumber: z.number().int().min(1),
    title: z.string().min(1),
    outline: z.string().min(1),
    job: z.string().optional(),
    must: z.array(z.string()).max(3).optional(),
    mustNot: z.array(z.string()).max(3).optional(),
    endingFunction: z.string().max(80).optional(),
    mood: z.string().max(80).optional(),
  }),
);

export const outlineExtractSchema = z.object({
  chapters: z.array(outlineChapterSchema).min(3).max(40),
  lengthRationale: z.preprocess(
    (v) => (v == null ? undefined : String(v).trim() || undefined),
    z.string().optional(),
  ),
});

const sceneBeatSchema = z.enum([
  "advance",
  "turn",
  "relief",
  "cost",
  "land",
]);

export const scenePlanExtractSchema = z.object({
  scenes: z
    .array(
      z
        .object({
          summary: z.string().min(1),
          location: z.string().optional(),
          characters: z.array(z.string()).optional(),
          /** Micro-beat under the chapter job. */
          beat: z.union([sceneBeatSchema, z.string()]).optional(),
        })
        .passthrough(),
    )
    .min(1),
});

/** Lektor chapter review — enforced structured JSON. */
export const editorReviewSchema = z.object({
  approved: z.boolean(),
  score: z.number().min(0).max(100),
  tone_score: z.number().min(0).max(100),
  issues: z.array(z.string()).default([]),
});

export type EditorReviewJson = z.infer<typeof editorReviewSchema>;

/** Knowledge-graph delta after approved chapter. */
export const knowledgeGraphSyncSchema = z.object({
  entity_states: z.record(z.string(), z.unknown()).default({}),
  timeline_events: z.array(z.unknown()).default([]),
  /** When true, replace entity_states; else shallow-merge. */
  replace_entity_states: z.boolean().optional().default(false),
  /** Optional logic-ledger patch (merged into __logicLedger). */
  logic_ledger: z
    .object({
      timeline: z
        .array(
          z.object({
            chapter: z.number().int().min(1),
            dateLabel: z.string(),
            event: z.string(),
          }),
        )
        .optional(),
      money: z
        .array(
          z.object({
            id: z.string(),
            amount: z.string(),
            status: z.string(),
            chapterRef: z.number().int().min(1),
          }),
        )
        .optional(),
      openQuestions: z.array(z.string()).optional(),
    })
    .optional(),
});

export type KnowledgeGraphSyncJson = z.infer<typeof knowledgeGraphSyncSchema>;

/** Initial ledger after outline. */
export const logicLedgerSeedSchema = z.object({
  timeline: z
    .array(
      z.object({
        chapter: z.number().int().min(1),
        dateLabel: z.string().min(1),
        event: z.string().min(1),
      }),
    )
    .min(3),
  money: z
    .array(
      z.object({
        id: z.string().min(1),
        amount: z.string().min(1),
        status: z.string().min(1),
        chapterRef: z.number().int().min(1),
      }),
    )
    .default([]),
  openQuestions: z.array(z.string()).max(12).default([]),
});

/** Lektor: seed pending scenes for one chapter from outline. */
export const chapterScenesSeedSchema = z.object({
  scenes: z
    .array(
      z.object({
        summary: z.string().min(1),
        location: z.string().optional(),
        characters: z.array(z.string()).optional(),
      }),
    )
    .min(1)
    .max(8),
});

/** Coerce string lists from the model; truncate instead of failing on length. */
function coerceStringList(max: number) {
  return z.preprocess((raw) => {
    const list = Array.isArray(raw)
      ? raw
      : typeof raw === "string" && raw.trim()
        ? [raw]
        : [];
    return list
      .map((x) => String(x ?? "").trim())
      .filter(Boolean)
      .slice(0, max);
  }, z.array(z.string()).max(max).default([]));
}

/**
 * Lektor: structured scene work contract (one-pass).
 * Stored as formatted text on `scenes.briefing` via `formatSceneBriefingContract`.
 */
export const sceneBriefingSchema = z.object({
  /** One-line scene job (not mood essay). */
  focus: z.string().min(8),
  /** How the scene must open (place/action/who). */
  opening: z.string().min(10),
  /** Required mid beat / turn. */
  turningBeat: z.string().min(10),
  /** Required ending beat. */
  ending: z.string().min(10),
  /** true = end mid-action/dialog; false = closed beat allowed. */
  endingOpen: z.boolean().default(true),
  /** Facts from State that must appear / stay true (short, concrete). */
  stateMust: coerceStringList(6),
  /** Concrete invention bans (UI, prices, dates, promises, …). */
  forbid: coerceStringList(6),
  /**
   * Who may know / say what this scene — prevents invented knowledge leaps.
   * Short facts, e.g. "Hartmut weiß noch nicht von der Verrechnung".
   */
  knowledgeLock: coerceStringList(5),
  /** Other must-include craft beats (dialog/gesture) — full sentences. */
  mustInclude: coerceStringList(6),
  /** Soft avoid (tone/pace), not inventing facts. */
  mustAvoid: coerceStringList(6),
  /**
   * Binary acceptance checks the lektor will verify (yes/no against prose).
   * E.g. "Jana liest den Zettel noch einmal, während der Anruf läuft".
   */
  acceptanceChecks: coerceStringList(5),
});

/** Lektor: score draft 1–10 (approve at ≥8). */
export const sceneReviewSchema = z.object({
  score: z.number().min(1).max(10),
  issues: coerceStringList(4),
  summary: z.string().min(1),
});

/** Lektor: state diff after approved scene. */
export const sceneStateDiffSchema = z.object({
  state: z.record(z.string(), z.unknown()).default({}),
  summary: z.string().min(1),
});

/** Pass threshold for scene approve. */
export const SCENE_APPROVE_SCORE_MIN = 8;
/**
 * After max rewrites: still commit only if score reaches this floor.
 * Below → pause for human (no 3/10 auto-approve).
 */
export const SCENE_SOFT_PASS_SCORE_MIN = 6;
/** Max author rewrite loops after failed review (iteration 0 = first draft). */
export const SCENE_MAX_REWRITE_ITERS = 2;

/** UI / status label: "Rewrite 1 von 2" (clamps stale iteration > max). */
export function formatSceneRewriteProgress(iteration: number): string {
  const n = Math.max(0, Math.floor(iteration));
  if (n <= 0) return "";
  const shown = Math.min(n, SCENE_MAX_REWRITE_ITERS);
  return `Rewrite ${shown} von ${SCENE_MAX_REWRITE_ITERS}`;
}

/**
 * Fix stale slash labels from older runs, e.g. "(2/1)…" or "Rewrite 1/1",
 * so the UI never shows a wrong max after SCENE_MAX_REWRITE_ITERS changes.
 */
export function normalizeRewriteProgressInLabel(label: string): string {
  if (!label) return label;
  return label
    .replace(/\bRewrite\s+(\d+)\s*\/\s*\d+\b/gi, (_m, cur: string) =>
      formatSceneRewriteProgress(Number(cur)),
    )
    .replace(/\((\d+)\s*\/\s*\d+\)/g, (_m, cur: string) => {
      const n = Number(cur);
      if (!Number.isFinite(n) || n <= 0) return _m;
      return `(${formatSceneRewriteProgress(n)})`;
    });
}
