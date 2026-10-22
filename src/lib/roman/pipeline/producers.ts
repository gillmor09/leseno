/**
 * Stage draft + critique producers — wraps existing suggest/critique modules.
 */

import { generateText } from "@/lib/ai/provider";
import {
  buildCritiqueRulesAndNeedsBlock,
  emptyRomanEditorial,
  exposeTextFromEditorial,
  ROMAN_MANUSKRIPT_TEXT_MAX_CHARS,
  withExposeText,
  withLeserFeedbackForStage,
  withStageImprove,
  type RomanBuchTyp,
} from "@/lib/roman/editorial";
import {
  parseCritiquePayload,
  type CritiquePayload,
} from "@/lib/roman/pipeline/critique-schema";
import {
  CLIP,
  ROMAN_CRITIQUE_MAX_TOKENS,
  ROMAN_CRITIQUE_FINDINGS_HINT,
  ROMAN_CRITIQUE_MANDATE,
} from "@/lib/roman/pipeline/quality-brief";
import type { PipelineStage } from "@/lib/roman/pipeline/stages";
import {
  isGeruestStage,
  isPlotStage,
  normalizePipelineStage,
} from "@/lib/roman/pipeline/stages";
import { resolvePipelineTask } from "@/lib/roman/pipeline/tasks";
import { assertChapterStructure } from "@/lib/roman/pipeline/structure-guard";
import { normalizeManuskriptDocument, missingManuskriptChapterNumbers, parsePlotChapters } from "@/lib/roman/plot-chapters";
import { getRomanKontext, upsertRomanKontext } from "@/lib/roman/repository";
import { critiqueIdeeMitEntwicklungslektor } from "@/lib/roman/idea-qa";
import { formatCharaktere } from "@/lib/roman/fundament";
import {
  refineCharaktere,
  suggestCharaktereFromIdee,
} from "@/lib/roman/suggest-charaktere";
import {
  critiqueExposeMitEntwicklungslektor,
  suggestExposeFromCoAutor,
} from "@/lib/roman/suggest-expose";
import { hasFrozenSchreibPrompts } from "@/lib/roman/manuskript-chapter-packet";
import {
  critiqueManuskriptMitEntwicklungslektor,
  formatManuskriptWordMetrics,
  suggestManuskriptFromLektorUndCoAutor,
} from "@/lib/roman/suggest-manuskript";
import { invalidateDownstreamEditorial } from "@/lib/roman/pipeline/cascade";
import {
  assertPhaseApprovedForDownstream,
  revokePhaseApproval,
} from "@/lib/roman/phase-state";
import {
  fingerprintForPhase,
  retainApprovedGraphFingerprint,
  retainApprovedStructureFingerprints,
} from "@/lib/roman/phase-fingerprints";
import { assertPrerequisiteHardGate } from "@/lib/roman/stage-hard-gates";
import {
  assertGeruestReadyForManuskript,
  auditSzenenplotStructured,
} from "@/lib/roman/szenenplot-preflight";
import {
  critiqueKapitelGeruestMitEntwicklungslektor,
  suggestKapitelGeruestFromCoAutor,
  type KapitelGeruestPartialPayload,
} from "@/lib/roman/suggest-kapitelgeruest";
import {
  critiqueSzenenplotDetailMitEntwicklungslektor,
  freezeSzenenplotSchreibPrompts,
  suggestSzenenplotDetailFromCoAutor,
} from "@/lib/roman/suggest-szenenplot-detail";
import {
  critiqueWeltMitEntwicklungslektor,
  suggestWeltFromLektorUndCoAutor,
} from "@/lib/roman/suggest-welt";
import {
  enrichWissensGraphConcreteDetails,
  seedWissensGraphFromSources,
} from "@/lib/roman/wissens-graph";
import {
  structuredKapitelGeruestToMarkdown,
  structuredSzenenplotToMarkdown,
} from "@/lib/roman/szenenplot-structured";
import type { RomanKontext } from "@/lib/roman/types";

function assertUpstreamFreigabe(
  roman: RomanKontext,
  phase: "idee" | "rahmen" | "fundament" | "expose" | "graph" | "plot" | "szenen",
) {
  const ed = roman.editorial ?? emptyRomanEditorial();
  const fp = fingerprintForPhase(phase, { ...roman, editorial: ed });
  assertPhaseApprovedForDownstream({
    editorial: ed,
    phase,
    fingerprint: fp,
  });
}

