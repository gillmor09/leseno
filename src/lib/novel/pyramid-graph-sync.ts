/**
 * Persist pyramid graph deltas into knowledge_graph + optional embeddings.
 * Called after architect levels pass (or immediately after commit).
 */

import { embedTexts } from "@/lib/ai/embeddings";
import { markEntityProvenance } from "@/lib/novel/provenance";
import type { NovelProvenanceLayer } from "@/lib/novel/provenance";
import {
  entityStatesWithPyramidGraph,
  getPyramidGraph,
  mergePyramidGraph,
  nodeSummaryForEmbedding,
  type PyramidGraph,
  PYRAMID_GRAPH_KEY,
} from "@/lib/novel/pyramid-graph";
import {
  deletePyramidEmbeddingsFromLayer,
  getNovelBundle,
  updateNovel,
  upsertKnowledgeGraph,
  upsertPyramidEmbedding,
} from "@/lib/novel/repository";

/**
 * Merge a graph delta into the novel KG and stamp provenance.
 * Embeddings are best-effort (skip on API failure so outline continues).
 */
export async function persistPyramidGraphDelta(input: {
  novelId: string;
  delta: PyramidGraph;
  layer: NovelProvenanceLayer;
  /** When true, delete embeddings at/above this layer first (regen). */
  replaceLayerEmbeddings?: boolean;
}): Promise<void> {
  const bundle = await getNovelBundle(input.novelId);
  if (!bundle) return;

  if (input.replaceLayerEmbeddings) {
    try {
      await deletePyramidEmbeddingsFromLayer(input.novelId, input.layer);
    } catch (err) {
      console.warn("[pyramid-graph-sync] delete embeddings", err);
    }
  }

  const prev = getPyramidGraph(bundle);
  const merged = mergePyramidGraph(prev, input.delta);
  const prevStates = bundle.knowledgeGraph?.entityStates ?? {};
  const entityStates = entityStatesWithPyramidGraph(prevStates, merged);
  let matrix = markEntityProvenance(
    { ...(bundle.novel.stateMatrix ?? {}) },
    [PYRAMID_GRAPH_KEY],
    input.layer,
  );
  await upsertKnowledgeGraph({
    novelId: input.novelId,
    entityStates,
    timelineEvents: bundle.knowledgeGraph?.timelineEvents ?? [],
  });
  await updateNovel({ id: input.novelId, stateMatrix: matrix });

  const newNodes = input.delta.nodes.filter((n) => n.summary.trim().length >= 12);
  if (newNodes.length === 0) return;
  try {
    const vectors = await embedTexts(
      newNodes.map((n) => nodeSummaryForEmbedding(n)),
    );
    for (let i = 0; i < newNodes.length; i++) {
      const node = newNodes[i]!;
      const vec = vectors[i];
      if (!vec) continue;
      await upsertPyramidEmbedding({
        novelId: input.novelId,
        nodeId: node.id,
        layer: node.layer,
        summaryText: nodeSummaryForEmbedding(node),
        embedding: vec,
      });
    }
  } catch (err) {
    console.warn("[pyramid-graph-sync] embed failed (non-fatal)", err);
  }
}
