/**
 * Compile a locked prose brief per scene from pyramid graph + manifest +
 * optional vector neighbors. No continuous prose here — only the writing order
 * for the post-freeze strong-model draft hop.
 */

import { embedText } from "@/lib/ai/embeddings";
import {
  formatPyramidGraphForPrompt,
  getPyramidGraph,
} from "@/lib/novel/pyramid-graph";
import { matchPyramidEmbeddings } from "@/lib/novel/repository";
import type { NovelBundle, NovelScene } from "@/lib/novel/types";
import { formatContractForAuthor } from "@/lib/novel/chapter-contract";
import {
  detectToneModeFromBundle,
  formatToneContractForAuthor,
} from "@/lib/novel/tone-contract";
import { sceneManifestSchema } from "@/lib/novel/tree-schemas";

export type CompiledProseBrief = {
  sceneId: string;
  chapterNumber: number;
  sceneIndex: number;
  brief: string;
};

/**
 * Build one author-facing brief for a scene from frozen structure artifacts.
 */
export async function compileSceneProseBrief(input: {
  bundle: NovelBundle;
  scene: NovelScene;
}): Promise<string> {
  const { bundle, scene } = input;
  const chapter = bundle.chapters.find((c) => c.id === scene.chapterId);
  const chapterNumber = chapter?.chapterNumber ?? 0;
  const manifestParsed = sceneManifestSchema.safeParse(scene.manifest ?? {});
  const manifest = manifestParsed.success ? manifestParsed.data : null;
  const graph = getPyramidGraph(bundle);
  const graphBlock = formatPyramidGraphForPrompt(graph, {
    maxNodes: 40,
    maxLayer: "situations",
  });

  let neighborBlock = "";
  try {
    const query = [
      manifest?.sceneGoal ?? scene.planSummary,
      ...(manifest?.situations ?? []).slice(0, 3),
    ]
      .filter(Boolean)
      .join(" | ")
      .slice(0, 800);
    if (query.length >= 20) {
      const vec = await embedText(query);
      const hits = await matchPyramidEmbeddings({
        novelId: bundle.novel.id,
        queryEmbedding: vec,
        matchCount: 6,
        maxLayer: "situations",
        excludeNodeId: `scene:${chapterNumber}.${scene.sceneIndex}`,
      });
      if (hits.length) {
        neighborBlock = `# Graph-Nachbarn (Vektor)
${hits
  .map(
    (h) =>
      `- [${h.layer}] ${h.nodeId} (${h.similarity.toFixed(2)}): ${h.summaryText.slice(0, 160)}`,
  )
  .join("\n")}`;
      }
    }
  } catch {
    /* embeddings optional until migration + API */
  }

  const contract = formatContractForAuthor(chapter?.contract);
  const tone = formatToneContractForAuthor(detectToneModeFromBundle(bundle));
  const situations = (manifest?.situations ?? [])
    .map((s, i) => `${i + 1}. ${s}`)
    .join("\n");

  return `# Prosa-Brief Kap. ${chapterNumber}.${scene.sceneIndex}
Schreibauftrag — nur Struktur ausführen, keine neuen Plot-Fäden.

${tone ? `${tone}\n` : ""}
${contract ? `${contract}\n` : ""}

## Szenen-Manifest (immutable)
- Beat: ${manifest?.beat ?? "—"}
- Ziel: ${manifest?.sceneGoal ?? scene.planSummary}
- Ort: ${manifest?.location ?? scene.location}
- Figuren: ${(manifest?.characters ?? scene.characters).join(", ") || "—"}
- mustShow: ${(manifest?.mustShow ?? []).join(" · ") || "—"}
- mustNot: ${(manifest?.mustNot ?? []).join(" · ") || "—"}
- Wissen erlaubt: ${(manifest?.knowledgeAllowed ?? []).join(" · ") || "—"}
- Wissen verboten: ${(manifest?.knowledgeForbidden ?? []).join(" · ") || "—"}

## Situationen (Reihenfolge spielen)
${situations || "—"}

${graphBlock ? `${graphBlock}\n` : ""}
${neighborBlock}
`.trim();
}

export async function compileAllSceneProseBriefs(
  bundle: NovelBundle,
): Promise<CompiledProseBrief[]> {
  const out: CompiledProseBrief[] = [];
  const scenes = bundle.scenes
    .slice()
    .sort((a, b) => {
      const ca =
        bundle.chapters.find((c) => c.id === a.chapterId)?.chapterNumber ?? 0;
      const cb =
        bundle.chapters.find((c) => c.id === b.chapterId)?.chapterNumber ?? 0;
      if (ca !== cb) return ca - cb;
      return a.sceneIndex - b.sceneIndex;
    });
  for (const scene of scenes) {
    const chapter = bundle.chapters.find((c) => c.id === scene.chapterId);
    const brief = await compileSceneProseBrief({ bundle, scene });
    out.push({
      sceneId: scene.id,
      chapterNumber: chapter?.chapterNumber ?? 0,
      sceneIndex: scene.sceneIndex,
      brief,
    });
  }
  return out;
}