async function persist(
  roman: RomanKontext,
  patch: Partial<{
    manuskriptRaw: string;
    charaktere: RomanKontext["charaktere"];
    weltSchauplaetze: string;
    weltRegeln: string;
    editorial: NonNullable<RomanKontext["editorial"]>;
  }>,
): Promise<RomanKontext> {
  const editorial = patch.editorial ?? roman.editorial ?? emptyRomanEditorial();
  const saved = await upsertRomanKontext({
    id: roman.id,
    title: roman.title,
    manuskriptRaw: patch.manuskriptRaw ?? roman.manuskriptRaw,
    stilbibel: roman.stilbibel,
    genre: roman.genre,
    praemisse: roman.praemisse,
    perspektive: roman.perspektive,
    zeitform: roman.zeitform,
    tonalitaet: roman.tonalitaet,
    charaktere: patch.charaktere ?? roman.charaktere,
    weltSchauplaetze: patch.weltSchauplaetze ?? roman.weltSchauplaetze,
    weltRegeln: patch.weltRegeln ?? roman.weltRegeln,
    szenenRaster: roman.szenenRaster,
    kiRegelwerk: roman.kiRegelwerk,
    fanPersonaName: roman.fanPersonaName,
    fanPersonaProfil: roman.fanPersonaProfil,
    editorial,
  });
  return { ...saved, ideenChat: roman.ideenChat };
}

function buchTypOf(roman: RomanKontext): RomanBuchTyp {
  return (roman.editorial?.buchTyp ?? "unbekannt") as RomanBuchTyp;
}

