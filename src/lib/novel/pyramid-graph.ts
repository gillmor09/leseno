/**
 * Durable pyramid knowledge graph for Top-Down novels.
 * Stored under knowledge_graph.entityStates[PYRAMID_GRAPH_KEY].
 * Mirrors idea → acts → chapters → scenes → situations as nodes/edges
 * (contracts only — no continuous prose). Used for architect context,
 * provenance retract, and final prose-prompt compile.
 */

import type { NovelProvenanceLayer } from "@/lib/novel/provenance";
import type { KnowledgeGraph, NovelBundle } from "@/lib/novel/types";

export const PYRAMID_GRAPH_KEY = "__pyramidGraph";

export type PyramidGraphLayer =
  | "idea"
  | "acts"
  | "chapters"
  | "scenes"
  | "situations";

export type PyramidGraphNodeKind =
  | "idea"
  | "act"
  | "chapter"
  | "scene"
  | "situation"
  | "fact"
  | "character"
  | "thread"
  | "constraint";

export type PyramidGraphNode = {
  id: string;
  layer: PyramidGraphLayer;
  kind: PyramidGraphNodeKind;
  label: string;
  summary: string;
  attrs: Record<string, string>;
  chapterNumber?: number;
  sceneIndex?: number;
};

export type PyramidGraphEdge = {
  id: string;
  from: string;
  to: string;
  rel: string;
  note: string;
  layer: PyramidGraphLayer;
};

export type PyramidGraph = {
  updatedAt: string;
  nodes: PyramidGraphNode[];
  edges: PyramidGraphEdge[];
};

const LAYER_RANK: Record<PyramidGraphLayer, number> = {
  idea: 0,
  acts: 1,
  chapters: 2,
  scenes: 3,
  situations: 4,
};

const NODE_KINDS = new Set<PyramidGraphNodeKind>([
  "idea",
  "act",
  "chapter",
  "scene",
  "situation",
  "fact",
  "character",
  "thread",
  "constraint",
]);

function clip(s: unknown, max: number): string {
  const t = String(s ?? "").trim();
  if (!t) return "";
  return t.length <= max ? t : `${t.slice(0, Math.max(1, max - 1))}…`;
}

function isLayer(raw: unknown): raw is PyramidGraphLayer {
  return (
    raw === "idea" ||
    raw === "acts" ||
    raw === "chapters" ||
    raw === "scenes" ||
    raw === "situations"
  );
}

export function emptyPyramidGraph(): PyramidGraph {
  return { updatedAt: "", nodes: [], edges: [] };
}

export function parsePyramidGraph(raw: unknown): PyramidGraph {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return emptyPyramidGraph();
  }
  const o = raw as Record<string, unknown>;
  const nodes: PyramidGraphNode[] = [];
  if (Array.isArray(o.nodes)) {
    for (const row of o.nodes) {
      if (!row || typeof row !== "object" || Array.isArray(row)) continue;
      const n = row as Record<string, unknown>;
      const id = clip(n.id, 80);
      const layer = isLayer(n.layer) ? n.layer : null;
      const kindRaw = String(n.kind ?? "")
        .trim()
        .toLowerCase() as PyramidGraphNodeKind;
      if (!id || !layer || !NODE_KINDS.has(kindRaw)) continue;
      const attrs: Record<string, string> = {};
      if (n.attrs && typeof n.attrs === "object" && !Array.isArray(n.attrs)) {
        for (const [k, v] of Object.entries(n.attrs as Record<string, unknown>)) {
          const key = clip(k, 40);
          const val = clip(v, 240);
          if (key && val) attrs[key] = val;
        }
      }
      const chapterNumber = Number(n.chapterNumber ?? n.chapter_number);
      const sceneIndex = Number(n.sceneIndex ?? n.scene_index);
      nodes.push({
        id,
        layer,
        kind: kindRaw,
        label: clip(n.label, 120) || id,
        summary: clip(n.summary, 800),
        attrs,
        chapterNumber:
          Number.isFinite(chapterNumber) && chapterNumber >= 1
            ? Math.round(chapterNumber)
            : undefined,
        sceneIndex:
          Number.isFinite(sceneIndex) && sceneIndex >= 1
            ? Math.round(sceneIndex)
            : undefined,
      });
    }
  }
  const edges: PyramidGraphEdge[] = [];
  if (Array.isArray(o.edges)) {
    for (const row of o.edges) {
      if (!row || typeof row !== "object" || Array.isArray(row)) continue;
      const e = row as Record<string, unknown>;
      const from = clip(e.from, 80);
      const to = clip(e.to, 80);
      const rel = clip(e.rel, 60) || "relates";
      const layer = isLayer(e.layer) ? e.layer : "scenes";
      if (!from || !to) continue;
      edges.push({
        id: clip(e.id, 100) || `${from}|${rel}|${to}`,
        from,
        to,
        rel,
        note: clip(e.note, 400),
        layer,
      });
    }
  }
  return {
    updatedAt: typeof o.updatedAt === "string" ? o.updatedAt : "",
    nodes,
    edges,
  };
}

