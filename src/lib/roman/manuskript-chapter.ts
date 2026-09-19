/**
 * Single-chapter Manuskript Erzeugen / Verbessern / Gegenlesen.
 * Continuity: structured Kapitelgerüst beats + previous chapter ending + storyState
 * so isolated chapter work still reads as one book.
 */

import { generateText } from "@/lib/ai/provider";
import { runWithAiUsageCollector } from "@/lib/ai/usage-collector";
import { formatAutorBiasFromCharaktere } from "@/lib/roman/autor-bias";
import {
  emptyRomanEditorial,
  exposeTextFromEditorial,
  formatStoryStateForPrompt,
  type RomanStoryState,
} from "@/lib/roman/editorial";
import { formatCharaktere } from "@/lib/roman/fundament";
import {
  assembleManuskriptChapterContext,
  CONTINUITY_PREV_TAIL_CHARS,
  extractManuskriptStoryState,
} from "@/lib/roman/manuskript-continuity";
import { manuskriptNeedsPromptBlock } from "@/lib/roman/manuskript-contracts";
import { applyRouteTarget } from "@/lib/roman/pipeline/apply";
import {
  historyEvent,
  startPipelineHistoryRun,
  updatePipelineHistoryRun,
  type PipelineHistoryEvent,
} from "@/lib/roman/pipeline/history";
import {
  CLIP,
  ROMAN_CRITIQUE_FOCUS_MANDATE,
  ROMAN_CRITIQUE_MANDATE,
  ROMAN_CRITIQUE_MAX_TOKENS,
} from "@/lib/roman/pipeline/quality-brief";
import { patchChapterBodies } from "@/lib/roman/pipeline/structure-guard";
import {
  formatChapterHeading,
  formatManuskriptChapterHeading,
  normalizeManuskriptDocument,
  parsePlotChapters,
  type PlotChapter,
} from "@/lib/roman/plot-chapters";
import { getRomanKontext, upsertRomanKontext } from "@/lib/roman/repository";
import { resolveRomanKiRolle } from "@/lib/roman/roles";
import {
  briefManuskriptFromLektor,
  writeManuskriptChapterWithLengthGate,
} from "@/lib/roman/suggest-manuskript";
import { formatStructuredChapterForManuskript } from "@/lib/roman/szenenplot-structured";
import type { RomanKontext } from "@/lib/roman/types";

const SEAM_MANDATE = `Nahtlosigkeit (verbindlich bei Einzelkapitel):
- Lies das ENDE des Vorgänger-Kapitels genau: Ton, Ort, offene Bewegung, letzte Figur/Dialog.
- Der erste Absatz DIESES Kapitels muss sich wie die natürliche Fortsetzung anfühlen — kein Reset, kein erneutes Exposition-Dumping.
- Stimme, Register und Pacing aus dem Vorgänger übernehmen; Story-State und harte Fakten nicht widersprechen.
- Kapitelgerüst-Beats für DIESES Kapitel umsetzen, ohne den Faden zum Vorgänger zu reißen.`;

function requirePlotChapter(
  plot: string,
  chapterNumber: number,
): { chapters: PlotChapter[]; chapter: PlotChapter } {
  const chapters = parsePlotChapters(plot);
  if (chapters.length < 1) {
    throw new Error("Zuerst ein Kapitelgerüst mit Kapiteln anlegen.");
  }
  const chapter = chapters.find((c) => c.number === chapterNumber);
  if (!chapter) {
    throw new Error(
      `Kapitel ${chapterNumber} fehlt im Kapitelgerüst. Verfügbare Nummern: ${chapters.map((c) => c.number).join(", ")}.`,
    );
  }
  return { chapters, chapter };
}

/** Ensure Manuskript has all plot chapter slots (empty bodies OK). */
function ensureManuskriptSlots(plot: string, manuskript: string): string {
  return normalizeManuskriptDocument(manuskript.trim() || plot, {
    requiredFromPlot: plot,
  });
}

