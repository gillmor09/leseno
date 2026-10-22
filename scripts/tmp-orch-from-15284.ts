/**
 * Zwei-Rollen State-Machine for greenfield Roman.
 * Hop-based: each call does one step and may return `continue` for self-kick.
 *
 * Phase A: style_guide → world_building → outline
 * Phase B: scene_plan → draft → review (≤3, fallback warn) → state_sync → next
 */

import { parseModelJsonObjectWithRepair } from "@/lib/ai/repair-model-json";
import { formatCanonPrefix } from "@/lib/novel/context";
import {
  editorReviewSchema,
  knowledgeGraphSyncSchema,
  outlineExtractSchema,
  scenePlanExtractSchema,
  styleGuideExtractSchema,
  worldBuildingExtractSchema,
} from "@/lib/novel/schemas";
import {
  generateAsAuthor,
  generateAsEditorJson,
} from "@/lib/novel/roles";
import {
  getNovelBundle,
  insertEditorFeedback,
  setOrchestratorStatus,
  upsertChapter,
  upsertKnowledgeGraph,
  upsertStyleGuide,
  upsertWorldBuilding,
} from "@/lib/novel/repository";
import type { NovelJobHop, OrchestratorStatus } from "@/lib/novel/types";

export type NovelJobOutcome =
  | { outcome: "ok" }
  | { outcome: "continue"; hop: NovelJobHop }
  | { outcome: "error"; message: string };

const LOW_SCORE_WARNING = "Geringer Lektorat-Score";

async function parseEditorJson<T>(
  raw: string,
  schema: { parse: (v: unknown) => T; safeParse: (v: unknown) => { success: boolean; data?: T; error?: unknown } },
  label: string,
): Promise<T> {
  const obj = await parseModelJsonObjectWithRepair({
    raw,
    label,
    modelSlug: "claude-haiku-5-5",
  });
  const parsed = schema.safeParse(obj);
  if (!parsed.success || parsed.data === undefined) {
    throw new Error(`${label}: JSON entspricht nicht dem Schema.`);
  }
  return parsed.data;
}

async function status(
  novelId: string,
  patch: OrchestratorStatus,
  novelStatus?: string,
): Promise<void> {
  await setOrchestratorStatus(novelId, patch, novelStatus);
}

function continueHop(hop: NovelJobHop): NovelJobOutcome {
  return { outcome: "continue", hop };
}

/**
 * Run one orchestrator hop. Caller persists progress and self-kicks on continue.
 */
