/**
 * Collapse novel orchestrator to a single write path (no fast/heavy mode).
 */
import { readFileSync, writeFileSync, unlinkSync } from "node:fs";

const orchPath = "src/lib/novel/novelOrchestrator.ts";
let s = readFileSync(orchPath, "utf8");

s = s.replace(
  /\/\*\*[\s\S]*?\*\/\n\nimport \{ isAiAbortError \}/,
  `/**
 * Zwei-Rollen State-Machine for greenfield Roman.
 * Hop-based: each call does one step and may return \`continue\` for self-kick.
 *
 * Single write path:
 * Phase A: style_guide → voice_discovery → world_building → outline (5-Kap. Qualitätsprobe)
 * Phase B: wave_dispatch → scene_plan (craft classes) → draft (tic gate) → approve
 * → completed (Abnahme under Export)
 *
 * Stale hops into former Heavy-only steps (review book-passes) are skipped/completed.
 */

import { isAiAbortError }`,
);

s = s.replace(
  /\nimport \{\n  entityStatesWithWriteMode,\n  getWriteMode,\n  isFastDraft,\n  WRITE_MODE_KEY,\n\} from "@\/lib\/novel\/write-mode";\n/,
  "\n",
);

// Heavy-only guard: always apply (remove isFastDraft check)
s = s.replace(
  `    // Heavy-only book passes must not run in Fast-Draft (e.g. stale resume).
    if (
      step === "manuscript_review" ||
      step === "revision_plan" ||
      step === "targeted_rewrite" ||
      step === "global_recheck" ||
      step === "timeline_pass" ||
      step === "formula_pass" ||
      step === "voice_rewrite" ||
      step === "state_sync"
    ) {
      const live = await getNovelBundle(novelId);
      if (live && isFastDraft(live)) {
        if (step === "state_sync") {
          const wavePrev = getWaveState(live);
          const flush = hop.waveSync
            ? wavePrev.activeChapters
            : [hop.chapterNumber ?? 0].filter((n) => n >= 1);
          const syncDone = [...new Set([...wavePrev.syncDone, ...flush])];
          const waveNext: WaveBatchState = {
            ...wavePrev,
            syncDone,
            waveIndex: wavePrev.waveIndex + 1,
            activeChapters: [],
            reviewDone: [],
            status: "idle",
            updatedAt: new Date().toISOString(),
          };
          await upsertKnowledgeGraph({
            novelId,
            entityStates: entityStatesWithWave(
              live.knowledgeGraph?.entityStates ?? {},
              waveNext,
            ),
            timelineEvents: live.knowledgeGraph?.timelineEvents ?? [],
          });
          return continueHop({ novelId, step: "wave_dispatch" });
        }
        await status(
          novelId,
          {
            phase: "completed",
            label:
              "Fast-Draft — Buch-Passes übersprungen. Abnahme unter Export.",
            step: "completed",
          },
          "completed",
        );
        return { outcome: "ok" };
      }
    }`,
  `    // Former Heavy-only book passes — skip (single write path).
    if (
      step === "manuscript_review" ||
      step === "revision_plan" ||
      step === "targeted_rewrite" ||
      step === "global_recheck" ||
      step === "timeline_pass" ||
      step === "formula_pass" ||
      step === "voice_rewrite" ||
      step === "state_sync"
    ) {
      const live = await getNovelBundle(novelId);
      if (!live) throw new Error("Roman nicht gefunden.");
      if (step === "state_sync") {
        const wavePrev = getWaveState(live);
        const flush = hop.waveSync
          ? wavePrev.activeChapters
          : [hop.chapterNumber ?? 0].filter((n) => n >= 1);
        const syncDone = [...new Set([...wavePrev.syncDone, ...flush])];
        const waveNext: WaveBatchState = {
          ...wavePrev,
          syncDone,
          waveIndex: wavePrev.waveIndex + 1,
          activeChapters: [],
          reviewDone: [],
          status: "idle",
          updatedAt: new Date().toISOString(),
        };
        await upsertKnowledgeGraph({
          novelId,
          entityStates: entityStatesWithWave(
            live.knowledgeGraph?.entityStates ?? {},
            waveNext,
          ),
          timelineEvents: live.knowledgeGraph?.timelineEvents ?? [],
        });
        return continueHop({ novelId, step: "wave_dispatch" });
      }
      await status(
        novelId,
        {
          phase: "completed",
          label:
            "Qualitätsprobe fertig — Buch-Passes entfallen. Abnahme unter Export.",
          step: "completed",
        },
        "completed",
      );
      return { outcome: "ok" };
    }`,
);

// Remove write-mode persist in style_guide
s = s.replace(
  `      // Persist write mode once (env default) so hops stay consistent.
      if (bundle.knowledgeGraph?.entityStates?.[WRITE_MODE_KEY] == null) {
        await upsertKnowledgeGraph({
          novelId,
          entityStates: entityStatesWithWriteMode(
            bundle.knowledgeGraph?.entityStates ?? {},
            getWriteMode(bundle),
          ),
          timelineEvents: bundle.knowledgeGraph?.timelineEvents ?? [],
        });
      }
      const raw = await generateAsEditorJson({`,
  `      const raw = await generateAsEditorJson({`,
);

// wave_dispatch: always complete when pending empty
s = s.replace(
  `      const bundle = await getNovelBundle(novelId);
      if (!bundle) throw new Error("Roman nicht gefunden.");
      const fast = isFastDraft(bundle);
      const waveSize = resolveWaveSize();
      const prev = getWaveState(bundle);
      const pending = pendingChapterNumbers(bundle);
      if (pending.length === 0) {
        if (fast) {
          await status(
            novelId,
            {
              phase: "completed",
              label:
                "Qualitätsprobe fertig — Abnahme unter Export. Bei KI-Gate: nicht nachschreiben, Prozess prüfen.",
              step: "completed",
            },
            "completed",
          );
          return { outcome: "ok" };
        }
        await status(novelId, {
          phase: "manuscript_review",
          label: "Alle Wellen fertig — Buch-Strukturreview…",
          step: "manuscript_review",
        });
        return continueHop({ novelId, step: "manuscript_review" });
      }`,
  `      const bundle = await getNovelBundle(novelId);
      if (!bundle) throw new Error("Roman nicht gefunden.");
      const waveSize = resolveWaveSize();
      const prev = getWaveState(bundle);
      const pending = pendingChapterNumbers(bundle);
      if (pending.length === 0) {
        await status(
          novelId,
          {
            phase: "completed",
            label:
              "Qualitätsprobe fertig — Abnahme unter Export. Bei KI-Gate: nicht nachschreiben, Prozess prüfen.",
            step: "completed",
          },
          "completed",
        );
        return { outcome: "ok" };
      }`,
);

s = s.replace(
  `label: \`\${fast ? "Fast-Draft · " : ""}Welle \${wave.waveIndex + 1}: Kap. \${activeChapters.join(", ")} parallel…\`,`,
  `label: \`Welle \${wave.waveIndex + 1}: Kap. \${activeChapters.join(", ")} parallel…\`,`,
);

// wave_barrier: always take the former fast branch — find and simplify
// Look for `if (isFastDraft(bundle))` near wave_barrier
if (!s.includes("isFastDraft")) {
  console.log("note: isFastDraft already gone from some places");
}

writeFileSync(orchPath, s);
console.log({
  stillIsFast: s.includes("isFastDraft"),
  stillWriteMode: s.includes("write-mode") || s.includes("WRITE_MODE"),
  stillGetWriteMode: s.includes("getWriteMode"),
});
