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
import { resolvePipelineTask } from "@/lib/roman/pipeline/tasks";
import { assertChapterStructure } from "@/lib/roman/pipeline/structure-guard";
import { normalizeManuskriptDocument, missingManuskriptChapterNumbers, parsePlotChapters } from "@/lib/roman/plot-chapters";
import { getRomanKontext, upsertRomanKontext } from "@/lib/roman/repository";
import { critiqueIdeeMitEntwicklungslektor } from "@/lib/roman/idea-qa";
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
  assertGeruestReadyForManuskript,
  assertGeruestReadyForSzenenplot,
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
  structuredKapitelGeruestToMarkdown,
  structuredSzenenplotToMarkdown,
} from "@/lib/roman/szenenplot-structured";
import type { RomanKontext } from "@/lib/roman/types";

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
  options?: { onProgress?: (label: string) => Promise<void> },
): Promise<{ roman: RomanKontext; summary: string; modelLabel: string }> {
  const editorial = roman.editorial ?? emptyRomanEditorial();
  const buchTyp = buchTypOf(roman);
  const ideeKurz = editorial.ideeKurz ?? "";
  const rechercheDossier = editorial.rechercheDossier ?? "";
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

  if (stage === "charaktere") {
    const data = await suggestCharaktereFromIdee({
      buchTyp,
      ideeKurz,
      rechercheDossier,
      tonalitaet,
      grobRegeln,
      existing: roman.charaktere,
    });
    const saved = await persist(roman, { charaktere: data.charaktere });
    return {
      roman: saved,
      summary: `Charaktere entworfen (${data.modelLabel}).`,
      modelLabel: data.modelLabel,
    };
  }

  if (stage === "welt") {
    const data = await suggestWeltFromLektorUndCoAutor({
      buchTyp,
      ideeKurz,
      rechercheDossier,
      tonalitaet,
      grobRegeln,
      charaktere: roman.charaktere,
      existing: {
        weltSchauplaetze: roman.weltSchauplaetze,
        weltRegeln: roman.weltRegeln,
      },
    });
    const saved = await persist(roman, {
      weltSchauplaetze: data.weltSchauplaetze,
      weltRegeln: data.weltRegeln,
    });
    return {
      roman: saved,
      summary: `Welt entworfen (${data.modelLabel}).`,
      modelLabel: data.modelLabel,
    };
  }

  if (stage === "expose") {
    const data = await suggestExposeFromCoAutor({
      buchTyp,
      ideeKurz,
      rechercheDossier,
      tonalitaet,
      grobRegeln,
      charaktere: roman.charaktere,
      weltSchauplaetze: roman.weltSchauplaetze,
      weltRegeln: roman.weltRegeln,
      existingExpose: exposeTextFromEditorial(editorial),
    });
    const nextEd = withStageImprove(
      withExposeText(
        invalidateDownstreamEditorial(editorial, "expose"),
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

  if (
    stage === "kapitelgeruest" ||
    stage === "grobgeruest" ||
    stage === "feingeruest"
  ) {
    const geruestStage =
      stage === "grobgeruest" ? "grobgeruest" : "feingeruest";
    const outlineOnly = stage === "grobgeruest";
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
        nextEd = invalidateDownstreamEditorial(prevEd, geruestStage);
        // Keep own-stage Reifegrad until assessAfter overwrites it. Clearing
        // here left a permanent gap when scoring timed out after a long draft.
        downstreamCleared = true;
      }
      const improveMap = { ...(nextEd.reifegradImprove ?? {}) };
      delete improveMap.kapitelgeruest;
      delete improveMap.grobgeruest;
      delete improveMap.feingeruest;
      nextEd = withStageImprove(
        {
          ...nextEd,
          kapitelGeruestStructured: payload.structured,
          kapitelGeruestRaw: payload.kapitelGeruestRaw,
          wissensGraph: payload.wissensGraph,
          reifegradImprove: improveMap,
        },
        geruestStage,
        null,
      );
      nextEd = withLeserFeedbackForStage(nextEd, geruestStage, null);
      liveRoman = await persist(liveRoman, {
        // Downstream Szenenplot markdown cleared with invalidate.
        manuskriptRaw: "",
        editorial: nextEd,
      });
    };

    const data = await suggestKapitelGeruestFromCoAutor({
      buchTyp,
      title: roman.title,
      genre: roman.genre,
      ideeKurz,
      grobRegeln,
      editorial,
      charaktere: roman.charaktere,
      weltSchauplaetze: roman.weltSchauplaetze,
      weltRegeln: roman.weltRegeln,
      existingGeruest: editorial.kapitelGeruestRaw ?? "",
      tonalitaet,
      mode: outlineOnly ? "outline" : "full",
      onProgress: options?.onProgress,
      onPartial: async (partial) => {
        await persistGeruestPartial(partial);
      },
    });

    // Final persist (covers callers without onPartial; refreshes final graph).
    await persistGeruestPartial({
      structured: data.structured,
      kapitelGeruestRaw: data.kapitelGeruestRaw,
      wissensGraph: data.wissensGraph,
    });

    const graphNodes = data.wissensGraph?.nodes.length ?? 0;
    const resumeNote = data.resumedOutline
      ? ` · fortgesetzt (${data.resumedChapters.length} Kap. behalten)`
      : "";
    const label = outlineOnly ? "Grobgerüst" : "Feingerüst";
    return {
      roman: liveRoman,
      summary: `${label} entworfen (${data.modelLabel}) · ${data.structured.chapters.length} Kap.${resumeNote} · Wissensgraph ${graphNodes} Knoten.`,
      modelLabel: data.modelLabel,
    };
  }

  if (
    stage === "szenenplot" ||
    stage === "grobplot" ||
    stage === "feinplot"
  ) {
    assertGeruestReadyForSzenenplot({ editorial });
    const geruest = editorial.kapitelGeruestStructured;
    if (!geruest?.chapters.length) {
      throw new Error("Feingerüst fehlt — zuerst Tab „Feingerüst“ erzeugen.");
    }
    const plotStage = stage === "grobplot" ? "grobplot" : "feinplot";
    const skeletonOnly = stage === "grobplot";

    let liveRoman = roman;
    let downstreamCleared = false;
    const baselinePlot = roman.manuskriptRaw ?? "";

    const persistPlotPartial = async (payload: {
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
        nextEd = invalidateDownstreamEditorial(prevEd, plotStage);
        downstreamCleared = true;
      }
      const improveMap = { ...(nextEd.reifegradImprove ?? {}) };
      delete improveMap.szenenplot;
      delete improveMap.grobplot;
      delete improveMap.feinplot;
      nextEd = withStageImprove(
        {
          ...nextEd,
          szenenplotStructured: payload.structured,
          wissensGraph: payload.wissensGraph,
          reifegradImprove: improveMap,
        },
        plotStage,
        null,
      );
      nextEd = withLeserFeedbackForStage(nextEd, plotStage, null);
      const guard = assertChapterStructure(baselinePlot, payload.szenenplot, {
        minChapters: 2,
        allowTitleChange: true,
      });
      let text = payload.szenenplot;
      if (baselinePlot.trim().length >= 80 && !guard.ok) {
        // Keep previous markdown mirror if structure guard fails mid-run;
        // structured JSON is still persisted for resume.
        text = liveRoman.manuskriptRaw ?? payload.szenenplot;
      } else if (guard.ok) {
        text = guard.text;
      }
      liveRoman = await persist(liveRoman, {
        manuskriptRaw: text,
        editorial: nextEd,
      });
    };

    const data = await suggestSzenenplotDetailFromCoAutor({
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
      existingPlot: baselinePlot,
      tonalitaet,
      mode: skeletonOnly ? "skeleton" : "full",
      onProgress: options?.onProgress,
      onPartial: async (partial) => {
        await persistPlotPartial(partial);
      },
    });

    await persistPlotPartial({
      structured: data.structured,
      szenenplot: data.szenenplot,
      wissensGraph: data.wissensGraph,
    });

    const sceneCount = data.structured.chapters.reduce(
      (n, c) => n + c.scenes.length,
      0,
    );
    const graphNodes = data.wissensGraph?.nodes.length ?? 0;
    const resumeNote = data.resumedChapters.length
      ? ` · ${data.resumedChapters.length} Kap. fortgesetzt`
      : "";
    const plotLabel = skeletonOnly ? "Grobplot" : "Feinplot";
    return {
      roman: liveRoman,
      summary: `${plotLabel} entworfen (${data.modelLabel}) · ${data.structured.chapters.length} Kap. / ${sceneCount} Szenen · Wissensgraph ${graphNodes} Knoten${resumeNote}.`,
      modelLabel: data.modelLabel,
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
        const nextEd = clearedFb;
        liveRoman = await persist(liveRoman, { editorial: nextEd });
      },
      onProgress: options?.onProgress,
      // Continuity on: storyState + full graph grow. Lean only skips Path-B / book length pass / 2nd expand.
      leanFullBook: true,
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
    const nextEd = withStageImprove(
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
    );
    const saved = await persist(liveRoman, { editorial: nextEd });
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
      roman: saved,
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
  } else if (
    stage === "kapitelgeruest" ||
    stage === "grobgeruest" ||
    stage === "feingeruest"
  ) {
    const geruestStructured = editorial.kapitelGeruestStructured;
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
      kapitelGeruest: geruestStructured?.chapters.length
        ? structuredKapitelGeruestToMarkdown(geruestStructured)
        : (editorial.kapitelGeruestRaw ?? ""),
      structured: geruestStructured,
    });
    raw = r.critique;
    modelLabel = r.modelLabel;
  } else if (
    stage === "szenenplot" ||
    stage === "grobplot" ||
    stage === "feinplot"
  ) {
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