export async function runNovelOrchestratorHop(
  hop: NovelJobHop,
): Promise<NovelJobOutcome> {
  const novelId = hop.novelId;
  try {
    const step = hop.step || "style_guide";

    if (step === "style_guide") {
      await status(
        novelId,
        {
          phase: "style_guide",
          label: "Lektor erstellt Styleguide…",
          step: "style_guide",
        },
        "setup",
      );
      const bundle = await getNovelBundle(novelId);
      if (!bundle) throw new Error("Roman nicht gefunden.");
      const raw = await generateAsEditorJson({
        userText: `Analysiere die High-Concept-Idee und erzeuge einen Styleguide als JSON:
{"genre":"…","subgenre":"…","primaryTone":"…","narrativePerspective":"…","styleRules":{"dos":["…"],"donts":["…"],"notes":"…"},"suggestedTitle":"…"}

Idee:
${bundle.novel.highConceptIdea}`,
      });
      const data = await parseEditorJson(
        raw,
        styleGuideExtractSchema,
        "Styleguide",
      );
      await upsertStyleGuide({
        novelId,
        genre: data.genre,
        subgenre: data.subgenre,
        primaryTone: data.primaryTone,
        narrativePerspective: data.narrativePerspective,
        styleRules: data.styleRules,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      if (data.suggestedTitle?.trim()) {
        const { updateNovel } = await import("@/lib/novel/repository");
        await updateNovel({
          id: novelId,
          title: data.suggestedTitle.trim().slice(0, 120),
        });
      }
      return continueHop({ novelId, step: "world_building" });
    }

    if (step === "world_building") {
      await status(novelId, {
        phase: "world_building",
        label: "Lektor baut Welt & Wissensgraph…",
        step: "world_building",
      });
      const bundle = await getNovelBundle(novelId);
      if (!bundle) throw new Error("Roman nicht gefunden.");
      const raw = await generateAsEditorJson({
        cacheablePrefix: formatCanonPrefix(bundle),
        userText: `Aus Idee + Styleguide: Weltenbau und initialer Wissensgraph als JSON:
{"characters":[{"name":"…","role":"…","goals":["…"],"initialKnowledge":["…"],"summary":"…"}],"loreRules":[…],"locations":[…],"entityStates":{…},"timelineEvents":[…]}`,
      });
      const data = await parseEditorJson(
        raw,
        worldBuildingExtractSchema,
        "Weltenbau",
      );
      const now = new Date().toISOString();
      await upsertWorldBuilding({
        novelId,
        characters: data.characters,
        loreRules: data.loreRules,
        locations: data.locations,
        createdAt: now,
        updatedAt: now,
      });
      await upsertKnowledgeGraph({
        novelId,
        entityStates: data.entityStates,
        timelineEvents: data.timelineEvents,
        createdAt: now,
        updatedAt: now,
      });
      return continueHop({ novelId, step: "outline" });
    }

    if (step === "outline") {
      await status(
        novelId,
        {
          phase: "outline",
          label: "Autor entwirft Kapitel-Outline…",
          step: "outline",
        },
        "outlining",
      );
      const bundle = await getNovelBundle(novelId);
      if (!bundle) throw new Error("Roman nicht gefunden.");
      const prose = await generateAsAuthor({
        cacheablePrefix: formatCanonPrefix(bundle),
        userText: `Erstelle eine 3-Akt-Kapitel-Outline (8–18 Kapitel) für diesen Roman.
Antwort NUR als JSON:
{"chapters":[{"chapterNumber":1,"title":"…","outline":"2–4 Sätze Kern"}…]`,
      });
      const data = await parseEditorJson(
        prose,
        outlineExtractSchema,
        "Outline",
      );
      for (const ch of data.chapters) {
        await upsertChapter({
          novelId,
          chapterNumber: ch.chapterNumber,
          title: ch.title,
          outline: ch.outline,
          scenePlan: [],
          rawDraft: "",
          finalText: "",
          status: "planned",
        });
      }
      return continueHop({
        novelId,
        step: "scene_plan",
        chapterNumber: data.chapters[0]!.chapterNumber,
      });
    }

    if (step === "scene_plan") {
      const chapterNumber = hop.chapterNumber ?? 1;
      await status(
        novelId,
        {
          phase: "scene_plan",
          label: `Autor plant Szenen für Kapitel ${chapterNumber}…`,
          step: "scene_plan",
          chapterNumber,
        },
        "writing",
      );
      const bundle = await getNovelBundle(novelId);
      if (!bundle) throw new Error("Roman nicht gefunden.");
      const chapter = bundle.chapters.find(
        (c) => c.chapterNumber === chapterNumber,
      );
      if (!chapter) throw new Error(`Kapitel ${chapterNumber} fehlt.`);
      const prose = await generateAsAuthor({
        cacheablePrefix: formatCanonPrefix(bundle),
        userText: `Kapitel ${chapterNumber} — ${chapter.title}
Outline: ${chapter.outline}

Erstelle einen Szenenplan als JSON:
{"scenes":[{"summary":"…","location":"…","characters":["…"]}…]}`,
      });
      const data = await parseEditorJson(
        prose,
        scenePlanExtractSchema,
        "Szenenplan",
      );
      await upsertChapter({
        ...chapter,
        scenePlan: data.scenes,
        status: "scene_planning",
      });
      return continueHop({
        novelId,
        step: "draft",
        chapterNumber,
        iteration: 1,
      });
    }

    if (step === "draft") {
      const chapterNumber = hop.chapterNumber ?? 1;
      const iteration = hop.iteration ?? 1;
      await status(novelId, {
        phase: "draft",
        label:
          iteration > 1
            ? `Autor überarbeitet Kapitel ${chapterNumber} (Runde ${iteration})…`
            : `Autor schreibt Kapitel ${chapterNumber}…`,
        step: "draft",
        chapterNumber,
        iteration,
      });
      const bundle = await getNovelBundle(novelId);
      if (!bundle) throw new Error("Roman nicht gefunden.");
      const chapter = bundle.chapters.find(
        (c) => c.chapterNumber === chapterNumber,
      );
      if (!chapter) throw new Error(`Kapitel ${chapterNumber} fehlt.`);

      let userText = `Schreibe Kapitel ${chapterNumber} („${chapter.title}“) als erzählende Prosa.
Outline: ${chapter.outline}
Szenenplan: ${JSON.stringify(chapter.scenePlan)}
Gib NUR den Kapiteltext (ohne „Kapitel N“-Überschrift).`;

      if (iteration > 1) {
        const lastFb = [...bundle.editorFeedbacks]
          .filter((f) => f.chapterId === chapter.id)
          .sort((a, b) => b.iteration - a.iteration)[0];
        userText = `Überarbeite Kapitel ${chapterNumber} anhand des Lektor-Feedbacks.
Bisheriger Text:
${chapter.rawDraft.slice(0, 40_000)}

Issues:
${(lastFb?.issues ?? []).map((i) => `- ${i}`).join("\n") || "- (keine)"}

Gib NUR den vollständigen neuen Kapiteltext.`;
      }

      const draft = await generateAsAuthor({
        cacheablePrefix: formatCanonPrefix(bundle),
        userText,
      });
      await upsertChapter({
        ...chapter,
        rawDraft: draft,
        status: "drafting",
      });
      return continueHop({
        novelId,
        step: "review",
        chapterNumber,
        iteration,
      });
    }

    if (step === "review") {
      const chapterNumber = hop.chapterNumber ?? 1;
      const iteration = Math.min(3, Math.max(1, hop.iteration ?? 1));
      await status(novelId, {
        phase: "review",
        label: `Lektor prüft Kapitel ${chapterNumber} (Runde ${iteration}/3)…`,
        step: "review",
        chapterNumber,
        iteration,
      });
      const bundle = await getNovelBundle(novelId);
      if (!bundle) throw new Error("Roman nicht gefunden.");
      const chapter = bundle.chapters.find(
        (c) => c.chapterNumber === chapterNumber,
      );
      if (!chapter) throw new Error(`Kapitel ${chapterNumber} fehlt.`);

      const raw = await generateAsEditorJson({
        cacheablePrefix: formatCanonPrefix(bundle),
        userText: `Bewerte dieses Kapitel auf Logik, Wissensstand, Pacing und Tonalität.
Antwort NUR als JSON:
{"approved":true|false,"score":0-100,"tone_score":0-100,"issues":["…"]}

Kapitel ${chapterNumber} — ${chapter.title}:
${chapter.rawDraft.slice(0, 50_000)}`,
      });
      const review = await parseEditorJson(
        raw,
        editorReviewSchema,
        "Lektorat",
      );

      await insertEditorFeedback({
        chapterId: chapter.id,
        iteration,
        score: review.score,
        toneAlignmentScore: review.tone_score,
        issues: review.issues,
        approved: review.approved,
      });

      if (review.approved) {
        await upsertChapter({
          ...chapter,
          finalText: chapter.rawDraft,
          status: "approved",
        });
        return continueHop({
          novelId,
          step: "state_sync",
          chapterNumber,
        });
      }

      if (iteration >= 3) {
        // Fallback: keep going with warning — do not abort the novel.
        const issues = [...review.issues];
        if (!issues.some((i) => /geringer lektorat/i.test(i))) {
          issues.unshift(LOW_SCORE_WARNING);
        }
        await insertEditorFeedback({
          chapterId: chapter.id,
          iteration: 3,
          score: review.score,
          toneAlignmentScore: review.tone_score,
          issues,
          approved: false,
        });
        await upsertChapter({
          ...chapter,
          finalText: chapter.rawDraft,
          status: "approved_with_warnings",
        });
        return continueHop({
          novelId,
          step: "state_sync",
          chapterNumber,
        });
      }

      return continueHop({
        novelId,
        step: "draft",
        chapterNumber,
        iteration: iteration + 1,
      });
    }

    if (step === "state_sync") {
      const chapterNumber = hop.chapterNumber ?? 1;
      await status(novelId, {
        phase: "state_sync",
        label: `Lektor aktualisiert Wissensgraph (Kap. ${chapterNumber})…`,
        step: "state_sync",
        chapterNumber,
      });
      const bundle = await getNovelBundle(novelId);
      if (!bundle) throw new Error("Roman nicht gefunden.");
      const chapter = bundle.chapters.find(
        (c) => c.chapterNumber === chapterNumber,
      );
      if (!chapter) throw new Error(`Kapitel ${chapterNumber} fehlt.`);
      const text = chapter.finalText || chapter.rawDraft;

      const raw = await generateAsEditorJson({
        cacheablePrefix: formatCanonPrefix(bundle),
        userText: `Extrahiere aus dem finalen Kapitel Wissensstände, Ereignisse und Gegenstände.
Antwort NUR als JSON:
{"entity_states":{…},"timeline_events":[…],"replace_entity_states":false}

Kapitel ${chapterNumber}:
${text.slice(0, 50_000)}`,
      });
      const sync = await parseEditorJson(
        raw,
        knowledgeGraphSyncSchema,
        "Wissensgraph-Sync",
      );
      const prev = bundle.knowledgeGraph;
      const now = new Date().toISOString();
      const entityStates = sync.replace_entity_states
        ? sync.entity_states
        : {
            ...(prev?.entityStates ?? {}),
            ...sync.entity_states,
          };
      const timelineEvents = [
        ...(prev?.timelineEvents ?? []),
        ...sync.timeline_events,
      ];
      await upsertKnowledgeGraph({
        novelId,
        entityStates,
        timelineEvents,
        createdAt: prev?.createdAt ?? now,
        updatedAt: now,
      });

      const nextChapter = bundle.chapters
        .filter((c) => c.chapterNumber > chapterNumber)
        .sort((a, b) => a.chapterNumber - b.chapterNumber)[0];

      if (nextChapter) {
        return continueHop({
          novelId,
          step: "scene_plan",
          chapterNumber: nextChapter.chapterNumber,
        });
      }

      await status(
        novelId,
        {
          phase: "completed",
          label: "Roman fertig — alle Kapitel durchgelaufen.",
          step: "completed",
        },
        "completed",
      );
      return { outcome: "ok" };
    }

    throw new Error(`Unbekannter Orchestrator-Schritt: ${step}`);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Orchestrator fehlgeschlagen.";
    await status(
      novelId,
      {
        phase: "error",
        label: message.slice(0, 200),
        step: hop.step,
        chapterNumber: hop.chapterNumber ?? null,
        iteration: hop.iteration ?? null,
        error: message,
      },
      "error",
    ).catch(() => undefined);
    return { outcome: "error", message };
  }
}

/** First hop after author clicks Start. */
export function initialNovelHop(novelId: string): NovelJobHop {
  return { novelId, step: "style_guide" };
}
