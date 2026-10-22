/**
 * Zod schemas for Top-Down Roman: skeleton + immutable scene manifests.
 * Chapter `job` + scene `beat` drive stylist registers (not score gates).
 */

import { z } from "zod";
import {
  architectPyramidExtrasSchema,
  pyramidNextPlanSchema,
  pyramidStateDeltaSchema,
} from "@/lib/novel/pyramid-state";

/**
 * LLM often returns issues/changeOrders as objects (`{text}`, `{issue}`, …).
 * `String(obj)` → "[object Object]" which poisoned structure-gate UI/notes.
 */
export function structureNoteToString(raw: unknown): string {
  if (raw == null) return "";
  if (typeof raw === "string") return raw.trim();
  if (typeof raw === "number" || typeof raw === "boolean") {
    return String(raw).trim();
  }
  if (Array.isArray(raw)) {
    return raw
      .map((x) => structureNoteToString(x))
      .filter(Boolean)
      .join(" · ");
  }
  if (typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    for (const key of [
      "text",
      "issue",
      "message",
      "note",
      "order",
      "change",
      "question",
      "summary",
      "title",
      "detail",
    ]) {
      const v = o[key];
      if (typeof v === "string" && v.trim()) return v.trim();
    }
    try {
      return JSON.stringify(raw);
    } catch {
      return "";
    }
  }
  return "";
}

const strList = (max: number) =>
  z.preprocess((raw) => {
    const list = Array.isArray(raw)
      ? raw
      : typeof raw === "string" && raw.trim()
        ? [raw]
        : [];
    return list
      .map((x) => structureNoteToString(x))
      .filter(Boolean)
      .slice(0, max);
  }, z.array(z.string()).max(max).default([]));

/** One act in the high-level skeleton. */
export const skeletonActSchema = z.object({
  actNumber: z.preprocess((raw) => {
    const n = typeof raw === "number" ? raw : Number(raw);
    return Number.isFinite(n) ? Math.round(n) : 1;
  }, z.number().int().min(1).max(5)),
  title: z.preprocess(
    (raw) => String(raw ?? "").trim() || "Akt",
    z.string().min(1),
  ),
  summary: z.preprocess((raw) => {
    const t = String(raw ?? "").trim();
    return t.length >= 8 ? t : `${t || "Akt"} — Zusammenfassung.`;
  }, z.string().min(8)),
});

const CHAPTER_JOBS = [
  "setup",
  "incite",
  "escalate",
  "reveal",
  "confront",
  "comic",
  "aftermath",
  "decision",
  "climax",
  "denouement",
] as const;

const SCENE_BEATS = ["advance", "turn", "relief", "cost", "land"] as const;

const chapterJobSchema = z.preprocess((raw) => {
  if (typeof raw !== "string" || !raw.trim()) return "escalate";
  const v = raw.trim().toLowerCase();
  return (CHAPTER_JOBS as readonly string[]).includes(v) ? v : "escalate";
}, z.enum(CHAPTER_JOBS));

const sceneBeatSchema = z.preprocess((raw) => {
  if (typeof raw !== "string" || !raw.trim()) return "advance";
  const v = raw.trim().toLowerCase();
  return (SCENE_BEATS as readonly string[]).includes(v) ? v : "advance";
}, z.enum(SCENE_BEATS));

/** Chapter beat inside the skeleton (before scene manifests). */
export const skeletonChapterSchema = z.object({
  chapterNumber: z.preprocess((raw) => {
    const n = typeof raw === "number" ? raw : Number(raw);
    return Number.isFinite(n) ? Math.max(1, Math.round(n)) : 1;
  }, z.number().int().min(1)),
  title: z.preprocess(
    (raw) => String(raw ?? "").trim() || "Kapitel",
    z.string().min(1),
  ),
  actNumber: z.preprocess((raw) => {
    const n = typeof raw === "number" ? raw : Number(raw);
    if (!Number.isFinite(n)) return 1;
    return Math.max(1, Math.min(5, Math.round(n)));
  }, z.number().int().min(1).max(5).default(1)),
  /** Dramatic job taxonomy — drives contract + stylist register. */
  job: chapterJobSchema,
  goal: z.preprocess((raw) => {
    const t = String(raw ?? "").trim();
    return t.length >= 8 ? t : `${t || "Kapitelziel"} — Handlung vorantreiben.`;
  }, z.string().min(8)),
  /** Plot beat summaries (free text), not scene-beat enums. */
  beats: strList(8),
  must: strList(3).optional(),
  mustNot: strList(3).optional(),
  endingFunction: z.preprocess(
    (raw) => (raw == null ? undefined : String(raw).trim() || undefined),
    z.string().optional(),
  ),
  mood: z.preprocess(
    (raw) => (raw == null ? undefined : String(raw).trim() || undefined),
    z.string().optional(),
  ),
});

