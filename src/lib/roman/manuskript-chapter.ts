/**
 * Single-chapter Manuskript Erzeugen / Verbessern / Gegenlesen.
 * Continuity: structured Kapitelgerüst beats + previous chapter ending + storyState
 * so isolated chapter work still reads as one book.
 */

import { generateText } from "@/lib/ai/provider";
import { runWithAiUsageCollector } from "@/lib/ai/usage-collector";
import { formatAutorBiasFromCharaktere } from "@/lib/roman/autor-bias";
import {
  cleverKapitelForStory,
  hasRealCleverGeschichteProse,
  stripErzaehlerWrappers,
  writeCleverGeschichte,
} from "@/lib/roman/clever-geschichte";
import { applyCleverThemaTitlesToManuskript } from "@/lib/roman/clever-unterthemen";
import { formatCleverGeschichteBrief } from "@/lib/roman/clever-erzaehlt";
import {
  actionableAenderungsPrompts,
  countWords,
  emptyRomanEditorial,
  exposeTextFromEditorial,
  formatReifegradImprovePatchBrief,
  formatStoryStateForPrompt,
  onlyNiceToHavePrompts,
  parseAenderungsPrompts,
  parseRomanReifegradImprovePlan,
  type RomanEditorial,
  type RomanReifegradImprovePlan,
  type RomanStoryState,
} from "@/lib/roman/editorial";
import { parseModelJsonObject } from "@/lib/ai/parse-model-json";
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
  scrubManuskriptChapterBody,
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

/** Clever erzählt: each chapter is a standalone adventure Kurzgeschichte. */
const CLEVER_STORY_MANDATE = `Unabhängige Abenteuer-Kurzgeschichte (verbindlich):
- Dies ist KEINE Fortsetzung und kein Kapitel eines Romans — kein Bezug zum Vorgänger.
- Eigenständiges Abenteuer: Figur mit Ziel, Hindernis, Wendepunkt, Erkenntnis.
- Stoff: Unterthema + geprüfte Fakten DIESES Kapitels + Buch-Vorgaben (Alter, Länge, Erzählstil).
- Am Ende der Handlung die Erkenntnis spürbar machen — keine Faktliste im Prosatext.
- Keine Cliffhanger, die „im nächsten Kapitel“ weitergehen.`;

function requirePlotChapter(
  plot: string,
  chapterNumber: number,
  clever = false,
): { chapters: PlotChapter[]; chapter: PlotChapter } {
  const chapters = parsePlotChapters(plot);
  if (chapters.length < 1) {
    throw new Error(
      clever
        ? "Zuerst Unterthemen erzeugen."
        : "Zuerst ein Kapitelgerüst mit Kapiteln anlegen.",
    );
  }
  const chapter = chapters.find((c) => c.number === chapterNumber);
  if (!chapter) {
    throw new Error(
      `${clever ? "Geschichte" : "Kapitel"} ${chapterNumber} fehlt${
        clever ? " in den Unterthemen" : " im Kapitelgerüst"
      }. Verfügbare Nummern: ${chapters.map((c) => c.number).join(", ")}.`,
    );
  }
  return { chapters, chapter };
}

/** Ensure Manuskript has all plot chapter slots (empty bodies OK). */
function ensureManuskriptSlots(
  plot: string,
  manuskript: string,
  options?: {
    titlesFromPlot?: boolean;
    unterthemen?: import("@/lib/roman/editorial").CleverUnterthemen | null;
  },
): string {
  let text = normalizeManuskriptDocument(manuskript.trim() || plot, {
    requiredFromPlot: plot,
    titlesFromPlot: options?.titlesFromPlot,
  });
  if (options?.unterthemen) {
    text = applyCleverThemaTitlesToManuskript(text, options.unterthemen);
  }
  return text;
}