export function getPyramidGraph(
  bundle: NovelBundle | KnowledgeGraph | null | undefined,
): PyramidGraph {
  if (!bundle) return emptyPyramidGraph();
  const states =
    "knowledgeGraph" in bundle
      ? bundle.knowledgeGraph?.entityStates
      : (bundle as KnowledgeGraph).entityStates;
  return parsePyramidGraph(states?.[PYRAMID_GRAPH_KEY]);
}

/** Merge incoming nodes/edges; same id wins with attr merge. */
export function mergePyramidGraph(
  base: PyramidGraph,
  incoming: PyramidGraph,
): PyramidGraph {
  const nodesById = new Map(base.nodes.map((n) => [n.id, n]));
  for (const n of incoming.nodes) {
    const prev = nodesById.get(n.id);
    nodesById.set(
      n.id,
      prev
        ? {
            ...prev,
            ...n,
            attrs: { ...prev.attrs, ...n.attrs },
            summary: n.summary || prev.summary,
          }
        : n,
    );
  }
  const edgesById = new Map(base.edges.map((e) => [e.id, e]));
  for (const e of incoming.edges) {
    edgesById.set(e.id, e);
  }
  return {
    updatedAt: new Date().toISOString(),
    nodes: [...nodesById.values()].slice(0, 400),
    edges: [...edgesById.values()].slice(0, 600),
  };
}

export function prunePyramidGraphFromLayer(
  graph: PyramidGraph,
  fromLayer: NovelProvenanceLayer | PyramidGraphLayer,
): PyramidGraph {
  const fromRank =
    fromLayer === "prose"
      ? LAYER_RANK.situations + 1
      : (LAYER_RANK[fromLayer as PyramidGraphLayer] ?? 3);
  return {
    updatedAt: new Date().toISOString(),
    nodes: graph.nodes.filter((n) => LAYER_RANK[n.layer] < fromRank),
    edges: graph.edges.filter((e) => LAYER_RANK[e.layer] < fromRank),
  };
}

export function entityStatesWithPyramidGraph(
  entityStates: Record<string, unknown>,
  graph: PyramidGraph,
): Record<string, unknown> {
  return {
    ...entityStates,
    [PYRAMID_GRAPH_KEY]: {
      ...graph,
      updatedAt: graph.updatedAt || new Date().toISOString(),
    },
  };
}