function previousChapterMarkdown(
  manuskript: string,
  chapterNumber: number,
): { markdown: string; tail: string; prev: PlotChapter | null } {
  const chapters = parsePlotChapters(manuskript);
  const prev = chapters.find((c) => c.number === chapterNumber - 1) ?? null;
  if (!prev) {
    return { markdown: "", tail: "", prev: null };
  }
  const markdown = `${formatManuskriptChapterHeading(prev)}\n\n${prev.body.trim()}`;
  const tail = prev.body.trim().slice(-CONTINUITY_PREV_TAIL_CHARS);
  return { markdown, tail, prev };
}

async function resolveStoryStateBeforeChapter(input: {
  existing: RomanStoryState | null;
  manuskript: string;
  chapterNumber: number;
}): Promise<RomanStoryState | null> {
  if (input.chapterNumber <= 1) return null;
  const existing = input.existing;
  if (existing && existing.afterChapter === input.chapterNumber - 1) {
    return existing;
  }
  const { prev } = previousChapterMarkdown(
    input.manuskript,
    input.chapterNumber,
  );
  if (!prev?.body.trim()) {
    return existing && existing.afterChapter < input.chapterNumber
      ? existing
      : null;
  }
  return extractManuskriptStoryState({
    previous:
      existing && existing.afterChapter < input.chapterNumber - 1
        ? existing
        : null,
    chapterNumber: prev.number,
    chapterTitle: prev.title,
    chapterBody: prev.body,
  });
}

async function loadRoman(romanId: string): Promise<RomanKontext> {
  const roman = await getRomanKontext(romanId);
  if (!roman) throw new Error("Buch nicht gefunden.");
  return roman;
}

async function persistManuskript(
  roman: RomanKontext,
  manuskriptText: string,
  storyState: RomanStoryState | null,
): Promise<RomanKontext> {
  const editorial = {
    ...(roman.editorial ?? emptyRomanEditorial()),
    manuskriptText,
    storyState,
  };
  const saved = await upsertRomanKontext({
    id: roman.id,
    title: roman.title,
    manuskriptRaw: roman.manuskriptRaw,
    stilbibel: roman.stilbibel,
    genre: roman.genre,
    praemisse: roman.praemisse,
    perspektive: roman.perspektive,
    zeitform: roman.zeitform,
    tonalitaet: roman.tonalitaet,
    charaktere: roman.charaktere,
    weltSchauplaetze: roman.weltSchauplaetze,
    weltRegeln: roman.weltRegeln,
    szenenRaster: roman.szenenRaster,
    kiRegelwerk: roman.kiRegelwerk,
    fanPersonaName: roman.fanPersonaName,
    fanPersonaProfil: roman.fanPersonaProfil,
    editorial,
  });
  return { ...saved, ideenChat: roman.ideenChat };
}