export const novelSkeletonSchema = z.object({
  premise: z.string().default(""),
  acts: z.array(skeletonActSchema).max(5).default([]),
  chapters: z.array(skeletonChapterSchema).max(40).default([]),
});

export type NovelSkeleton = z.infer<typeof novelSkeletonSchema>;

const padMin = (min: number, fallback: string) =>
  z.preprocess((raw) => {
    const t = String(raw ?? "").trim();
    if (t.length >= min) return t;
    const base = t || fallback;
    return base.length >= min ? base : `${base} — Platzhalter.`;
  }, z.string().min(min));

/** Immutable scene datasheet — Draft/Auditor/Stylist read-only. */
export const sceneManifestSchema = z.object({
  // Soft pads so messy LLM JSON never aborts the hop; thinness is gated at Freeze.
  sceneGoal: padMin(8, "Szeneziel"),
  conflict: padMin(8, "Konflikt"),
  turningBeat: padMin(8, "Wendung"),
  /** Micro-beat under the chapter job (advance/turn/relief/cost/land). */
  beat: sceneBeatSchema,
  characters: strList(8),
  knowledgeAllowed: strList(8),
  knowledgeForbidden: strList(8),
  emotionStart: padMin(2, "ok"),
  emotionEnd: padMin(2, "ok"),
  /** At least 2 concrete visible beats — thin manifests blocked at Freeze. */
  mustShow: strList(8),
  mustNot: strList(8),
  /**
   * Ordered micro-actions / situations the draft must play (pyramid under scene).
   * Not prose — concrete playable beats (3–5).
   */
  situations: strList(8),
  location: z.preprocess((raw) => {
    const t = String(raw ?? "").trim();
    return t || "offen";
  }, z.string().min(1)),
  timeAnchor: z.preprocess(
    (raw) => String(raw ?? "").trim(),
    z.string().default(""),
  ),
  /** Filled by system from previous polished/summary — not invented by draft. */
  prevSummary3: z.preprocess(
    (raw) => String(raw ?? "").trim(),
    z.string().default(""),
  ),
});

export type SceneManifest = z.infer<typeof sceneManifestSchema>;

/** True when a manifest is too thin to freeze / draft from. */
export function isThinSceneManifest(
  m: SceneManifest | null | undefined,
): boolean {
  if (!m) return true;
  const loc = (m.location ?? "").trim().toLowerCase();
  return (
    (m.mustShow?.length ?? 0) < 2 ||
    (m.situations?.length ?? 0) < 3 ||
    !loc ||
    loc === "offen" ||
    loc === "irgendwo" ||
    (m.characters?.length ?? 0) < 1 ||
    (m.sceneGoal?.trim().length ?? 0) < 8 ||
    (m.conflict?.trim().length ?? 0) < 8
  );
}

/**
 * Pyramid extras are opaque here — coerced via `coercePyramidPlanPair` after
 * parse so messy LLM stateDelta/nextPlan never abort architect hops.
 */
const pyramidExtrasPassthrough = {
  stateDelta: z.unknown().optional(),
  nextPlan: z.unknown().optional(),
} as const;

const DEFAULT_THREE_ACTS = [
  {
    actNumber: 1,
    title: "Setup",
    summary: "Welt und Figuren etablieren; Konflikt andeuten.",
  },
  {
    actNumber: 2,
    title: "Konfrontation",
    summary: "Konflikt eskaliert; Einsatz und Hindernisse steigen.",
  },
  {
    actNumber: 3,
    title: "Auflösung",
    summary: "Höhepunkt, Wendung und Auflösung der Handlung.",
  },
] as const;