/** Clever: Thema titles are SoT for Manuskript headings. */
function cleverTitleSyncOpts(editorial: RomanEditorial) {
  return {
    titlesFromPlot: true as const,
    unterthemen: editorial.cleverUnterthemen,
  };
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
  editorialExtra?: Partial<RomanEditorial>,
): Promise<RomanKontext> {
  const editorial = {
    ...(roman.editorial ?? emptyRomanEditorial()),
    ...editorialExtra,
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

/** Drop open Verbessern plan + apply-count + OK for one Clever story (e.g. after Neu erzeugen). */
function clearCleverImproveForChapter(
  editorial: RomanEditorial,
  chapterNumber: number,
): Pick<
  RomanEditorial,
  | "cleverGeschichteImprove"
  | "cleverGeschichteImproveCount"
  | "cleverGeschichteOk"
> {
  const key = String(chapterNumber);
  const improve = { ...(editorial.cleverGeschichteImprove ?? {}) };
  delete improve[key];
  const counts = { ...(editorial.cleverGeschichteImproveCount ?? {}) };
  delete counts[key];
  const ok = { ...(editorial.cleverGeschichteOk ?? {}) };
  delete ok[key];
  return {
    cleverGeschichteImprove:
      Object.keys(improve).length > 0 ? improve : null,
    cleverGeschichteImproveCount:
      Object.keys(counts).length > 0 ? counts : null,
    cleverGeschichteOk: Object.keys(ok).length > 0 ? ok : null,
  };
}

async function runChapterCritiqueText(input: {
  roman: RomanKontext;
  chapterNumber: number;
}): Promise<{ critiqueText: string; modelLabel: string }> {
  const roman = input.roman;
  const editorial = roman.editorial ?? emptyRomanEditorial();
  const isClever = editorial.buchTyp === "clever_erzaehlt";
  const unit = isClever ? "Geschichte" : "Kapitel";
  const plot = (roman.manuskriptRaw ?? "").trim();
  const { chapter: plotChapter } = requirePlotChapter(
    plot,
    input.chapterNumber,
    isClever,
  );
  const manuskript = ensureManuskriptSlots(
    plot,
    editorial.manuskriptText ?? "",
    isClever ? cleverTitleSyncOpts(editorial) : undefined,
  );
  const msChapters = parsePlotChapters(manuskript);
  const target = msChapters.find((c) => c.number === input.chapterNumber);
  if (!target?.body.trim()) {
    throw new Error(
      `${unit} ${input.chapterNumber} hat noch keinen Text — zuerst erzeugen.`,
    );
  }

  const { tail: prevTail, prev } = isClever
    ? { tail: "", prev: null }
    : previousChapterMarkdown(manuskript, input.chapterNumber);
  const storyStateBefore = isClever
    ? null
    : await resolveStoryStateBeforeChapter({
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

${
  isClever
    ? `Zusatzauftrag Kurzgeschichten-Gegenlese:
Nur DIESE eigenständige Abenteuer-Geschichte beurteilen (Spannung, Lernpunkt, Altersgerechtheit).
Prüfe: Wirken die Fakten im Abenteuer erlebt? (Faktliste gehört nicht in die Prosa.)
Kein Fortsetzungs-/Naht-Check zum Vorgänger. Max. 3 Punkte mit Wichtigkeit. Kein Umschreiben.`
    : `Zusatzauftrag Einzelkapitel-Gegenlese:
Nur DIESES Kapitel beurteilen. Übergang vom Vorgänger und Gerüst-Beats prüfen.
Max. 3 Punkte mit Wichtigkeit. Kein Umschreiben.`
}`,
      userText: isClever
        ? `# Geschichte ${input.chapterNumber} — Gegenlese

# Unterthema / Stoff
${formatChapterHeading(plotChapter)}
${structured.slice(0, 4_000)}

# Buch-Kontext (kurz)
Titel: ${roman.title || "—"}
Thema: ${roman.genre || "—"}
${exposeTextFromEditorial(editorial).slice(0, 1_500) || ""}

# Kurzgeschichte (zu prüfen)
${formatManuskriptChapterHeading(target)}

${target.body.slice(0, CLIP.chapterBody)}

Auftrag:
1) Abenteuer-Spannung (Ziel → Hindernis → Wendung)?
2) Fakten erlebt (nicht doziniert)? Keine Faktliste in der Prosa?
3) Max. 3 konkrete Einbau-Vorschläge mit wichtigkeit kritisch|wichtig|nice_to_have

${ROMAN_CRITIQUE_FOCUS_MANDATE}

Form auf Deutsch, klar, nummeriert.`
        : `# Kapitel ${input.chapterNumber} — Gegenlese

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
  const isClever = editorial.buchTyp === "clever_erzaehlt";
  const plot = (roman.manuskriptRaw ?? "").trim();
  const { chapters, chapter: plotChapter } = requirePlotChapter(
    plot,
    input.chapterNumber,
    isClever,
  );

  const unit = isClever ? "Geschichte" : "Kapitel";

  const events: PipelineHistoryEvent[] = [];
  const runId = await startPipelineHistoryRun({
    romanId: roman.id,
    trigger: "manuskript_chapter",
    originStage: "manuskript",
    firstEvent: historyEvent({
      type: "info",
      stage: "manuskript",
      summary: `${unit} ${input.chapterNumber} erzeugen`,
    }),
  });

  try {
    const baseline = ensureManuskriptSlots(
      plot,
      editorial.manuskriptText ?? "",
      isClever ? cleverTitleSyncOpts(editorial) : undefined,
    );

    if (isClever) {
      const kap = cleverKapitelForStory(editorial, input.chapterNumber);
      if (!kap) {
        throw new Error(
          `Unterthema für Geschichte ${input.chapterNumber} fehlt. Zuerst Unterthemen erzeugen.`,
        );
      }
      const { result: written, usage } = await runWithAiUsageCollector(() =>
        writeCleverGeschichte({
          thema: (roman.genre ?? "").trim() || kap.titel,
          editorial,
          kapitel: kap,
        }),
      );
      const patched = patchChapterBodies(
        baseline,
        [{ chapterNumber: input.chapterNumber, body: written.body }],
        "manuskript",
      );
      if (!patched.ok) {
        throw new Error(
          patched.error ?? "Geschichte konnte nicht eingefügt werden.",
        );
      }
      const sealed = applyCleverThemaTitlesToManuskript(
        normalizeManuskriptDocument(patched.text, {
          requiredFromPlot: plot,
          titlesFromPlot: true,
        }),
        editorial.cleverUnterthemen,
      );      const { generateCleverKapitelInfografik } = await import(
        "@/lib/roman/clever-infografik"
      );
      const { kapitel: kapWithImage } = await generateCleverKapitelInfografik({
        thema: (roman.genre ?? "").trim() || kap.titel,
        editorial: { ...editorial, manuskriptText: sealed },
        kapitel: kap,
        storyBody: written.body,
        tonalitaet: roman.tonalitaet,
      });
      const doc = editorial.cleverUnterthemen;
      const nextUnterthemen = doc
        ? {
            ...doc,
            kapitel: doc.kapitel.map((k) =>
              k.nummer === kapWithImage.nummer ? kapWithImage : k,
            ),
          }
        : null;
      const saved = await persistManuskript(
        roman,
        sealed,
        editorial.storyState ?? null,
        {
          cleverUnterthemen: nextUnterthemen,
          ...clearCleverImproveForChapter(editorial, input.chapterNumber),
        },
      );
      events.push(
        historyEvent({
          type: "draft",
          stage: "manuskript",
          roleKey: "clever_erzaehler",
          summary: `Geschichte ${input.chapterNumber} + Infografik (${written.wordCount} Wörter)`,
          usage,
          modelLabel: written.modelLabel,
        }),
      );
      await updatePipelineHistoryRun({ runId, status: "ok", events });
      return {
        roman: saved,
        summary: `Geschichte ${input.chapterNumber} + Infografik erzeugt (${written.wordCount} Wörter).`,
        chapterNumber: input.chapterNumber,
        runId,
      };
    }

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
      throw new Error(
        patched.error ?? "Kapitel konnte nicht eingefügt werden.",
      );
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
      error instanceof Error
        ? error.message
        : `${unit} erzeugen fehlgeschlagen.`;
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
 * Verbessern eines einzelnen Kapitels / einer Kurzgeschichte.
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
  const editorial = roman.editorial ?? emptyRomanEditorial();
  const isClever = editorial.buchTyp === "clever_erzaehlt";
  const unit = isClever ? "Geschichte" : "Kapitel";
  const text = editorial.manuskriptText ?? "";
  if (!text.trim()) {
    throw new Error(
      isClever
        ? "Zuerst eine Kurzgeschichte erzeugen."
        : "Zuerst ein Manuskript anlegen — oder Kapitel erzeugen.",
    );
  }

  const events: PipelineHistoryEvent[] = [];
  const runId = await startPipelineHistoryRun({
    romanId: roman.id,
    trigger: "manuskript_chapter",
    originStage: "manuskript",
    firstEvent: historyEvent({
      type: "info",
      stage: "manuskript",
      summary: `${unit} ${input.chapterNumber} verbessern`,
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
        summary: `Gegenlese ${unit} ${input.chapterNumber}`,
        critiqueText: critiqued.critiqueText.slice(0, 8_000),
        usage: critiqueUsage,
      }),
    );

    const patchBrief = isClever
      ? `ARBEITSAUFTRAG — Kurzgeschichte ${input.chapterNumber} verbessern:
Setze die Gegenlese SICHTBAR in DIESER Geschichte um.
${CLEVER_STORY_MANDATE}
Keine Meta-Kommentare. Lernpunkt behalten.
Nur die wichtigsten 1–3 Punkte — kein Nice-to-have-Kosmetik, solange Härteres existiert.

# Gegenlese
${critiqued.critiqueText.slice(0, 5_000)}`
      : `ARBEITSAUFTRAG — Einzelkapitel ${input.chapterNumber} verbessern:
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
            reason: `${unit} ${input.chapterNumber} Verbessern`,
            patchBrief,
            chapterNumbers: [input.chapterNumber],
          },
        }),
    );

    let savedRoman = applied.roman;
    if (isClever) {
      const { stripErzaehlerWrappers } = await import(
        "@/lib/roman/clever-geschichte"
      );
      const ed = savedRoman.editorial ?? emptyRomanEditorial();
      const plot = (savedRoman.manuskriptRaw ?? "").trim();
      const ms = ed.manuskriptText ?? "";
      const chapters = parsePlotChapters(ms);
      const target = chapters.find((c) => c.number === input.chapterNumber);
      if (target) {
        const body = stripErzaehlerWrappers(target.body);
        if (body !== target.body.trim()) {
          const patched = patchChapterBodies(
            ms,
            [{ chapterNumber: input.chapterNumber, body }],
            "manuskript",
          );
          if (patched.ok) {
            const sealed = applyCleverThemaTitlesToManuskript(
              normalizeManuskriptDocument(patched.text, {
                requiredFromPlot: plot,
                titlesFromPlot: true,
              }),
              ed.cleverUnterthemen,
            );
            savedRoman = await persistManuskript(
              savedRoman,
              sealed,
              ed.storyState ?? null,
            );
          }
        }
      }
    }

    events.push(
      historyEvent({
        type: "apply",
        stage: "manuskript",
        roleKey: isClever ? "clever_erzaehler" : "co_autor",
        summary: applied.summary,
        usage: applyUsage,
      }),
    );
    await updatePipelineHistoryRun({ runId, status: "ok", events });

    return {
      roman: savedRoman,
      summary: `${unit} ${input.chapterNumber} verbessert · ${applied.summary}`,
      chapterNumber: input.chapterNumber,
      critiqueText: critiqued.critiqueText,
      runId,
    };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : `${unit} verbessern fehlgeschlagen.`;
    events.push(
      historyEvent({ type: "error", stage: "manuskript", summary: message }),
    );
    await updatePipelineHistoryRun({ runId, status: "error", events });
    throw error instanceof Error ? error : new Error(message);
  }
}
function stripEntscheidungenFromPlan(
  plan: RomanReifegradImprovePlan,
): RomanReifegradImprovePlan {
  return {
    ...plan,
    aenderungsPrompts: plan.aenderungsPrompts.map((p) => ({
      ...p,
      entscheidungNoetig: false,
      entscheidungFrage: "",
    })),
  };
}

function parseCleverGeschichteImproveRaw(
  raw: string,
  meta: { chapterNumber: number; modelLabel: string },
): RomanReifegradImprovePlan {
  const obj = parseModelJsonObject(raw, "Kurzgeschichten-Analyse");
  let kritik = String(
    obj.kritik ?? obj.critique ?? obj.leserFeedback ?? "",
  ).trim();
  let prompts = parseAenderungsPrompts(obj.aenderungsPrompts);
  if (prompts.length === 0) {
    const brief = String(
      obj.patchBrief ?? obj.patch_brief ?? obj.brief ?? "",
    ).trim();
    if (brief.length >= 20) {
      prompts = [
        {
          titel: "Nacharbeit",
          scope: "lokal",
          kapitel: [meta.chapterNumber],
          anweisung: brief.slice(0, 4_000),
          wichtigkeit: "wichtig",
        },
      ];
    }
  }
  prompts = prompts.map((p) => ({
    ...p,
    scope: "lokal" as const,
    kapitel: p.kapitel.length > 0 ? p.kapitel : [meta.chapterNumber],
    entscheidungNoetig: false,
    entscheidungFrage: "",
  }));
  if (!kritik) {
    kritik =
      prompts.length === 0
        ? "Keine Pflichtpunkte mehr — diese Geschichte wirkt in Ordnung."
        : onlyNiceToHavePrompts(prompts)
          ? "Nur noch Nice-to-have — keine harten Pflichtpunkte."
          : "Kurzanalyse.";
  }
  const plan =
    parseRomanReifegradImprovePlan(
      {
        kritik,
        aenderungsPrompts: prompts,
        stage: "geschichte",
        dimension: `geschichte-${meta.chapterNumber}`,
        dimensionLabel: `Geschichte ${meta.chapterNumber}`,
        modelLabel: meta.modelLabel,
        createdAt: new Date().toISOString(),
        appliedAt: null,
      },
      "geschichte",
    ) ??
    ({
      createdAt: new Date().toISOString(),
      stage: "geschichte",
      dimension: `geschichte-${meta.chapterNumber}`,
      dimensionLabel: `Geschichte ${meta.chapterNumber}`,
      modelLabel: meta.modelLabel,
      kritik,
      aenderungsPrompts: prompts,
      appliedAt: null,
    } satisfies RomanReifegradImprovePlan);
  return stripEntscheidungenFromPlan(plan);
}

async function persistCleverImproveMap(
  roman: RomanKontext,
  map: Record<string, RomanReifegradImprovePlan> | null,
  counts?: Record<string, number> | null,
  okMap?: Record<string, true> | null,
  /** Optional: heal Manuskript headings to match Unterthemen (Thema = SoT). */
  manuskriptText?: string | null,
): Promise<RomanKontext> {
  const prev = roman.editorial ?? emptyRomanEditorial();
  const editorial = {
    ...prev,
    ...(manuskriptText != null ? { manuskriptText } : {}),
    cleverGeschichteImprove:
      map && Object.keys(map).length > 0 ? map : null,
    ...(counts !== undefined
      ? {
          cleverGeschichteImproveCount:
            counts && Object.keys(counts).length > 0 ? counts : null,
        }
      : {}),
    ...(okMap !== undefined
      ? {
          cleverGeschichteOk:
            okMap && Object.keys(okMap).length > 0 ? okMap : null,
        }
      : {}),
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

/**
 * Clever: Leser analyzes one Kurzgeschichte → structured plan (no weave).
 */
export async function analyzeCleverGeschichteVerbessern(input: {
  romanId: string;
  chapterNumber: number;
}): Promise<{
  roman: RomanKontext;
  plan: RomanReifegradImprovePlan;
  summary: string;
  runId: string;
}> {
  const roman = await loadRoman(input.romanId);
  const editorial = roman.editorial ?? emptyRomanEditorial();
  if (editorial.buchTyp !== "clever_erzaehlt") {
    throw new Error("Nur für Clever-erzählt-Bücher.");
  }

  const events: PipelineHistoryEvent[] = [];
  const runId = await startPipelineHistoryRun({
    romanId: roman.id,
    trigger: "manuskript_chapter",
    originStage: "manuskript",
    firstEvent: historyEvent({
      type: "info",
      stage: "manuskript",
      summary: `Geschichte ${input.chapterNumber} Verbessern-Analyse`,
    }),
  });

  try {
    const plot = (roman.manuskriptRaw ?? "").trim();
    const { chapter: plotChapter } = requirePlotChapter(
      plot,
      input.chapterNumber,
      true,
    );
    const manuskript = ensureManuskriptSlots(
      plot,
      editorial.manuskriptText ?? "",
      cleverTitleSyncOpts(editorial),
    );
    const target = parsePlotChapters(manuskript).find(
      (c) => c.number === input.chapterNumber,
    );
    if (!target?.body.trim() || !hasRealCleverGeschichteProse(target.body)) {
      throw new Error(
        `Geschichte ${input.chapterNumber} hat noch keinen Text — zuerst erzeugen.`,
      );
    }

    const kap = cleverKapitelForStory(editorial, input.chapterNumber);
    const { rolle, model } = await resolveRomanKiRolle("clever_leser");
    const { result: raw, usage } = await runWithAiUsageCollector(() =>
      generateText({
        model,
        systemInstruction: `${rolle.systemPrompt}

Du lieferst eine Verbessern-Analyse als JSON — KEINE Umschrift der Geschichte.

Regeln:
- Nur DIESE Kurzgeschichte beurteilen.
- Max. 3 aenderungsPrompts (WO + WAS), Wichtigkeit kritisch|wichtig|nice_to_have.
- KEINE Autor-Entscheidungen: entscheidungNoetig immer false, keine entscheidungFrage.
- NIEMALS den Kapitel-/Unterthema-Titel umbenennen lassen — der Titel kommt aus den Unterthemen und ist verbindlich.
- Wenn die Geschichte trägt: kurze kritik + leeres aenderungsPrompts-Array.

Nur JSON:
{
  "kritik": "…",
  "aenderungsPrompts": [
    {
      "titel": "…",
      "wichtigkeit": "wichtig",
      "scope": "lokal",
      "kapitel": [${input.chapterNumber}],
      "anweisung": "…",
      "entscheidungNoetig": false
    }
  ]
}`,
        userText: `# Geschichte ${input.chapterNumber} — Verbessern-Analyse

# Unterthema (verbindlicher Titel)
${kap ? `## Kapitel ${kap.nummer}: ${kap.titel}` : formatChapterHeading(plotChapter)}
${(kap?.fakten ?? []).map((f, i) => `${i + 1}. ${f}`).join("\n") || "(keine Fakten)"}

# Buch
Titel: ${roman.title || "—"}
Thema: ${roman.genre || "—"}

# Kurzgeschichte
${formatManuskriptChapterHeading({
  number: target.number,
  title: kap?.titel?.trim() || target.title,
  body: target.body,
})}

${target.body.slice(0, CLIP.chapterBody)}

Analysiere jetzt (nur JSON).`,
        preferJson: true,
        maxTokens: ROMAN_CRITIQUE_MAX_TOKENS,
        timeoutMs: 90_000,
        reasoningEffort: "low",
      }),
    );

    const plan = parseCleverGeschichteImproveRaw(raw, {
      chapterNumber: input.chapterNumber,
      modelLabel: model.label,
    });

    const prevMap = { ...(editorial.cleverGeschichteImprove ?? {}) };
    prevMap[String(input.chapterNumber)] = plan;
    // New analysis reopens the chapter — clear prior Fertig/OK.
    const okMap = { ...(editorial.cleverGeschichteOk ?? {}) };
    delete okMap[String(input.chapterNumber)];
    const saved = await persistCleverImproveMap(
      roman,
      prevMap,
      undefined,
      Object.keys(okMap).length > 0 ? okMap : null,
      // Heal heading drift so Verbessern stops asking to rename titles.
      manuskript !== (editorial.manuskriptText ?? "") ? manuskript : null,
    );

    events.push(
      historyEvent({
        type: "critique",
        stage: "manuskript",
        roleKey: "clever_leser",
        modelLabel: model.label,
        summary: `Analyse Geschichte ${input.chapterNumber} · ${plan.aenderungsPrompts.length} Aufträge`,
        critiqueText: plan.kritik.slice(0, 8_000),
        usage,
      }),
    );
    await updatePipelineHistoryRun({ runId, status: "ok", events });

    const actionable = actionableAenderungsPrompts(plan.aenderungsPrompts);
    const summary =
      actionable.length === 0
        ? onlyNiceToHavePrompts(plan.aenderungsPrompts)
          ? `Geschichte ${input.chapterNumber}: nur Nice-to-have.`
          : `Geschichte ${input.chapterNumber}: keine Pflichtpunkte.`
        : `Geschichte ${input.chapterNumber}: ${actionable.length} Änderungsauftrag/aufträge.`;

    return { roman: saved, plan, summary, runId };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : `Geschichte ${input.chapterNumber} analysieren fehlgeschlagen.`;
    events.push(
      historyEvent({ type: "error", stage: "manuskript", summary: message }),
    );
    await updatePipelineHistoryRun({ runId, status: "error", events });
    throw error instanceof Error ? error : new Error(message);
  }
}

/**
 * Clever: apply stored Verbessern plan for one Kurzgeschichte.
 */
export async function applyCleverGeschichteVerbessern(input: {
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
  if (editorial.buchTyp !== "clever_erzaehlt") {
    throw new Error("Nur für Clever-erzählt-Bücher.");
  }
  const key = String(input.chapterNumber);
  const plan = editorial.cleverGeschichteImprove?.[key] ?? null;
  if (!plan || plan.appliedAt) {
    throw new Error(
      `Kein offener Verbessern-Plan für Geschichte ${input.chapterNumber}. Zuerst analysieren.`,
    );
  }
  if (onlyNiceToHavePrompts(plan.aenderungsPrompts)) {
    throw new Error(
      "Nur Nice-to-have — nichts Pflichtiges einzuarbeiten. Plan verwerfen oder neu analysieren.",
    );
  }
  if (actionableAenderungsPrompts(plan.aenderungsPrompts).length === 0) {
    throw new Error("Keine Änderungsaufträge zum Einarbeiten.");
  }

  const events: PipelineHistoryEvent[] = [];
  const runId = await startPipelineHistoryRun({
    romanId: roman.id,
    trigger: "manuskript_chapter",
    originStage: "manuskript",
    firstEvent: historyEvent({
      type: "info",
      stage: "manuskript",
      summary: `Geschichte ${input.chapterNumber} Verbessern einarbeiten`,
    }),
  });

  try {
    const plot = (roman.manuskriptRaw ?? "").trim();
    const manuskript = ensureManuskriptSlots(
      plot,
      editorial.manuskriptText ?? "",
      cleverTitleSyncOpts(editorial),
    );
    const chapters = parsePlotChapters(manuskript);
    const target = chapters.find((c) => c.number === input.chapterNumber);
    if (!target?.body.trim() || !hasRealCleverGeschichteProse(target.body)) {
      throw new Error(
        `Geschichte ${input.chapterNumber} hat noch keinen Text — zuerst erzeugen.`,
      );
    }

    const baselineBody = stripErzaehlerWrappers(target.body);
    const baselineWords = countWords(baselineBody);
    const kap = cleverKapitelForStory(editorial, input.chapterNumber);
    const lengthBrief = formatCleverGeschichteBrief(editorial);
    const patchBrief = formatReifegradImprovePatchBrief(plan, {
      chapterNumber: input.chapterNumber,
    });

    const { rolle, model } = await resolveRomanKiRolle("clever_erzaehler");
    const { result: rawBody, usage } = await runWithAiUsageCollector(() =>
      generateText({
        model,
        systemInstruction: `${rolle.systemPrompt}

Du arbeitest EINE bestehende Abenteuer-Kurzgeschichte nach.
${CLEVER_STORY_MANDATE}
Gib NUR den neuen Fließtext zurück — keine Überschrift, kein JSON, keine Faktliste, kein „Abenteuer-Wissen“, keine Marker (===GESCHICHTE=== / ===LERNPUNKT=== / ===ENDE===).`,
        userText: `# Auftrag
Setze die Änderungsaufträge SICHTBAR in DIESER Geschichte um.
Behalte Abenteuer-Charakter und die verbindlichen Fakten. Die Erkenntnis bleibt in der Handlung spürbar — kein eigener Lernpunkt-Block.

# Kritik
${plan.kritik.slice(0, 4_000)}

# Änderungsaufträge (verbindlich)
${patchBrief}

# Unterthema
${kap?.titel || target.title || "—"}

# Fakten (verbindlich — weiter erleben lassen)
${(kap?.fakten ?? []).map((f, i) => `${i + 1}. ${f}`).join("\n") || "(keine)"}

# Länge & Stil
${lengthBrief || "Altersgerechte Kurzgeschichte laut Buch-Auswahl."}
Bisher ca. ${baselineWords} Wörter — ähnliche Länge (±25 %), nicht zum Roman aufblasen.

# Bisherige Geschichte
${baselineBody.slice(0, CLIP.chapterBody)}

Schreibe jetzt die verbesserte Geschichte (nur Prosa, ohne Marker).`,
        preferJson: false,
        maxTokens: 6_000,
        timeoutMs: 180_000,
      }),
    );

    let nextBody = scrubManuskriptChapterBody(stripErzaehlerWrappers(rawBody));
    if (nextBody.trim().length < 80) {
      throw new Error(
        `Geschichte ${input.chapterNumber}: Erzähler lieferte zu wenig Text. Bitte erneut einarbeiten.`,
      );
    }
    if (
      nextBody.trim() === baselineBody.trim() ||
      countWords(nextBody) < Math.max(40, Math.floor(baselineWords * 0.5))
    ) {
      throw new Error(
        `Geschichte ${input.chapterNumber}: Keine brauchbare Änderung erkannt. Bitte erneut einarbeiten oder neu analysieren.`,
      );
    }

    const patched = patchChapterBodies(
      manuskript,
      [{ chapterNumber: input.chapterNumber, body: nextBody }],
      "manuskript",
    );
    if (!patched.ok) {
      throw new Error(
        patched.error ?? "Verbesserte Geschichte konnte nicht eingefügt werden.",
      );
    }
    const sealed = applyCleverThemaTitlesToManuskript(
      normalizeManuskriptDocument(patched.text, {
        requiredFromPlot: plot,
        titlesFromPlot: true,
      }),
      editorial.cleverUnterthemen,
    );
    let savedRoman = await persistManuskript(
      roman,
      sealed,
      editorial.storyState ?? null,
    );

    const marked: RomanReifegradImprovePlan = {
      ...plan,
      appliedAt: new Date().toISOString(),
    };
    const nextMap = {
      ...(savedRoman.editorial?.cleverGeschichteImprove ??
        editorial.cleverGeschichteImprove ??
        {}),
      [key]: marked,
    };
    const nextCounts = {
      ...(savedRoman.editorial?.cleverGeschichteImproveCount ??
        editorial.cleverGeschichteImproveCount ??
        {}),
    };
    nextCounts[key] = Math.min((nextCounts[key] ?? 0) + 1, 999);
    savedRoman = await persistCleverImproveMap(
      savedRoman,
      nextMap,
      nextCounts,
    );

    const applySummary = `Geschichte ${input.chapterNumber} gepatcht (${countWords(nextBody)} Wörter · ${model.label})`;
    events.push(
      historyEvent({
        type: "apply",
        stage: "manuskript",
        roleKey: "clever_erzaehler",
        modelLabel: model.label,
        summary: applySummary,
        usage,
      }),
    );
    await updatePipelineHistoryRun({ runId, status: "ok", events });

    return {
      roman: savedRoman,
      summary: `Geschichte ${input.chapterNumber} eingearbeitet · ${applySummary}`,
      chapterNumber: input.chapterNumber,
      runId,
    };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : `Geschichte ${input.chapterNumber} einarbeiten fehlgeschlagen.`;
    events.push(
      historyEvent({ type: "error", stage: "manuskript", summary: message }),
    );
    await updatePipelineHistoryRun({ runId, status: "error", events });
    throw error instanceof Error ? error : new Error(message);
  }
}

/**
 * Clever: mark one Kurzgeschichte OK (Fertig) and clear its open Verbessern plan.
 */
export async function markCleverGeschichteFertig(input: {
  romanId: string;
  chapterNumber: number;
}): Promise<{ roman: RomanKontext; summary: string }> {
  const roman = await loadRoman(input.romanId);
  const editorial = roman.editorial ?? emptyRomanEditorial();
  if (editorial.buchTyp !== "clever_erzaehlt") {
    throw new Error("Nur für Clever-erzählt-Bücher.");
  }
  const key = String(input.chapterNumber);
  const map = { ...(editorial.cleverGeschichteImprove ?? {}) };
  delete map[key];
  const ok = { ...(editorial.cleverGeschichteOk ?? {}) };
  ok[key] = true;
  const saved = await persistCleverImproveMap(
    roman,
    Object.keys(map).length > 0 ? map : null,
    undefined,
    ok,
  );
  return {
    roman: saved,
    summary: `Geschichte ${input.chapterNumber} als OK markiert.`,
  };
}
