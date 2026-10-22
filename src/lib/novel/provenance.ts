/**
 * Provenance layers for novel `state_matrix` + `knowledge_graph` writes.
 * Enables selective retract when regenerating Akte / Kapitel / Manifeste
 * without full graph versioning — drop everything at/above the chosen layer.
 *
 * Stored under `state_matrix.__provenance`. Pyramid levels stay in `__pyramid`;
 * this index tracks flat book keys + entityStates keys that were merged in.
 */

import {
  mergePyramidDeltaIntoBookState,
  parsePyramidBookState,
  PYRAMID_LEVELS,
  PYRAMID_STATE_KEY,
  type PyramidLevel,
} from "@/lib/novel/pyramid-state";
import { LEDGER_DEBT_KEY, LOGIC_LEDGER_KEY } from "@/lib/novel/logic-ledger";
import {
  entityStatesWithPyramidGraph,
  parsePyramidGraph,
  prunePyramidGraphFromLayer,
  PYRAMID_GRAPH_KEY,
} from "@/lib/novel/pyramid-graph";
import { VOICE_DISCOVERY_KEY } from "@/lib/novel/voice-discovery";

export const PROVENANCE_KEY = "__provenance";

/**
 * Structure + prose layers. Rank order = retract cascade
 * (regenerating `chapters` also drops `scenes` + `prose`).
 */
export type NovelProvenanceLayer =
  | "idea"
  | "acts"
  | "chapters"
  | "scenes"
  | "prose";

/** Regen buttons map to the first structure layer they wipe. */
export type NovelRegenFromLayer = "acts" | "chapters" | "scenes";

const LAYER_RANK: Record<NovelProvenanceLayer, number> = {
  idea: 0,
  acts: 1,
  chapters: 2,
  scenes: 3,
  prose: 4,
};

/** Flat book fields that pyramid deltas + scene state-commit merge into. */
export const PROVENANCE_FLAT_STATE_KEYS = [
  "characters",
  "knowledge",
  "notes",
  "items",
  "stakes",
  "toneNotes",
] as const;

export type ProvenanceFlatStateKey =
  (typeof PROVENANCE_FLAT_STATE_KEYS)[number];

export type NovelProvenanceIndex = {
  /** Top-level `state_matrix` keys → writing layer. */
  state: Record<string, NovelProvenanceLayer>;
  /** `knowledge_graph.entityStates` keys → writing layer. */
  entity: Record<string, NovelProvenanceLayer>;
};

/** entityStates keys that always belong to prose (scene state-commit). */
const PROSE_ENTITY_KEYS = new Set<string>([LOGIC_LEDGER_KEY, LEDGER_DEBT_KEY]);

/** Keep across structure regen (seeded before Akte). */
const KEEP_ENTITY_KEYS = new Set<string>([VOICE_DISCOVERY_KEY]);

/** Pruned in place by layer — never fully dropped on structure regen. */
const LAYERED_ENTITY_KEYS = new Set<string>([PYRAMID_GRAPH_KEY]);

function isProvenanceLayer(raw: unknown): raw is NovelProvenanceLayer {
  return (
    raw === "idea" ||
    raw === "acts" ||
    raw === "chapters" ||
    raw === "scenes" ||
    raw === "prose"
  );
}

export function parseProvenance(raw: unknown): NovelProvenanceIndex {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { state: {}, entity: {} };
  }
  const o = raw as Record<string, unknown>;
  const state: Record<string, NovelProvenanceLayer> = {};
  const entity: Record<string, NovelProvenanceLayer> = {};
  const stateRaw =
    o.state && typeof o.state === "object" && !Array.isArray(o.state)
      ? (o.state as Record<string, unknown>)
      : {};
  const entityRaw =
    o.entity && typeof o.entity === "object" && !Array.isArray(o.entity)
      ? (o.entity as Record<string, unknown>)
      : {};
  for (const [k, v] of Object.entries(stateRaw)) {
    if (isProvenanceLayer(v)) state[k] = v;
  }
  for (const [k, v] of Object.entries(entityRaw)) {
    if (isProvenanceLayer(v)) entity[k] = v;
  }
  return { state, entity };
}

export function getProvenanceFromMatrix(
  matrix: Record<string, unknown> | null | undefined,
): NovelProvenanceIndex {
  return parseProvenance(matrix?.[PROVENANCE_KEY]);
}

function writeProvenance(
  matrix: Record<string, unknown>,
  index: NovelProvenanceIndex,
): Record<string, unknown> {
  return {
    ...matrix,
    [PROVENANCE_KEY]: {
      state: { ...index.state },
      entity: { ...index.entity },
    },
  };
}

/** Stamp flat / system state_matrix keys with a writing layer. */
export function markStateProvenance(
  matrix: Record<string, unknown>,
  keys: string[],
  layer: NovelProvenanceLayer,
): Record<string, unknown> {
  const prev = getProvenanceFromMatrix(matrix);
  const state = { ...prev.state };
  for (const k of keys) {
    if (!k || k.startsWith("__")) continue;
    state[k] = layer;
  }
  return writeProvenance(matrix, { state, entity: prev.entity });
}

/**
 * Stamp knowledge_graph.entityStates keys. Provenance lives on state_matrix,
 * so this returns both updated entityStates and a matrix patch helper.
 */
export function markEntityProvenance(
  matrix: Record<string, unknown>,
  keys: string[],
  layer: NovelProvenanceLayer,
): Record<string, unknown> {
  const prev = getProvenanceFromMatrix(matrix);
  const entity = { ...prev.entity };
  for (const k of keys) {
    if (!k) continue;
    entity[k] = layer;
  }
  return writeProvenance(matrix, { state: prev.state, entity });
}