/**
 * Normalize LLM acts to exactly three unique acts (1–3).
 * Drops duplicates / extra acts — models sometimes emit Akt 3 twice.
 */
export function normalizeArchitectActsList(raw: unknown): unknown[] {
  let list: unknown[] = [];
  if (Array.isArray(raw)) {
    list = raw;
  } else if (raw && typeof raw === "object") {
    list = Object.values(raw as Record<string, unknown>);
  }
  list = list.filter((x) => x && typeof x === "object");

  type Slot = { title: string; summary: string };
  const slots: Array<Slot | undefined> = [undefined, undefined, undefined];

  for (const item of list) {
    const o = item as Record<string, unknown>;
    const nRaw = o.actNumber ?? o.number ?? o.akt;
    const n = typeof nRaw === "number" ? nRaw : Number(nRaw);
    const title = String(o.title ?? o.titel ?? o.name ?? "").trim();
    const summary = String(
      o.summary ?? o.zusammenfassung ?? o.text ?? "",
    ).trim();
    if (!title && !summary) continue;

    let idx =
      Number.isFinite(n) && n >= 1 && n <= 3 ? Math.round(n) - 1 : -1;
    if (idx >= 0 && slots[idx]) {
      // Duplicate actNumber (e.g. two× Akt 3) → keep the first, drop the rest
      continue;
    }
    if (idx < 0) {
      idx = slots.findIndex((s) => !s);
    }
    if (idx < 0 || idx > 2 || slots[idx]) continue;
    slots[idx] = {
      title: title || `Akt ${idx + 1}`,
      summary,
    };
  }

  return [0, 1, 2].map((i) => {
    const d = DEFAULT_THREE_ACTS[i]!;
    const s = slots[i];
    return {
      actNumber: i + 1,
      title: s?.title || d.title,
      summary: s?.summary || d.summary,
    };
  });
}

export const architectActsSchema = z.preprocess((raw) => {
  const o =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  return {
    ...o,
    premise: o.premise ?? o.Premise ?? o.prämisse ?? o.idea ?? "",
    acts: normalizeArchitectActsList(o.acts ?? o.Akte ?? o.Acts ?? o.akte),
  };
}, z.object({
  premise: z.preprocess((raw) => {
    const t = String(raw ?? "").trim();
    return t.length >= 20
      ? t
      : `${t || "Prämisse"} — noch aus der Idee zu schärfen.`.slice(0, 2_000);
  }, z.string().min(20)),
  acts: z.array(skeletonActSchema).min(2).max(5),
  ...pyramidExtrasPassthrough,
}));

export type ArchitectActsResult = z.infer<typeof architectActsSchema>;

/**
 * Never throws — pads to three acts / premise from idea if LLM JSON is thin.
 */
export function coerceArchitectActsResult(
  raw: unknown,
  ideaFallback: string,
): ArchitectActsResult {
  const parsed = architectActsSchema.safeParse(raw);
  if (parsed.success) return parsed.data;
  const idea = ideaFallback.trim();
  const premise =
    idea.length >= 20
      ? idea.slice(0, 2_000)
      : `${idea || "Prämisse"} — aus der High-Concept-Idee.`.slice(0, 2_000);
  return {
    premise,
    acts: DEFAULT_THREE_ACTS.map((a) => ({ ...a })),
  };
}

export const architectChaptersSchema = z.object({
  chapters: z.array(skeletonChapterSchema).min(1).max(40),
  ...pyramidExtrasPassthrough,
});

export type ArchitectChaptersResult = z.infer<typeof architectChaptersSchema>;
export type SkeletonChapter = z.infer<typeof skeletonChapterSchema>;

/**
 * Coerce messy LLM chapter arrays: renumber, ensure beats, clamp actNumbers.
 * Never throws — returns usable list (may be empty if raw is junk).
 */