/** Compact prompt block for architect / compile hops. */
export function formatPyramidGraphForPrompt(
  graph: PyramidGraph | null | undefined,
  opts?: { maxNodes?: number; maxLayer?: PyramidGraphLayer },
): string {
  if (!graph?.nodes.length) return "";
  const maxRank = opts?.maxLayer
    ? LAYER_RANK[opts.maxLayer]
    : LAYER_RANK.situations;
  const nodes = graph.nodes
    .filter((n) => LAYER_RANK[n.layer] <= maxRank)
    .slice(0, opts?.maxNodes ?? 60);
  if (!nodes.length) return "";
  const idSet = new Set(nodes.map((n) => n.id));
  const lines = nodes.map((n) => {
    const where =
      n.chapterNumber != null
        ? ` Kap.${n.chapterNumber}${n.sceneIndex != null ? `.${n.sceneIndex}` : ""}`
        : "";
    return `- [${n.layer}/${n.kind}] ${n.id}${where}: ${n.label} — ${n.summary.slice(0, 160)}`;
  });
  const edges = graph.edges
    .filter((e) => idSet.has(e.from) && idSet.has(e.to))
    .slice(0, 80)
    .map((e) => `- ${e.from} --${e.rel}→ ${e.to}${e.note ? ` (${e.note.slice(0, 80)})` : ""}`);
  return `# Pyramid-Graph (Verträge / Kanon)
## Knoten
${lines.join("\n")}
${edges.length ? `## Kanten\n${edges.join("\n")}` : ""}`;
}

export function nodeSummaryForEmbedding(node: PyramidGraphNode): string {
  const bits = [
    `[${node.layer}] ${node.kind}: ${node.label}`,
    node.summary,
    node.chapterNumber != null ? `Kapitel ${node.chapterNumber}` : "",
    node.sceneIndex != null ? `Szene ${node.sceneIndex}` : "",
    ...Object.entries(node.attrs).map(([k, v]) => `${k}=${v}`),
  ].filter(Boolean);
  return bits.join(" | ").slice(0, 1_200);
}

/** Build act-layer graph slice from skeleton acts. */
export function graphDeltaFromActs(input: {
  premise: string;
  acts: Array<{ actNumber?: number; title?: string; summary?: string }>;
}): PyramidGraph {
  const nodes: PyramidGraphNode[] = [];
  const edges: PyramidGraphEdge[] = [];
  if (input.premise.trim()) {
    nodes.push({
      id: "idea:premise",
      layer: "idea",
      kind: "idea",
      label: "Prämisse",
      summary: clip(input.premise, 800),
      attrs: {},
    });
  }
  for (const act of input.acts) {
    const n = Math.max(1, Number(act.actNumber) || nodes.length);
    const id = `act:${n}`;
    nodes.push({
      id,
      layer: "acts",
      kind: "act",
      label: clip(act.title, 120) || `Akt ${n}`,
      summary: clip(act.summary, 800),
      attrs: { actNumber: String(n) },
    });
    if (input.premise.trim()) {
      edges.push({
        id: `idea:premise|contains|${id}`,
        from: "idea:premise",
        to: id,
        rel: "contains",
        note: "",
        layer: "acts",
      });
    }
  }
  return { updatedAt: new Date().toISOString(), nodes, edges };
}