function rankOf(layer: NovelProvenanceLayer): number {
  return LAYER_RANK[layer];
}

function shouldDropLayer(
  layer: NovelProvenanceLayer,
  from: NovelRegenFromLayer,
): boolean {
  return rankOf(layer) >= rankOf(from);
}

/** Pyramid levels wiped when regenerating from this structure layer. */
export function pyramidLevelsDroppedByRegen(
  from: NovelRegenFromLayer,
): PyramidLevel[] {
  const fromRank = rankOf(from);
  return PYRAMID_LEVELS.filter((lvl) => rankOf(lvl) >= fromRank);
}

/**
 * Clear flat book fields, then re-apply remaining pyramid deltas in order
 * so outline facts stay consistent after a structure wipe.
 */
function rebuildFlatStateFromPyramid(
  matrix: Record<string, unknown>,
  keepThrough: NovelProvenanceLayer,
): Record<string, unknown> {
  const pyramid = parsePyramidBookState(matrix[PYRAMID_STATE_KEY]);
  let next: Record<string, unknown> = { ...matrix };
  for (const key of PROVENANCE_FLAT_STATE_KEYS) {
    delete next[key];
  }
  delete next.__formelTicQueue;

  for (const level of PYRAMID_LEVELS) {
    if (rankOf(level) > rankOf(keepThrough)) continue;
    const rec = pyramid[level];
    if (!rec?.state) continue;
    next = mergePyramidDeltaIntoBookState(next, rec.state);
    const present = PROVENANCE_FLAT_STATE_KEYS.filter(
      (k) => next[k] !== undefined,
    );
    if (present.length) {
      next = markStateProvenance(next, [...present], level);
    }
  }
  return next;
}

/**
 * Retract state_matrix + knowledge_graph content at/above `fromLayer`.
 * Call after deleting pyramid/report keys for that regen, or pass matrix
 * that still has them — this also drops matching `__pyramid` levels.
 */
export function retractForStructureRegen(input: {
  matrix: Record<string, unknown>;
  entityStates: Record<string, unknown>;
  timelineEvents: unknown[];
  fromLayer: NovelRegenFromLayer;
}): {
  matrix: Record<string, unknown>;
  entityStates: Record<string, unknown>;
  timelineEvents: unknown[];
} {
  const { fromLayer } = input;
  const prevProv = getProvenanceFromMatrix(input.matrix);

  // Drop pyramid levels at/above regen point.
  const pyramid = parsePyramidBookState(input.matrix[PYRAMID_STATE_KEY]);
  for (const level of pyramidLevelsDroppedByRegen(fromLayer)) {
    delete pyramid[level];
  }
  let matrix: Record<string, unknown> = {
    ...input.matrix,
    [PYRAMID_STATE_KEY]: pyramid,
  };

  // KeepThrough = layer just below fromLayer.
  const keepThrough: NovelProvenanceLayer =
    fromLayer === "acts"
      ? "idea"
      : fromLayer === "chapters"
        ? "acts"
        : "chapters";

  matrix = rebuildFlatStateFromPyramid(matrix, keepThrough);

  // Drop provenance-tagged state keys at/above fromLayer (non-flat extras).
  const nextStateProv: Record<string, NovelProvenanceLayer> = {};
  for (const [k, layer] of Object.entries(prevProv.state)) {
    if (shouldDropLayer(layer, fromLayer)) continue;
    nextStateProv[k] = layer;
  }
  // Flat keys re-stamped by rebuild; merge rebuild provenance over.
  const rebuiltProv = getProvenanceFromMatrix(matrix);
  for (const [k, layer] of Object.entries(rebuiltProv.state)) {
    nextStateProv[k] = layer;
  }

  // Knowledge graph: drop prose + tagged entity keys at/above fromLayer.
  // Untagged non-keep keys are treated as prose (safe for structure regen).
  const nextEntity: Record<string, unknown> = {};
  const nextEntityProv: Record<string, NovelProvenanceLayer> = {};
  for (const [k, v] of Object.entries(input.entityStates ?? {})) {
    if (KEEP_ENTITY_KEYS.has(k)) {
      nextEntity[k] = v;
      nextEntityProv[k] = prevProv.entity[k] ?? "idea";
      continue;
    }
    if (LAYERED_ENTITY_KEYS.has(k) && k === PYRAMID_GRAPH_KEY) {
      const pruned = prunePyramidGraphFromLayer(
        parsePyramidGraph(v),
        fromLayer,
      );
      Object.assign(
        nextEntity,
        entityStatesWithPyramidGraph({}, pruned),
      );
      // Keep the bag key; content is layer-pruned.
      nextEntityProv[k] = keepThrough;
      continue;
    }
    const tagged = prevProv.entity[k];
    const effective: NovelProvenanceLayer =
      tagged ??
      (PROSE_ENTITY_KEYS.has(k) ? "prose" : "prose");
    if (shouldDropLayer(effective, fromLayer)) continue;
    nextEntity[k] = v;
    nextEntityProv[k] = effective;
  }

  // Regenerating scenes (or higher) always clears prose timeline.
  const timelineEvents =
    rankOf(fromLayer) <= rankOf("scenes") ? [] : [...input.timelineEvents];

  matrix = writeProvenance(matrix, {
    state: nextStateProv,
    entity: nextEntityProv,
  });

  return {
    matrix,
    entityStates: nextEntity,
    timelineEvents,
  };
}