export function coerceArchitectChaptersList(
  raw: unknown,
  opts?: { forceActNumber?: number; startChapterNumber?: number },
): SkeletonChapter[] {
  const o =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  let list: unknown[] = [];
  if (Array.isArray(raw)) list = raw;
  else if (Array.isArray(o.chapters)) list = o.chapters as unknown[];
  else if (Array.isArray(o.Kapitel)) list = o.Kapitel as unknown[];

  const start = Math.max(1, opts?.startChapterNumber ?? 1);
  const forceAct = opts?.forceActNumber;
  const out: SkeletonChapter[] = [];
  for (let i = 0; i < list.length && out.length < 40; i++) {
    const item = list[i];
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const patched: Record<string, unknown> = {
      ...(item as Record<string, unknown>),
      chapterNumber: start + out.length,
      ...(forceAct != null ? { actNumber: forceAct } : {}),
    };
    if (!Array.isArray(patched.beats) || (patched.beats as unknown[]).length < 2) {
      patched.beats = [
        "Ausgangslage und Antrieb",
        "Konflikt verschärft sich",
        "Kapitelende mit neuem Einsatz",
      ];
    }
    const p = skeletonChapterSchema.safeParse(patched);
    if (p.success) out.push(p.data);
  }
  return out;
}

export function coerceArchitectChaptersResult(
  raw: unknown,
): ArchitectChaptersResult {
  const chapters = coerceArchitectChaptersList(raw);
  const o =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  return {
    chapters,
    stateDelta: o.stateDelta,
    nextPlan: o.nextPlan,
  };
}

const architectSceneRowSchema = z.object({
  chapterNumber: z.preprocess((raw) => {
    const n = typeof raw === "number" ? raw : Number(raw);
    return Number.isFinite(n) ? Math.round(n) : 1;
  }, z.number().int().min(1)),
  sceneIndex: z.preprocess((raw) => {
    const n = typeof raw === "number" ? raw : Number(raw);
    return Number.isFinite(n) ? Math.round(n) : 1;
  }, z.number().int().min(1)),
  planSummary: z.preprocess((raw) => {
    const t = String(raw ?? "").trim();
    return t.length >= 8 ? t : `${t || "Szene"} — Plan.`;
  }, z.string().min(8)),
  /** Optional; system may force onto job beat chain. */
  beat: sceneBeatSchema.optional(),
  manifest: sceneManifestSchema,
});

export const architectSceneManifestsSchema = z.object({
  // Allow empty — hop coerces / continues; never abort the whole pipeline.
  scenes: z.array(architectSceneRowSchema).max(120).default([]),
  ...pyramidExtrasPassthrough,
});

export type ArchitectSceneManifestsResult = z.infer<
  typeof architectSceneManifestsSchema
>;

/**
 * Soft-parse architect manifest JSON. Invalid rows are dropped, never throw.
 */
export function coerceArchitectSceneManifests(
  raw: unknown,
): ArchitectSceneManifestsResult {
  const o =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const list = Array.isArray(o.scenes)
    ? o.scenes
    : Array.isArray(raw)
      ? raw
      : [];
  const scenes: ArchitectSceneManifestsResult["scenes"] = [];
  for (const item of list) {
    const parsed = architectSceneRowSchema.safeParse(item);
    if (parsed.success) {
      scenes.push(parsed.data);
      continue;
    }
    // Best-effort: keep chapter/index if present, pad a thin manifest.
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const ch = Number(row.chapterNumber);
    const idx = Number(row.sceneIndex);
    if (!Number.isFinite(ch) || !Number.isFinite(idx)) continue;
    const mRaw =
      row.manifest && typeof row.manifest === "object"
        ? row.manifest
        : row;
    const m = sceneManifestSchema.safeParse(mRaw);
    scenes.push({
      chapterNumber: Math.max(1, Math.round(ch)),
      sceneIndex: Math.max(1, Math.round(idx)),
      planSummary: String(row.planSummary ?? "Szene — Plan.").trim() || "Szene — Plan.",
      beat: sceneBeatSchema.safeParse(row.beat).success
        ? (sceneBeatSchema.parse(row.beat) as ArchitectSceneManifestsResult["scenes"][number]["beat"])
        : undefined,
      manifest: m.success
        ? m.data
        : sceneManifestSchema.parse({
            sceneGoal: "Platzhalter — nachbessern.",
            conflict: "Platzhalter — nachbessern.",
            turningBeat: "Platzhalter — nachbessern.",
            beat: "advance",
            characters: [],
            mustShow: [],
            mustNot: [],
            situations: [],
            location: "offen",
            emotionStart: "ok",
            emotionEnd: "ok",
          }),
    });
  }
  return {
    scenes,
    stateDelta: o.stateDelta,
    nextPlan: o.nextPlan,
  };
}