/** Run draft producer for a stage and persist. */
export async function draftStage(
  roman: RomanKontext,
  stage: PipelineStage,
  options?: {
    onProgress?: (label: string) => Promise<void>;
    /** Soft wall-clock deadline for chunked Manuskript Erzeugen. */
    chunkBudget?: import("@/lib/roman/pipeline/generate-budget").GenerateChunkBudget;
  },
): Promise<{ roman: RomanKontext; summary: string; modelLabel: string }> {
  const editorial = roman.editorial ?? emptyRomanEditorial();
  const buchTyp = buchTypOf(roman);
  const ideeKurz = editorial.ideeKurz ?? "";
  const grobRegeln = editorial.grobRegeln ?? "";
  const tonalitaet = roman.tonalitaet ?? "";

  if (stage === "idee") {
    // Idee draft is normally Q&A; vertical runner expects existing dossier.
    if (ideeKurz.trim().length < 40) {
      throw new Error(
        "Idee: zuerst über den Ideen-Dialog eine Dokumentation aufbauen.",
      );
    }
    return {
      roman,
      summary: "Idee unverändert (Dialog-Schritt).",
      modelLabel: "—",
    };
  }

  if (stage === "rahmen") {
    assertPrerequisiteHardGate({
      nextStage: "rahmen",
      editorial,
      tonalitaet,
      genre: roman.genre,
    });
    assertUpstreamFreigabe(roman, "idee");
    // Rahmen is mostly author/Basics-derive; Erzeugen is a no-op if filled.
    const genreOk = (roman.genre ?? "").trim().length >= 2;
    const tonOk = tonalitaet.trim().length >= 40;
    const rulesOk = grobRegeln.trim().length >= 40;
    if (!genreOk || !tonOk || !rulesOk) {
      throw new Error(
        "Rahmen unvollständig — Genre, Tonalität und Basis-Regeln setzen (oder aus Idee ableiten).",
      );
    }
    return {
      roman,
      summary: "Rahmen bestätigt (Basics vorhanden).",
      modelLabel: "—",
    };
  }

  if (
    stage === "fundament" ||
    stage === "charaktere" ||
    stage === "welt"
  ) {
    assertPrerequisiteHardGate({
      nextStage: "fundament",
      editorial,
      tonalitaet,
      genre: roman.genre,
    });
    assertUpstreamFreigabe(roman, "rahmen");
    await options?.onProgress?.("Fundament · Figuren …");
    const chars = await suggestCharaktereFromIdee({
      buchTyp,
      ideeKurz,
      tonalitaet,
      grobRegeln,
      existing: roman.charaktere,
    });
    let live = await persist(roman, { charaktere: chars.charaktere });
    await options?.onProgress?.("Fundament · Welt …");
    const welt = await suggestWeltFromLektorUndCoAutor({
      buchTyp,
      ideeKurz,
      tonalitaet,
      grobRegeln,
      charaktere: live.charaktere,
      existing: {
        weltSchauplaetze: live.weltSchauplaetze,
        weltRegeln: live.weltRegeln,
      },
    });
    live = await persist(live, {
      weltSchauplaetze: welt.weltSchauplaetze,
      weltRegeln: welt.weltRegeln,
    });
    return {
      roman: live,
      summary: `Fundament entworfen (${chars.modelLabel} / ${welt.modelLabel}).`,
      modelLabel: welt.modelLabel || chars.modelLabel,
    };
  }

  if (stage === "expose") {
    assertPrerequisiteHardGate({
      nextStage: "expose",
      editorial,
      tonalitaet,
      genre: roman.genre,
    });
    assertUpstreamFreigabe(roman, "fundament");
    const data = await suggestExposeFromCoAutor({
      buchTyp,
      ideeKurz,
      tonalitaet,
      grobRegeln,
      charaktere: roman.charaktere,
      weltSchauplaetze: roman.weltSchauplaetze,
      weltRegeln: roman.weltRegeln,
      existingExpose: exposeTextFromEditorial(editorial),
    });
    const nextEd = withStageImprove(
      withExposeText(
        revokePhaseApproval(
          invalidateDownstreamEditorial(editorial, "expose"),
          "expose",
        ),
        data.expose,
      ),
      "expose",
      null,
    );
    const saved = await persist(roman, {
      manuskriptRaw: "",
      editorial: nextEd,
    });
    return {
      roman: saved,
      summary: `Exposé entworfen (${data.modelLabel}). Downstream (Gerüst/Szenenplot/Manuskript) veraltet.`,
      modelLabel: data.modelLabel,
    };
  }

  /** Phase 5: Wissensgraph from freigegebenem Fundament + Exposé. */
  if (stage === "graph") {
    assertPrerequisiteHardGate({
      nextStage: "graph",
      editorial,
      tonalitaet,
      genre: roman.genre,
    });
    assertUpstreamFreigabe(roman, "expose");
    assertUpstreamFreigabe(roman, "fundament");
    await options?.onProgress?.(
      "Wissensgraph · Seed aus Regeln, Fundament & Exposé …",
    );
    let graph = await seedWissensGraphFromSources({
      buchTyp,
      title: roman.title,
      genre: roman.genre,
      ideeKurz,
      tonalitaet,
      grobRegeln,
      kiRegelwerk: roman.kiRegelwerk ?? "",
      editorial,
      charaktere: roman.charaktere,
      weltSchauplaetze: roman.weltSchauplaetze,
      weltRegeln: roman.weltRegeln,
    });
    await options?.onProgress?.("Wissensgraph · Konkretisierung …");
    const exposeCtx = exposeTextFromEditorial(editorial);
    const charCtx = formatCharaktere(roman.charaktere);
    const harteCtx = (editorial.harteRegeln ?? []).filter(Boolean).join("\n");
    graph = await enrichWissensGraphConcreteDetails({
      graph,
      structured: editorial.szenenplotStructured,
      contextText: [
        ideeKurz,
        grobRegeln,
        harteCtx,
        roman.kiRegelwerk ?? "",
        charCtx,
        roman.weltSchauplaetze,
        roman.weltRegeln,
        exposeCtx,
      ]
        .filter(Boolean)
        .join("\n\n"),
    });
    let nextEd = invalidateDownstreamEditorial(editorial, "graph");
    // Full Erzeugen replaces Graph canon — Freigabe muss neu gesetzt werden.
    nextEd = revokePhaseApproval(nextEd, "graph");
    nextEd = {
      ...nextEd,
      wissensGraph: graph,
    };
    const saved = await persist(roman, { editorial: nextEd });
    return {
      roman: saved,
      summary: `Wissensgraph geseedet (${graph.modelLabel}) · ${graph.nodes.length} Knoten.`,
      modelLabel: graph.modelLabel,
    };
  }

  /** Phase 6: Plot = Ereignisplan from freigegebenem Exposé; Graph = Faktenvertrag. */
  if (isGeruestStage(stage) || normalizePipelineStage(stage) === "plot") {
    assertPrerequisiteHardGate({
      nextStage: "plot",
      editorial,
      tonalitaet,
      genre: roman.genre,
    });
    assertUpstreamFreigabe(roman, "expose");
    assertUpstreamFreigabe(roman, "fundament");
    assertUpstreamFreigabe(roman, "graph");
    const plotStage = "plot" as const;
    let liveRoman = roman;
    let downstreamCleared = false;

    const persistGeruestPartial = async (
      payload: Pick<
        KapitelGeruestPartialPayload,
        "structured" | "kapitelGeruestRaw" | "wissensGraph"
      >,
    ) => {
      const prevEd = liveRoman.editorial ?? emptyRomanEditorial();
      let nextEd = prevEd;
      if (!downstreamCleared) {
        nextEd = invalidateDownstreamEditorial(prevEd, plotStage);
        nextEd = revokePhaseApproval(nextEd, "plot");
        downstreamCleared = true;
      }
      const improveMap = { ...(nextEd.reifegradImprove ?? {}) };
      delete improveMap.plot;
      delete improveMap.kapitelgeruest;
      delete improveMap.feingeruest;
      nextEd = withLeserFeedbackForStage(
        withStageImprove(
          {
            ...nextEd,
            kapitelGeruestStructured: payload.structured,
            kapitelGeruestRaw: payload.kapitelGeruestRaw,
            // Keep freigegebenen Graph; only merge grow from skeleton via suggest.
            wissensGraph: payload.wissensGraph ?? nextEd.wissensGraph,
            reifegradImprove: improveMap,
          },
          plotStage,
          null,
        ),
        plotStage,
        null,
      );
      // Graph grow must not revoke author freigabe — refresh fingerprint only.
      nextEd = retainApprovedGraphFingerprint(nextEd);
      liveRoman = await persist(liveRoman, {
        manuskriptRaw: liveRoman.manuskriptRaw ?? "",
        editorial: nextEd,
      });
    };

    const geruestData = await suggestKapitelGeruestFromCoAutor({
      buchTyp,
      title: roman.title,
      genre: roman.genre,
      ideeKurz,
      grobRegeln,
      editorial,
      charaktere: roman.charaktere,
      weltSchauplaetze: roman.weltSchauplaetze,
      weltRegeln: roman.weltRegeln,
      existingGeruest: "",
      tonalitaet,
      kiRegelwerk: roman.kiRegelwerk ?? "",
      mode: "full",
      onProgress: options?.onProgress,
      onPartial: async (partial) => {
        await persistGeruestPartial(partial);
      },
    });

    await persistGeruestPartial({
      structured: geruestData.structured,
      kapitelGeruestRaw: geruestData.kapitelGeruestRaw,
      wissensGraph: geruestData.wissensGraph,
    });

    return {
      roman: liveRoman,
      summary: `Plot (Ereignisplan) entworfen (${geruestData.modelLabel}) · ${geruestData.structured.chapters.length} Kap.`,
      modelLabel: geruestData.modelLabel,
    };
  }

  /** Phase 7: Szenenverträge from freigegebenem Plot + Graph. */
  if (isPlotStage(stage) || normalizePipelineStage(stage) === "szenen") {
    assertPrerequisiteHardGate({
      nextStage: "szenen",
      editorial,
      tonalitaet,
      genre: roman.genre,
    });
    assertUpstreamFreigabe(roman, "plot");
    const geruest = editorial.kapitelGeruestStructured;
    if (!geruest?.chapters.length) {
      throw new Error("Plot (Ereignisplan) fehlt — zuerst Phase Plot erzeugen und freigeben.");
    }
    const szenenStage = "szenen" as const;
    let liveRoman = roman;
    let downstreamCleared = false;
    const baselinePlot = roman.manuskriptRaw ?? "";

    const persistSzenenPartial = async (payload: {
      structured: NonNullable<
        NonNullable<RomanKontext["editorial"]>["szenenplotStructured"]
      >;
      szenenplot: string;
      wissensGraph: NonNullable<
        NonNullable<RomanKontext["editorial"]>["wissensGraph"]
      > | null;
    }) => {
      const prevEd = liveRoman.editorial ?? emptyRomanEditorial();
      let nextEd = prevEd;
      if (!downstreamCleared) {
        nextEd = invalidateDownstreamEditorial(prevEd, szenenStage);
        nextEd = revokePhaseApproval(nextEd, "szenen");
        downstreamCleared = true;
      }
      const improveMap = { ...(nextEd.reifegradImprove ?? {}) };
      delete improveMap.szenen;
      delete improveMap.szenenplot;
      delete improveMap.feinplot;
      nextEd = withLeserFeedbackForStage(
        withStageImprove(
          {
            ...nextEd,
            szenenplotStructured: payload.structured,
            wissensGraph: payload.wissensGraph ?? nextEd.wissensGraph,
            reifegradImprove: improveMap,
          },
          szenenStage,
          null,
        ),
        szenenStage,
        null,
      );
      nextEd = retainApprovedGraphFingerprint(nextEd);
      const guard = assertChapterStructure(baselinePlot, payload.szenenplot, {
        minChapters: 2,
        allowTitleChange: true,
      });
      let text = payload.szenenplot;
      if (baselinePlot.trim().length >= 80 && !guard.ok) {
        text = liveRoman.manuskriptRaw ?? payload.szenenplot;
      } else if (guard.ok) {
        text = guard.text;
      }
      liveRoman = await persist(liveRoman, {
        manuskriptRaw: text,
        editorial: nextEd,
      });
    };

    const plotData = await suggestSzenenplotDetailFromCoAutor({
      buchTyp,
      title: roman.title,
      genre: roman.genre,
      ideeKurz,
      grobRegeln,
      editorial: liveRoman.editorial ?? editorial,
      charaktere: roman.charaktere,
      weltSchauplaetze: roman.weltSchauplaetze,
      weltRegeln: roman.weltRegeln,
      geruest,
      existingPlot: "",
      tonalitaet,
      kiRegelwerk: roman.kiRegelwerk ?? "",
      mode: "full",
      onProgress: options?.onProgress,
      onPartial: async (partial) => {
        await persistSzenenPartial(partial);
      },
    });

    await persistSzenenPartial({
      structured: plotData.structured,
      szenenplot: plotData.szenenplot,
      wissensGraph: plotData.wissensGraph,
    });

    const sceneCount = plotData.structured.chapters.reduce(
      (n, c) => n + c.scenes.length,
      0,
    );
    return {
      roman: liveRoman,
      summary: `Szenen entworfen (${plotData.modelLabel}) · ${plotData.structured.chapters.length} Kap. / ${sceneCount} Szenen.`,
      modelLabel: plotData.modelLabel,
    };
  }

  if (stage === "manuskript") {
    if (buchTyp === "clever_erzaehlt") {
      const { writeCleverGeschichte, cleverKapitelForStory } = await import(
        "@/lib/roman/clever-geschichte"
      );
      const { patchChapterBodies } = await import(
        "@/lib/roman/pipeline/structure-guard"
      );
      const plot = roman.manuskriptRaw ?? "";
      const chapters = parsePlotChapters(plot);
      if (chapters.length < 1) {
        throw new Error("Zuerst Unterthemen erzeugen.");
      }
      let liveRoman = roman;
      const { applyCleverThemaTitlesToManuskript } = await import(
        "@/lib/roman/clever-unterthemen"
      );
      let liveText = applyCleverThemaTitlesToManuskript(
        normalizeManuskriptDocument(
          (editorial.manuskriptText ?? "").trim() || plot,
          { requiredFromPlot: plot, titlesFromPlot: true },
        ),
        editorial.cleverUnterthemen,
      );
      let lastModel = "";
      for (const ch of chapters) {
        await options?.onProgress?.(
          `Geschichte ${ch.number}/${chapters.length}: „${ch.title.slice(0, 40)}“…`,
        );
        const liveEd = liveRoman.editorial ?? emptyRomanEditorial();
        const kap = cleverKapitelForStory(liveEd, ch.number);
        if (!kap) {
          throw new Error(
            `Unterthema für Geschichte ${ch.number} fehlt. Zuerst Unterthemen erzeugen.`,
          );
        }
        const written = await writeCleverGeschichte({
          thema: (liveRoman.genre ?? "").trim() || kap.titel,
          editorial: liveEd,
          kapitel: kap,
        });
        lastModel = written.modelLabel;
        const patched = patchChapterBodies(
          liveText,
          [{ chapterNumber: ch.number, body: written.body }],
          "manuskript",
        );
        if (!patched.ok) {
          throw new Error(
            patched.error ?? `Geschichte ${ch.number} konnte nicht eingefügt werden.`,
          );
        }
        liveText = applyCleverThemaTitlesToManuskript(
          normalizeManuskriptDocument(patched.text, {
            requiredFromPlot: plot,
            titlesFromPlot: true,
          }),
          liveEd.cleverUnterthemen,
        );
        await options?.onProgress?.(
          `Geschichte ${ch.number}/${chapters.length}: Infografik …`,
        );
        const { generateCleverKapitelInfografik } = await import(
          "@/lib/roman/clever-infografik"
        );
        const editorialForImage = {
          ...liveEd,
          manuskriptText: liveText,
        };
        const { kapitel: kapWithImage } =
          await generateCleverKapitelInfografik({
            thema: (liveRoman.genre ?? "").trim() || kap.titel,
            editorial: editorialForImage,
            kapitel: kap,
            storyBody: written.body,
            tonalitaet: liveRoman.tonalitaet,
          });
        const doc = liveEd.cleverUnterthemen;
        const nextUnterthemen = doc
          ? {
              ...doc,
              kapitel: doc.kapitel.map((k) =>
                k.nummer === kapWithImage.nummer ? kapWithImage : k,
              ),
            }
          : null;

        const improveMap = { ...(liveEd.reifegradImprove ?? {}) };
        delete improveMap.manuskript;
        const nextEd = withLeserFeedbackForStage(
          withStageImprove(
            {
              ...liveEd,
              manuskriptText: liveText,
              cleverUnterthemen: nextUnterthemen,
              storyState: null,
              canon: null,
              reifegradImprove: improveMap,
            },
            "manuskript",
            null,
          ),
          "manuskript",
          null,
        );
        liveRoman = await persist(liveRoman, { editorial: nextEd });
      }
      const missing = missingManuskriptChapterNumbers(plot, liveText);
      if (missing.length > 0) {
        throw new Error(
          `Geschichten unvollständig — fehlend: ${missing.join(", ")}.`,
        );
      }
      return {
        roman: liveRoman,
        summary: `${chapters.length} Abenteuer-Geschichten + Infografiken (${lastModel}).`,
        modelLabel: lastModel,
      };
    }

    let liveRoman = roman;
    const plot = roman.manuskriptRaw ?? "";
    assertUpstreamFreigabe(roman, "szenen");
    // Hard gate: broken arcs/lifecycle or weak Logik/Dramaturgie (override: outline fertig).
    assertGeruestReadyForManuskript({ editorial });
    const preflight = auditSzenenplotStructured(editorial.szenenplotStructured);
    if (preflight.warnings.length) {
      await options?.onProgress?.(
        `Gerüst-Preflight: ${preflight.warnings.length} Hinweis(e) — ${preflight.warnings[0]?.message.slice(0, 120) ?? ""}…`,
      );
    }
    // Freeze schreibPrompts before the first wave so mid-run aborts keep the stamp.
    let editorialForMs = editorial;
    if (
      editorial.szenenplotStructured &&
      editorial.szenenplotStructured.chapters.length > 0 &&
      !hasFrozenSchreibPrompts(editorial.szenenplotStructured)
    ) {
      const frozen = freezeSzenenplotSchreibPrompts(
        editorial.szenenplotStructured,
      );
      await options?.onProgress?.(
        "Szenenverträge eingefroren — slim packets, Kapitel strikt nacheinander …",
      );
      const frozenEd = {
        ...editorial,
        szenenplotStructured: frozen,
      };
      liveRoman = await persist(liveRoman, { editorial: frozenEd });
      editorialForMs = liveRoman.editorial ?? frozenEd;
    }
    const data = await suggestManuskriptFromLektorUndCoAutor({
      buchTyp,
      title: roman.title,
      genre: roman.genre,
      ideeKurz,
      grobRegeln,
      tonalitaet,
      stilbibel: roman.stilbibel ?? "",
      kiRegelwerk: roman.kiRegelwerk ?? "",
      editorial: editorialForMs,
      charaktere: roman.charaktere,
      weltSchauplaetze: roman.weltSchauplaetze,
      weltRegeln: roman.weltRegeln,
      szenenplot: plot,
      existingManuskript: editorial.manuskriptText ?? "",
      fanPersonaName: roman.fanPersonaName ?? "",
      fanPersonaProfil: roman.fanPersonaProfil ?? "",
      onChapterWritten: async (partial, _chapterNumber, meta) => {
        const sealedPartial = normalizeManuskriptDocument(partial, {
          requiredFromPlot: plot,
        });
        const prevEd = liveRoman.editorial ?? emptyRomanEditorial();
        const improveMap = { ...(prevEd.reifegradImprove ?? {}) };
        delete improveMap.manuskript;
        const clearedFb = withLeserFeedbackForStage(
          withStageImprove(
            {
              ...prevEd,
              manuskriptText: sealedPartial,
              storyState: meta?.storyState ?? null,
              wissensGraph: meta?.wissensGraph ?? prevEd.wissensGraph ?? null,
              canon: null,
              reifegradImprove: improveMap,
            },
            "manuskript",
            null,
          ),
          "manuskript",
          null,
        );
        const nextEd = retainApprovedStructureFingerprints(clearedFb, {
          manuskriptRaw: liveRoman.manuskriptRaw ?? "",
        });
        liveRoman = await persist(liveRoman, { editorial: nextEd });
      },
      onProgress: options?.onProgress,
      // Continuity on: storyState + full graph grow. Lean only skips Path-B / book length pass / 2nd expand.
      leanFullBook: true,
      chunkBudget: options?.chunkBudget,
    });
    const text = normalizeManuskriptDocument(data.manuskriptText, {
      requiredFromPlot: plot,
    });
    const missing = missingManuskriptChapterNumbers(plot, text);
    if (missing.length > 0) {
      throw new Error(
        `Manuskript unvollständig — fehlende Kapitel aus dem Kapitelgerüst: ${missing.join(", ")}. Bitte Erzeugen erneut (Timeout/Abbruch mitten im Buch).`,
      );
    }
    // Prefer Szenenplot chapter count over empty/old manuskript baseline.
    const guard = assertChapterStructure(plot, text, {
      minChapters: 2,
      allowTitleChange: true,
      format: "manuskript",
    });
    let sealed = text;
    if (!guard.ok) {
      throw new Error(
        guard.error ??
          "Manuskript weicht von der Szenenplot-Kapitelstruktur ab.",
      );
    }
    sealed = normalizeManuskriptDocument(guard.text, {
      requiredFromPlot: plot,
    });
    if (sealed.length > ROMAN_MANUSKRIPT_TEXT_MAX_CHARS) {
      throw new Error(
        `Manuskript zu groß zum Speichern (${sealed.length.toLocaleString("de-DE")} Zeichen, max. ${ROMAN_MANUSKRIPT_TEXT_MAX_CHARS.toLocaleString("de-DE")}). Bitte Zielwortzahl senken oder Kapitel kürzen.`,
      );
    }
    const prevEdFinal = liveRoman.editorial ?? emptyRomanEditorial();
    const nextEd = retainApprovedStructureFingerprints(
      withStageImprove(
        withLeserFeedbackForStage(
          {
            ...prevEdFinal,
            manuskriptText: sealed,
            manuskriptOriginalText: "",
            manuskriptOriginalSavedAt: null,
            canon: null,
            storyState: data.storyState ?? null,
            wissensGraph:
              data.wissensGraph ??
              prevEdFinal.wissensGraph ??
              null,
            // Persist freeze stamp from MS start so later runs stay on slim packets.
            ...(data.szenenplotStructured
              ? { szenenplotStructured: data.szenenplotStructured }
              : {}),
          },
          "manuskript",
          null,
        ),
        "manuskript",
        null,
      ),
      { manuskriptRaw: liveRoman.manuskriptRaw ?? "" },
    );
    const saved = await persist(liveRoman, { editorial: nextEd });
    // Seam/Payoff + Emotion run before Roman-Verbessern (not here) — keeps
    // Erzeugen under the chunk budget and avoids double craft cost.

    // Guard against silent truncation on read/re-save (old 500k cap wiped Kap. 19–22).
    const verified = await getRomanKontext(saved.id, { omitCover: true });
    const verifiedText = verified?.editorial?.manuskriptText ?? "";
    const missingAfterSave = missingManuskriptChapterNumbers(plot, verifiedText);
    if (missingAfterSave.length > 0) {
      throw new Error(
        `Manuskript nach Speichern unvollständig (Kap. ${missingAfterSave.join(", ")} fehlen/abgeschnitten). Bitte Erzeugen erneut — fertige Kapitel werden fortgesetzt.`,
      );
    }
    if (verifiedText.length < sealed.length * 0.95) {
      throw new Error(
        `Manuskript wurde beim Speichern gekürzt (${verifiedText.length.toLocaleString("de-DE")} von ${sealed.length.toLocaleString("de-DE")} Zeichen). Bitte Support/Limit prüfen und Erzeugen erneut.`,
      );
    }
    const metrics = formatManuskriptWordMetrics(data.wordMetrics);
    return {
      roman: verified ?? saved,
      summary: `Manuskript entworfen (${data.modelLabel}). ${metrics}.`,
      modelLabel: data.modelLabel,
    };
  }

  throw new Error(`Draft für Stufe „${stage}“ nicht implementiert.`);
}