async function runChapterCritiqueText(input: {
  roman: RomanKontext;
  chapterNumber: number;
}): Promise<{ critiqueText: string; modelLabel: string }> {
  const roman = input.roman;
  const editorial = roman.editorial ?? emptyRomanEditorial();
  const plot = (roman.manuskriptRaw ?? "").trim();
  const { chapter: plotChapter } = requirePlotChapter(plot, input.chapterNumber);
  const manuskript = ensureManuskriptSlots(
    plot,
    editorial.manuskriptText ?? "",
  );
  const msChapters = parsePlotChapters(manuskript);
  const target = msChapters.find((c) => c.number === input.chapterNumber);
  if (!target?.body.trim()) {
    throw new Error(
      `Kapitel ${input.chapterNumber} hat noch keine Prosa — zuerst erzeugen.`,
    );
  }

  const { tail: prevTail, prev } = previousChapterMarkdown(
    manuskript,
    input.chapterNumber,
  );
  const storyStateBefore = await resolveStoryStateBeforeChapter({
    existing: editorial.storyState ?? null,
    manuskript,
    chapterNumber: input.chapterNumber,
  });
  const structured =
    formatStructuredChapterForManuskript(
      editorial.szenenplotStructured,
      input.chapterNumber,
    ) || plotChapter.body;

  const { rolle, model } = await resolveRomanKiRolle("entwicklungslektor");
  const critiqueText = (
    await generateText({
      model,
      systemInstruction: `${rolle.systemPrompt}

${ROMAN_CRITIQUE_MANDATE}

Zusatzauftrag Einzelkapitel-Gegenlese:
Nur DIESES Kapitel beurteilen. Übergang vom Vorgänger und Gerüst-Beats prüfen.
Max. 3 Punkte mit Wichtigkeit. Kein Umschreiben.`,
      userText: `# Kapitel ${input.chapterNumber} — Gegenlese

# Story-State (vor diesem Kapitel)
${formatStoryStateForPrompt(storyStateBefore) || "(kein State)"}

# Ende Vorgänger${prev ? ` (Kap. ${prev.number})` : ""}
${prevTail || "(Kapitel 1 — kein Vorgänger)"}

# Kapitelgerüst / Szenenbeats (verbindlich)
${formatChapterHeading(plotChapter)}
${structured.slice(0, 4_000)}

# Charaktere (kurz)
${formatCharaktere(roman.charaktere).slice(0, CLIP.charaktere / 4) || "—"}

# Exposé (kurz)
${exposeTextFromEditorial(editorial).slice(0, 2_000) || "—"}

# Manuskript-Kapitel (zu prüfen)
${formatManuskriptChapterHeading(target)}

${target.body.slice(0, CLIP.chapterBody)}

Auftrag:
1) Naht zum Vorgänger (Ton, Ort, offene Bewegung)
2) Gerüst-Beats umgesetzt?
3) Max. 3 konkrete Einbau-Vorschläge mit wichtigkeit kritisch|wichtig|nice_to_have

${ROMAN_CRITIQUE_FOCUS_MANDATE}

Form auf Deutsch, klar, nummeriert.`,
      maxTokens: ROMAN_CRITIQUE_MAX_TOKENS,
      timeoutMs: 90_000,
    })
  ).trim();

  if (!critiqueText) {
    throw new Error("Gegenlese lieferte keinen Text.");
  }
  return { critiqueText, modelLabel: model.label };
}

/**
 * Erzeugen / neu schreiben eines einzelnen Manuskript-Kapitels.
 */