/** Idea → acts: first pyramid brief before act generation. */
export const ideaPyramidPlanSchema = z.object({
  stateDelta: pyramidStateDeltaSchema,
  nextPlan: pyramidNextPlanSchema,
});

export { architectPyramidExtrasSchema };

export const logicAuditSchema = z.object({
  passed: z.boolean(),
  issues: strList(6),
  /** Short structural change orders for draft-only rewrite. */
  changeOrders: strList(4),
  /**
   * Exact substrings from the Rohtext to highlight in HITL edit
   * (8–160 chars, copied verbatim from the draft).
   */
  stellen: strList(6),
});

/** Chapter dramaturgy gate after last scene commit. */
export const chapterAuditSchema = z.object({
  passed: z.boolean(),
  issues: strList(8),
  changeOrders: strList(6),
  /** Soft craft score 1–10 for sceneScoreAbnahmeFloor. */
  score: z.number().min(1).max(10).default(7),
});

/**
 * Structural logic/dramaturgy audit between architect pyramid levels
 * (acts → chapters → manifests) before Freeze.
 */
export const skeletonStructureAuditSchema = z.object({
  passed: z.boolean(),
  /** 1–10 craft score for Skelett-UI (Logik+Dramaturgie dieser Ebene). */
  score: z.number().min(1).max(10).default(6),
  issues: strList(8),
  changeOrders: strList(6),
  /**
   * Agentic: questions the auditor asks the architect when something is open.
   * Empty when passed=true.
   */
  questions: strList(6).optional(),
});

/** Collab rounds (auditor ↔ architect) inside one structure-audit hop. */
export const TREE_STRUCTURE_COLLAB_ROUNDS_ACTS = 2;
/** Chapters: more collab — audit → architect repair → re-score. */
export const TREE_STRUCTURE_COLLAB_ROUNDS_CHAPTERS = 3;
export const TREE_STRUCTURE_COLLAB_ROUNDS_MANIFESTS = 2;

export type SkeletonStructureLevel = "acts" | "chapters" | "manifests";

export const stateDiffSchema = z.object({
  state: z.record(z.string(), z.unknown()).default({}),
  summary3: z.string().min(20),
  /** Optional ledger patch for this chapter (timeline/money/open). */
  ledger: z
    .object({
      timeline: z
        .array(
          z.object({
            chapter: z.number().int().min(1),
            dateLabel: z.string().min(1),
            event: z.string().min(1),
          }),
        )
        .default([]),
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
    })
    .optional(),
});

/** Max draft rewrites after logic fail (not style). */
export const TREE_MAX_LOGIC_REWRITES = 2;

/** Max Formel-Tic scrub passes after style (before state_commit). */
export const TREE_MAX_TIC_SCRUBS = 1;

/** Max structure rewrites for manifests if not using the dedicated constant. */
export const TREE_MAX_STRUCTURE_REWRITES = 1;

/** Pyramid levels that gate at 10/10 — more architect rewrites + collab. */
export const TREE_MAX_ACTS_STRUCTURE_REWRITES = 2;
export const TREE_MAX_CHAPTERS_STRUCTURE_REWRITES = 3;
export const TREE_MAX_MANIFESTS_STRUCTURE_REWRITES = 2;

/** Aligns with `WORDS_PER_PLANNED_SCENE` in manuscript-stats. */
export const TREE_SCENE_TARGET_WORDS = 800;
export const TREE_SCENE_MIN_WORDS = 650;
