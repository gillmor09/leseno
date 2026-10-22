/**
 * Pyramid state + next-level plan: each architect level extends book state
 * and emits a binding brief for the next level (count, structure, function).
 * Stored under `novel.state_matrix.__pyramid`.
 */

import { z } from "zod";
import type { NovelBundle } from "@/lib/novel/types";

export const PYRAMID_STATE_KEY = "__pyramid";

export const PYRAMID_LEVELS = [
  "idea",
  "acts",
  "chapters",
  "scenes",
] as const;

export type PyramidLevel = (typeof PYRAMID_LEVELS)[number];

export const PYRAMID_LEVEL_LABELS: Record<PyramidLevel, string> = {
  idea: "Idee → Akte",
  acts: "Akte → Kapitel",
  chapters: "Kapitel → Szenen",
  scenes: "Szenen → Situationen/Draft",
};

const strList = (max: number) =>
  z.preprocess((raw) => {
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

function clipStr(raw: unknown, max: number, fallback = ""): string {
  const t = String(raw ?? "").trim();
  if (!t) return fallback;
  return t.length <= max ? t : `${t.slice(0, Math.max(1, max - 1))}…`;
}

function coerceCount(raw: unknown, fallback: number): number {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.min(40, Math.round(n)));
}

const PLAN_TARGETS = ["acts", "chapters", "scenes", "situations"] as const;

/** Facts / commitments locked in at this level (LLM-tolerant). */
export const pyramidStateDeltaSchema = z.preprocess((raw) => {
  const o =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const summary =
    clipStr(o.summary ?? o.Summary ?? o.lage, 800) ||
    "Pyramid-State (ohne Summary vom Modell).";
  return {
    summary: summary.length >= 8 ? summary : `${summary} — ergänzt.`,
    worldFacts: o.worldFacts ?? o.facts ?? [],
    characterSeeds: o.characterSeeds ?? o.characters ?? [],
    stakes: clipStr(o.stakes, 400),
    openThreads: o.openThreads ?? o.open ?? [],
    toneNotes: clipStr(o.toneNotes ?? o.tone, 300),
  };
}, z.object({
  summary: z.string().min(8).max(800),
  worldFacts: strList(8),
  characterSeeds: strList(8),
  stakes: z.string().max(400).default(""),
  openThreads: strList(8),
  toneNotes: z.string().max(300).default(""),
}));

export type PyramidStateDelta = z.infer<typeof pyramidStateDeltaSchema>;

/** Binding brief for the next pyramid level (LLM-tolerant). */
export const pyramidNextPlanSchema = z.preprocess((raw) => {
  const o =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const targetRaw = String(o.target ?? o.Target ?? "acts")
    .trim()
    .toLowerCase();
  const target = (PLAN_TARGETS as readonly string[]).includes(targetRaw)
    ? targetRaw
    : "acts";
  const countMin = coerceCount(o.countMin ?? o.min ?? o.count, 3);
  const countMax = coerceCount(o.countMax ?? o.max ?? o.count, countMin);
  let structure = clipStr(o.structure ?? o.Struktur ?? o.arc, 1_200);
  let plot = clipStr(o.plot ?? o.handlung ?? o.content, 1_200);
  if (structure.length < 12) {
    structure = `${structure || "Struktur"} — Bogen der nächsten Ebene.`.slice(
      0,
      1_200,
    );
  }
  if (plot.length < 12) {
    plot = `${plot || "Handlung"} — Inhalt der nächsten Ebene.`.slice(0, 1_200);
  }
  return {
    target,
    countMin: Math.min(countMin, countMax),
    countMax: Math.max(countMin, countMax),
    structure,
    plot,
    functions: o.functions ?? o.funktionen ?? [],
    mustCover: o.mustCover ?? o.must ?? [],
    mustNot: o.mustNot ?? o.darfNicht ?? [],
  };
}, z.object({
  target: z.enum(PLAN_TARGETS),
  countMin: z.number().int().min(1).max(40),
  countMax: z.number().int().min(1).max(40),
  structure: z.string().min(12).max(1_200),
  plot: z.string().min(12).max(1_200),
  functions: strList(20),
  mustCover: strList(10),
  mustNot: strList(8),
}));

export type PyramidNextPlan = z.infer<typeof pyramidNextPlanSchema>;

export const pyramidLevelRecordSchema = z.object({
  state: pyramidStateDeltaSchema,
  nextPlan: pyramidNextPlanSchema,
  updatedAt: z.string().default(""),
});

export type PyramidLevelRecord = z.infer<typeof pyramidLevelRecordSchema>;

export type PyramidBookState = Partial<Record<PyramidLevel, PyramidLevelRecord>>;

/** Architect JSON extras: state delta + plan for the following level. */
export const architectPyramidExtrasSchema = z.object({
  stateDelta: pyramidStateDeltaSchema,
  nextPlan: pyramidNextPlanSchema,
});

/**
 * Coerce partial LLM JSON into a valid idea→acts (or any) pyramid plan.
 * Never throws — always returns usable defaults.
 */
export function coercePyramidPlanPair(
  raw: unknown,
  fallbackTarget: PyramidNextPlan["target"] = "acts",
): { stateDelta: PyramidStateDelta; nextPlan: PyramidNextPlan } {
  const o =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const stateParsed = pyramidStateDeltaSchema.safeParse(
    o.stateDelta ?? o.state ?? {},
  );
  const planParsed = pyramidNextPlanSchema.safeParse(o.nextPlan ?? o.plan ?? {});
  const stateDelta = stateParsed.success
    ? stateParsed.data
    : emptyStateDelta("Idee übernommen — Pyramid-State heuristisch.");
  let nextPlan = planParsed.success
    ? planParsed.data
    : ({
        target: fallbackTarget,
        countMin: fallbackTarget === "acts" ? 3 : 8,
        countMax: fallbackTarget === "acts" ? 3 : 14,
        structure:
          fallbackTarget === "acts"
            ? "Drei Akte: Setup → Konfrontation → Auflösung"
            : "Nächste Ebene entlang des bisherigen Bogens",
        plot: stateDelta.summary.slice(0, 400) || "Handlung laut Idee fortführen",
        functions:
          fallbackTarget === "acts"
            ? ["Akt1: Setup", "Akt2: Konfrontation", "Akt3: Auflösung"]
            : [],
        mustCover: [],
        mustNot: [],
      } satisfies PyramidNextPlan);
  if (nextPlan.target !== fallbackTarget) {
    nextPlan = { ...nextPlan, target: fallbackTarget };
  }
  return { stateDelta, nextPlan };
}

export function emptyStateDelta(summary: string): PyramidStateDelta {
  const s = summary.trim().slice(0, 800);
  return {
    summary: s.length >= 8 ? s : `${s || "State"} — Platzhalter.`,
    worldFacts: [],
    characterSeeds: [],
    stakes: "",
    openThreads: [],
    toneNotes: "",
  };
}

export function parsePyramidBookState(raw: unknown): PyramidBookState {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const o = raw as Record<string, unknown>;
  const out: PyramidBookState = {};
  for (const level of PYRAMID_LEVELS) {
    const p = pyramidLevelRecordSchema.safeParse(o[level]);
    if (p.success) out[level] = p.data;
  }
  return out;
}

export function getPyramidBookState(
  bundle: NovelBundle | null | undefined,
): PyramidBookState {
  return parsePyramidBookState(bundle?.novel.stateMatrix?.[PYRAMID_STATE_KEY]);
}

export function stateMatrixWithPyramidLevel(
  matrix: Record<string, unknown>,
  level: PyramidLevel,
  record: PyramidLevelRecord,
): Record<string, unknown> {
  const prev = parsePyramidBookState(matrix[PYRAMID_STATE_KEY]);
  return {
    ...matrix,
    [PYRAMID_STATE_KEY]: {
      ...prev,
      [level]: {
        ...record,
        updatedAt: record.updatedAt || new Date().toISOString(),
      },
    },
  };
}

/**
 * Merge pyramid state deltas into the live book state_matrix keys
 * (characters / knowledge / notes) so drafts inherit them.
 * Callers that care about regen retract should stamp `__provenance`
 * via `markStateProvenance` (see `provenance.ts`).
 */
export function mergePyramidDeltaIntoBookState(
  matrix: Record<string, unknown>,
  delta: PyramidStateDelta,
): Record<string, unknown> {
  const notes = Array.isArray(matrix.notes)
    ? [...(matrix.notes as unknown[])]
    : [];
  const noteLine = `[Pyramide] ${delta.summary}`.slice(0, 400);
  if (!notes.some((n) => String(n) === noteLine)) {
    notes.push(noteLine);
  }
  for (const t of delta.openThreads.slice(0, 4)) {
    const line = `[Offen] ${t}`.slice(0, 200);
    if (!notes.some((n) => String(n) === line)) notes.push(line);
  }

  const knowledge =
    matrix.knowledge &&
    typeof matrix.knowledge === "object" &&
    !Array.isArray(matrix.knowledge)
      ? { ...(matrix.knowledge as Record<string, unknown>) }
      : {};
  for (const fact of delta.worldFacts) {
    const key = fact.slice(0, 40).replace(/\s+/g, "_");
    if (!knowledge[key]) knowledge[key] = fact;
  }

  const characters =
    matrix.characters &&
    typeof matrix.characters === "object" &&
    !Array.isArray(matrix.characters)
      ? { ...(matrix.characters as Record<string, unknown>) }
      : {};
  for (const seed of delta.characterSeeds) {
    const name = seed.split(/[—,:–-]/)[0]?.trim() || seed.slice(0, 40);
    if (name && !characters[name]) {
      characters[name] = { seed: seed.slice(0, 240) };
    }
  }

  return {
    ...matrix,
    notes: notes.slice(-40),
    knowledge,
    characters,
    stakes: delta.stakes || matrix.stakes || "",
    toneNotes: delta.toneNotes || matrix.toneNotes || "",
  };
}

/** Prompt block: accumulated pyramid state (compact). */
export function formatPyramidStateForArchitect(
  pyramid: PyramidBookState,
): string {
  const lines: string[] = [];
  for (const level of PYRAMID_LEVELS) {
    const rec = pyramid[level];
    if (!rec) continue;
    lines.push(
      `### ${PYRAMID_LEVEL_LABELS[level]} (State)
${rec.state.summary}
${rec.state.stakes ? `Einsatz: ${rec.state.stakes}` : ""}
Fakten: ${rec.state.worldFacts.join("; ") || "—"}
Figuren: ${rec.state.characterSeeds.join("; ") || "—"}
Offen: ${rec.state.openThreads.join("; ") || "—"}`,
    );
  }
  if (!lines.length) return "";
  return `# Pyramid-State (bisher verbindlich)\n${lines.join("\n\n")}`;
}

/** Prompt block: the plan the previous level wrote for this hop. */
export function formatNextPlanMandate(
  plan: PyramidNextPlan | null | undefined,
  expectedTarget: PyramidNextPlan["target"],
): string {
  if (!plan || plan.target !== expectedTarget) return "";
  const count =
    plan.countMin === plan.countMax
      ? `${plan.countMin}`
      : `${plan.countMin}–${plan.countMax}`;
  return `# Plan der vorherigen Ebene (HARD — Anzahl/Struktur/Funktion einhalten)
Ziel-Ebene: ${plan.target}
Anzahl: ${count}
Struktur: ${plan.structure}
Handlung/Inhalt: ${plan.plot}
Funktionen:
${plan.functions.map((f) => `- ${f}`).join("\n") || "- —"}
Muss abdecken: ${plan.mustCover.join("; ") || "—"}
Darf nicht: ${plan.mustNot.join("; ") || "—"}`;
}

export function getNextPlanFor(
  pyramid: PyramidBookState,
  fromLevel: PyramidLevel,
): PyramidNextPlan | null {
  return pyramid[fromLevel]?.nextPlan ?? null;
}

/** JSON schema hint snippet for architect responses. */
export const ARCHITECT_PYRAMID_EXTRAS_HINT = `"stateDelta":{"summary":"…","worldFacts":["…"],"characterSeeds":["…"],"stakes":"…","openThreads":["…"],"toneNotes":"…"},"nextPlan":{"target":"chapters","countMin":15,"countMax":21,"structure":"Pro Akt 5–7 Kapitel…","plot":"…","functions":["…"],"mustCover":["…"],"mustNot":["…"]}`;