/** Run critique producer; returns structured findings. */
export async function critiqueStage(
  roman: RomanKontext,
  stage: PipelineStage,
): Promise<{
  critique: CritiquePayload;
  critiqueText: string;
  modelLabel: string;
  roleKey: string;
}> {
  const editorial = roman.editorial ?? emptyRomanEditorial();
  const buchTyp = buchTypOf(roman);
  const ideeKurz = editorial.ideeKurz ?? "";
  const grobRegeln = editorial.grobRegeln ?? "";
  const taskKey = `${stage}.critique`;
  const { aufgabe } = await resolvePipelineTask(taskKey);

  let raw = "";
  let modelLabel = "";

  if (stage === "idee") {
    const r = await critiqueIdeeMitEntwicklungslektor({
      buchTyp,
      ideeKurz,
      editorial,
    });
    raw = r.critique;
    modelLabel = r.modelLabel;
  } else if (stage === "charaktere") {
    // Entwicklungslektor critique as findings JSON via task role
    const { rolle, model } = await resolvePipelineTask(taskKey);
    const compliance = buildCritiqueRulesAndNeedsBlock(editorial);
    raw = await generateText({
      model,
      systemInstruction: `${rolle.systemPrompt}

${ROMAN_CRITIQUE_MANDATE}

${ROMAN_CRITIQUE_FINDINGS_HINT}

Antworte als JSON: {"strengths":"…","findings":[{"id":"1","severity":"kritisch|wichtig|optional","summary":"…","suggestion":"…","severityHint":"upstream|lokal"}]} (max. 3 Findings; optional = Nice to have nur wenn nichts Härteres übrig)`,
      userText: `${compliance}

# Ideendokumentation
${ideeKurz.slice(0, CLIP.idee)}

# Basis-Regeln
${grobRegeln.slice(0, CLIP.grob) || "(leer)"}

# Charaktere
${JSON.stringify(roman.charaktere).slice(0, CLIP.charaktere)}

Prüfe Steckbriefe gegen Idee, Regeln und innere Logik/Kontinuität: Motivation, Eigenwilligkeit, Klischees, Lücken, Widersprüche.
Maximal 8 Findings; Regel-/Logik-Verstöße und kritische Logikfehler zuerst.`,
      preferJson: true,
      maxTokens: ROMAN_CRITIQUE_MAX_TOKENS,
      timeoutMs: 90_000,
    });
    modelLabel = model.label;
  } else if (stage === "welt") {
    const r = await critiqueWeltMitEntwicklungslektor({
      buchTyp,
      ideeKurz,
      grobRegeln,
      charaktere: roman.charaktere,
      welt: {
        weltSchauplaetze: roman.weltSchauplaetze,
        weltRegeln: roman.weltRegeln,
      },
      editorial,
    });
    raw = r.critique;
    modelLabel = r.modelLabel;
  } else if (stage === "expose") {
    const r = await critiqueExposeMitEntwicklungslektor({
      buchTyp,
      ideeKurz,
      grobRegeln,
      charaktere: roman.charaktere,
      weltSchauplaetze: roman.weltSchauplaetze,
      weltRegeln: roman.weltRegeln,
      expose: exposeTextFromEditorial(editorial),
      editorial,
    });
    raw = r.critique;
    modelLabel = r.modelLabel;
  } else if (stage === "fundament") {
    const r = await critiqueWeltMitEntwicklungslektor({
      buchTyp,
      ideeKurz,
      grobRegeln,
      charaktere: roman.charaktere,
      welt: {
        weltSchauplaetze: roman.weltSchauplaetze,
        weltRegeln: roman.weltRegeln,
      },
      editorial,
    });
    raw = r.critique;
    modelLabel = r.modelLabel;
  } else if (stage === "graph") {
    const { rolle, model } = await resolvePipelineTask("graph.draft");
    const graph = editorial.wissensGraph;
    raw = await generateText({
      model,
      systemInstruction: `${rolle.systemPrompt}

${ROMAN_CRITIQUE_MANDATE}

${ROMAN_CRITIQUE_FINDINGS_HINT}

Antworte als JSON mit strengths + max. 3 findings zu dünnen Knoten, fehlenden Invarianten, Widersprüchen zu Fundament/Exposé.`,
      userText: `# Wissensgraph
${JSON.stringify({
  nodes: graph?.nodes?.slice(0, 80),
  hardInvariants: graph?.hardInvariants?.slice(0, 40),
}).slice(0, CLIP.sharedContext)}

# Exposé
${exposeTextFromEditorial(editorial).slice(0, CLIP.expose)}`,
      preferJson: true,
      maxTokens: ROMAN_CRITIQUE_MAX_TOKENS,
      timeoutMs: 90_000,
    });
    modelLabel = model.label;
  } else if (isGeruestStage(stage) || stage === "plot") {
    const geruest = editorial.kapitelGeruestStructured;
    const r = await critiqueKapitelGeruestMitEntwicklungslektor({
      buchTyp,
      title: roman.title,
      genre: roman.genre,
      ideeKurz,
      grobRegeln,
      editorial,
      charaktere: roman.charaktere,
      weltSchauplaetze: roman.weltSchauplaetze,
      weltRegeln: roman.weltRegeln,
      kapitelGeruest: geruest?.chapters.length
        ? structuredKapitelGeruestToMarkdown(geruest)
        : (editorial.kapitelGeruestRaw ?? ""),
      structured: geruest,
    });
    raw = r.critique;
    modelLabel = r.modelLabel;
  } else if (isPlotStage(stage)) {
    const plotStructured = editorial.szenenplotStructured;
    const r = await critiqueSzenenplotDetailMitEntwicklungslektor({
      buchTyp,
      title: roman.title,
      genre: roman.genre,
      ideeKurz,
      grobRegeln,
      editorial,
      charaktere: roman.charaktere,
      weltSchauplaetze: roman.weltSchauplaetze,
      weltRegeln: roman.weltRegeln,
      szenenplot: plotStructured?.chapters.length
        ? structuredSzenenplotToMarkdown(plotStructured)
        : (roman.manuskriptRaw ?? ""),
      structured: plotStructured,
    });
    raw = r.critique;
    modelLabel = r.modelLabel;
  } else if (stage === "manuskript") {
    const r = await critiqueManuskriptMitEntwicklungslektor({
      buchTyp,
      title: roman.title,
      genre: roman.genre,
      editorial,
      ideeKurz,
      grobRegeln,
      charaktere: roman.charaktere,
      weltSchauplaetze: roman.weltSchauplaetze,
      weltRegeln: roman.weltRegeln,
      szenenplot: roman.manuskriptRaw ?? "",
      manuskriptText: editorial.manuskriptText ?? "",
      tonalitaet: roman.tonalitaet ?? "",
    });
    raw = r.critique;
    modelLabel = r.modelLabel;
  } else {
    throw new Error(`Critique für Stufe „${stage}“ nicht implementiert.`);
  }

  const critique = parseCritiquePayload(raw, aufgabe.label);
  return {
    critique,
    critiqueText: raw,
    modelLabel,
    roleKey: aufgabe.rolleKey,
  };
}

/** Optional second-pass refine for charaktere after draft (kept for cascade). */
export async function refineCharaktereStage(
  roman: RomanKontext,
): Promise<RomanKontext> {
  const editorial = roman.editorial ?? emptyRomanEditorial();
  const data = await refineCharaktere({
    buchTyp: buchTypOf(roman),
    ideeKurz: editorial.ideeKurz ?? "",
    grobRegeln: editorial.grobRegeln ?? "",
    existing: roman.charaktere,
  });
  return persist(roman, { charaktere: data.charaktere });
}