export async function generateManuskriptChapter(input: {
  romanId: string;
  chapterNumber: number;
}): Promise<{
  roman: RomanKontext;
  summary: string;
  chapterNumber: number;
  runId: string;
}> {
  const roman = await loadRoman(input.romanId);
  const editorial = roman.editorial ?? emptyRomanEditorial();
  const plot = (roman.manuskriptRaw ?? "").trim();
  const { chapters, chapter: plotChapter } = requirePlotChapter(
    plot,
    input.chapterNumber,
  );

  const events: PipelineHistoryEvent[] = [];
  const runId = await startPipelineHistoryRun({
    romanId: roman.id,
    trigger: "manuskript_chapter",
    originStage: "manuskript",
    firstEvent: historyEvent({
      type: "info",
      stage: "manuskript",
      summary: `Kapitel ${input.chapterNumber} erzeugen`,
    }),
  });

  try {
    const baseline = ensureManuskriptSlots(
      plot,
      editorial.manuskriptText ?? "",
    );
    const { markdown: prevMd, tail: prevTail } = previousChapterMarkdown(
      baseline,
      input.chapterNumber,
    );
    const storyStateBefore = await resolveStoryStateBeforeChapter({
      existing: editorial.storyState ?? null,
      manuskript: baseline,
      chapterNumber: input.chapterNumber,
    });

    const brief = await briefManuskriptFromLektor({
      buchTyp: (editorial.buchTyp ?? "unbekannt") as never,
      title: roman.title,
      genre: roman.genre,
      ideeKurz: editorial.ideeKurz ?? "",
      grobRegeln: editorial.grobRegeln ?? "",
      editorial,
      charaktere: roman.charaktere,
      weltSchauplaetze: roman.weltSchauplaetze,
      weltRegeln: roman.weltRegeln,
      szenenplot: plot,
      existingManuskript: baseline,
    });

    const plotChapterFresh =
      brief.chapters.find((c) => c.number === input.chapterNumber) ??
      plotChapter;

    const { buffer: continuityBuffer } = await assembleManuskriptChapterContext({
      storyState: storyStateBefore,
      chapter: plotChapterFresh,
      previousTail: prevTail,
      sharedContextSnippet: brief.sharedContext,
      lektorBriefSnippet: `${brief.lektorBrief}\n\n${SEAM_MANDATE}`,
    });

    const { result: written, usage } = await runWithAiUsageCollector(() =>
      writeManuskriptChapterWithLengthGate({
        coAutorSystem: `${brief.coAutorSystem}\n\n${SEAM_MANDATE}`,
        sharedContext: brief.sharedContext,
        lektorBrief: `${brief.lektorBrief}\n\n${SEAM_MANDATE}`,
        chapter: plotChapterFresh,
        allChapters: chapters,
        previousChaptersMarkdown: prevMd,
        existingManuskript: baseline,
        weave: Boolean((editorial.manuskriptText ?? "").trim()),
        zielWortzahl: brief.zielWortzahl,
        zielWortzahlSzeneMax: brief.zielWortzahlSzeneMax,
        needsBlock: manuskriptNeedsPromptBlock(editorial),
        autorBias: formatAutorBiasFromCharaktere(roman.charaktere),
        continuityBuffer: `${continuityBuffer}\n\n${SEAM_MANDATE}`,
        szenenplotStructured: editorial.szenenplotStructured,
      }),
    );

    const body = parsePlotChapters(written.chapterMarkdown)[0]?.body ?? "";
    const patched = patchChapterBodies(
      baseline,
      [{ chapterNumber: input.chapterNumber, body }],
      "manuskript",
    );
    if (!patched.ok) {
      throw new Error(patched.error ?? "Kapitel konnte nicht eingefügt werden.");
    }
    const sealed = normalizeManuskriptDocument(patched.text, {
      requiredFromPlot: plot,
    });

    const storyState = await extractManuskriptStoryState({
      previous: storyStateBefore,
      chapterNumber: input.chapterNumber,
      chapterTitle: plotChapterFresh.title,
      chapterBody: body,
    });

    const saved = await persistManuskript(roman, sealed, storyState);
    events.push(
      historyEvent({
        type: "draft",
        stage: "manuskript",
        roleKey: "co_autor",
        summary: `Kapitel ${input.chapterNumber} geschrieben (${written.wordCount} Wörter)`,
        usage,
      }),
    );
    await updatePipelineHistoryRun({ runId, status: "ok", events });

    return {
      roman: saved,
      summary: `Kapitel ${input.chapterNumber} erzeugt (${written.wordCount} Wörter)${
        written.expanded ? " · nachgezogen auf Mindestlänge" : ""
      }.`,
      chapterNumber: input.chapterNumber,
      runId,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Kapitel erzeugen fehlgeschlagen.";
    events.push(
      historyEvent({ type: "error", stage: "manuskript", summary: message }),
    );
    await updatePipelineHistoryRun({ runId, status: "error", events });
    throw error instanceof Error ? error : new Error(message);
  }
}

/**
 * Gegenlesen eines einzelnen Kapitels (Prosa + max. 3 Punkte).
 */
export async function critiqueManuskriptChapter(input: {
  romanId: string;
  chapterNumber: number;
}): Promise<{
  critiqueText: string;
  summary: string;
  chapterNumber: number;
  modelLabel: string;
  runId: string;
}> {
  const roman = await loadRoman(input.romanId);
  const events: PipelineHistoryEvent[] = [];
  const runId = await startPipelineHistoryRun({
    romanId: roman.id,
    trigger: "manuskript_chapter",
    originStage: "manuskript",
    firstEvent: historyEvent({
      type: "info",
      stage: "manuskript",
      summary: `Kapitel ${input.chapterNumber} gegenlesen`,
    }),
  });

  try {
    const { result, usage } = await runWithAiUsageCollector(() =>
      runChapterCritiqueText({ roman, chapterNumber: input.chapterNumber }),
    );

    events.push(
      historyEvent({
        type: "critique",
        stage: "manuskript",
        roleKey: "entwicklungslektor",
        modelLabel: result.modelLabel,
        summary: `Gegenlese Kapitel ${input.chapterNumber}`,
        critiqueText: result.critiqueText.slice(0, 8_000),
        usage,
      }),
    );
    await updatePipelineHistoryRun({ runId, status: "ok", events });

    return {
      critiqueText: result.critiqueText,
      summary: `Gegenlese Kapitel ${input.chapterNumber} fertig.`,
      chapterNumber: input.chapterNumber,
      modelLabel: result.modelLabel,
      runId,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Gegenlese fehlgeschlagen.";
    events.push(
      historyEvent({ type: "error", stage: "manuskript", summary: message }),
    );
    await updatePipelineHistoryRun({ runId, status: "error", events });
    throw error instanceof Error ? error : new Error(message);
  }
}

/**
 * Verbessern eines einzelnen Kapitels: kurze Gegenlese → Co-Autor-Patch mit Continuity.
 */
export async function improveManuskriptChapter(input: {
  romanId: string;
  chapterNumber: number;
}): Promise<{
  roman: RomanKontext;
  summary: string;
  chapterNumber: number;
  critiqueText: string;
  runId: string;
}> {
  const roman = await loadRoman(input.romanId);
  const text = (roman.editorial ?? emptyRomanEditorial()).manuskriptText ?? "";
  if (!text.trim()) {
    throw new Error("Zuerst ein Manuskript anlegen — oder Kapitel erzeugen.");
  }

  const events: PipelineHistoryEvent[] = [];
  const runId = await startPipelineHistoryRun({
    romanId: roman.id,
    trigger: "manuskript_chapter",
    originStage: "manuskript",
    firstEvent: historyEvent({
      type: "info",
      stage: "manuskript",
      summary: `Kapitel ${input.chapterNumber} verbessern`,
    }),
  });

  try {
    const { result: critiqued, usage: critiqueUsage } =
      await runWithAiUsageCollector(() =>
        runChapterCritiqueText({
          roman,
          chapterNumber: input.chapterNumber,
        }),
      );

    events.push(
      historyEvent({
        type: "critique",
        stage: "manuskript",
        roleKey: "entwicklungslektor",
        modelLabel: critiqued.modelLabel,
        summary: `Gegenlese Kapitel ${input.chapterNumber}`,
        critiqueText: critiqued.critiqueText.slice(0, 8_000),
        usage: critiqueUsage,
      }),
    );

    const patchBrief = `ARBEITSAUFTRAG — Einzelkapitel ${input.chapterNumber} verbessern:
Setze die Gegenlese SICHTBAR in DIESEM Kapitel um.
${SEAM_MANDATE}
Keine Meta-Kommentare. Handlung und Figuren behalten.
Nur die wichtigsten 1–3 Punkte — kein Nice-to-have-Kosmetik, solange Härteres existiert.

# Gegenlese
${critiqued.critiqueText.slice(0, 5_000)}`;

    const { result: applied, usage: applyUsage } = await runWithAiUsageCollector(
      () =>
        applyRouteTarget({
          roman,
          critiqueText: critiqued.critiqueText,
          target: {
            stage: "manuskript",
            reason: `Einzelkapitel ${input.chapterNumber} Verbessern`,
            patchBrief,
            chapterNumbers: [input.chapterNumber],
          },
        }),
    );

    events.push(
      historyEvent({
        type: "apply",
        stage: "manuskript",
        roleKey: "co_autor",
        summary: applied.summary,
        usage: applyUsage,
      }),
    );
    await updatePipelineHistoryRun({ runId, status: "ok", events });

    return {
      roman: applied.roman,
      summary: `Kapitel ${input.chapterNumber} verbessert · ${applied.summary}`,
      chapterNumber: input.chapterNumber,
      critiqueText: critiqued.critiqueText,
      runId,
    };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Kapitel verbessern fehlgeschlagen.";
    events.push(
      historyEvent({ type: "error", stage: "manuskript", summary: message }),
    );
    await updatePipelineHistoryRun({ runId, status: "error", events });
    throw error instanceof Error ? error : new Error(message);
  }
}