/** Build chapter-layer graph slice. */
export function graphDeltaFromChapters(input: {
  chapters: Array<{
    chapterNumber: number;
    actNumber?: number;
    title?: string;
    goal?: string;
    job?: string;
    beats?: string[];
    must?: string[];
    mustNot?: string[];
    endingFunction?: string;
  }>;
}): PyramidGraph {
  const nodes: PyramidGraphNode[] = [];
  const edges: PyramidGraphEdge[] = [];
  for (const ch of input.chapters) {
    const id = `chapter:${ch.chapterNumber}`;
    const beatLine = (ch.beats ?? []).slice(0, 6).join(" · ");
    nodes.push({
      id,
      layer: "chapters",
      kind: "chapter",
      label: clip(ch.title, 120) || `Kapitel ${ch.chapterNumber}`,
      summary: clip(
        [ch.goal, beatLine && `Beats: ${beatLine}`, ch.endingFunction && `Ende: ${ch.endingFunction}`]
          .filter(Boolean)
          .join(" | "),
        800,
      ),
      attrs: {
        job: clip(ch.job, 40),
        ...(ch.must?.length ? { must: ch.must.slice(0, 4).join("; ") } : {}),
        ...(ch.mustNot?.length
          ? { mustNot: ch.mustNot.slice(0, 3).join("; ") }
          : {}),
      },
      chapterNumber: ch.chapterNumber,
    });
    const actN = ch.actNumber ?? 1;
    edges.push({
      id: `act:${actN}|contains|${id}`,
      from: `act:${actN}`,
      to: id,
      rel: "contains",
      note: clip(ch.job, 40),
      layer: "chapters",
    });
  }
  // Sequential chapter chain
  const sorted = [...input.chapters].sort(
    (a, b) => a.chapterNumber - b.chapterNumber,
  );
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1]!;
    const cur = sorted[i]!;
    edges.push({
      id: `chapter:${prev.chapterNumber}|then|chapter:${cur.chapterNumber}`,
      from: `chapter:${prev.chapterNumber}`,
      to: `chapter:${cur.chapterNumber}`,
      rel: "then",
      note: "",
      layer: "chapters",
    });
  }
  return { updatedAt: new Date().toISOString(), nodes, edges };
}

/** Build scene + situation graph from manifests. */
export function graphDeltaFromManifests(input: {
  scenes: Array<{
    chapterNumber: number;
    sceneIndex: number;
    beat?: string;
    sceneGoal?: string;
    location?: string;
    characters?: string[];
    mustShow?: string[];
    situations?: string[];
    knowledgeAllowed?: string[];
    knowledgeForbidden?: string[];
  }>;
}): PyramidGraph {
  const nodes: PyramidGraphNode[] = [];
  const edges: PyramidGraphEdge[] = [];
  for (const s of input.scenes) {
    const sid = `scene:${s.chapterNumber}.${s.sceneIndex}`;
    nodes.push({
      id: sid,
      layer: "scenes",
      kind: "scene",
      label: `Kap. ${s.chapterNumber}.${s.sceneIndex}`,
      summary: clip(
        [
          s.sceneGoal,
          s.beat && `Beat: ${s.beat}`,
          s.location && `Ort: ${s.location}`,
          (s.mustShow ?? []).slice(0, 3).join("; "),
        ]
          .filter(Boolean)
          .join(" | "),
        800,
      ),
      attrs: {
        beat: clip(s.beat, 40),
        location: clip(s.location, 80),
        chars: (s.characters ?? []).slice(0, 5).join(", "),
        knowAllowed: (s.knowledgeAllowed ?? []).slice(0, 3).join("; "),
        knowForbidden: (s.knowledgeForbidden ?? []).slice(0, 3).join("; "),
      },
      chapterNumber: s.chapterNumber,
      sceneIndex: s.sceneIndex,
    });
    edges.push({
      id: `chapter:${s.chapterNumber}|contains|${sid}`,
      from: `chapter:${s.chapterNumber}`,
      to: sid,
      rel: "contains",
      note: clip(s.beat, 40),
      layer: "scenes",
    });
    (s.situations ?? []).forEach((sit, i) => {
      const sitId = `${sid}:sit:${i + 1}`;
      nodes.push({
        id: sitId,
        layer: "situations",
        kind: "situation",
        label: `Situation ${i + 1}`,
        summary: clip(sit, 400),
        attrs: { order: String(i + 1) },
        chapterNumber: s.chapterNumber,
        sceneIndex: s.sceneIndex,
      });
      edges.push({
        id: `${sid}|plays|${sitId}`,
        from: sid,
        to: sitId,
        rel: "plays",
        note: "",
        layer: "situations",
      });
    });
  }
  return { updatedAt: new Date().toISOString(), nodes, edges };
}
