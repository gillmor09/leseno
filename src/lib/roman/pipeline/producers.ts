/**
 * Stage draft + critique producers — wraps existing suggest/critique modules.
 */

import { generateText } from "@/lib/ai/provider";
import {
  buildCritiqueRulesAndNeedsBlock,
  emptyRomanEditorial,
  exposeTextFromEditorial,
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
import { upsertRomanKontext } from "@/lib/roman/repository";
import { critiqueIdeeMitEntwicklungslektor } from "@/lib/roman/idea-qa";
import {
  refineCharaktereWithFachberater,
  suggestCharaktereFromIdee,
} from "@/lib/roman/suggest-charaktere";
import {
  critiqueExposeMitEntwicklungslektor,
  suggestExposeFromCoAutor,
} from "@/lib/roman/suggest-expose";
import {
  critiqueManuskriptMitEntwicklungslektor,
  formatManuskriptWordMetrics,
  suggestManuskriptFromLektorUndCoAutor,
} from "@/lib/roman/suggest-manuskript";
import {
  critiqueSzenenplotMitEntwicklungslektor,
  suggestSzenenplotFromCoAutor,
} from "@/lib/roman/suggest-szenenplot";
import {
  critiqueWeltMitFachberater,
  suggestWeltFromLektorUndCoAutor,
} from "@/lib/roman/suggest-welt";
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
  const grobRegeln = editorial.grobRegeln ?? "";

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
      grobRegeln,
      charaktere: roman.charaktere,
      weltSchauplaetze: roman.weltSchauplaetze,
      weltRegeln: roman.weltRegeln,
      existingExpose: exposeTextFromEditorial(editorial),
    });
    const nextEd = withStageImprove(
      withExposeText(editorial, data.expose),
      "expose",
      null,
    );
    const saved = await persist(roman, { editorial: nextEd });
    return {
      roman: saved,
      summary: `Exposé entworfen (${data.modelLabel}).`,
      modelLabel: data.modelLabel,
    };
  }

  if (stage === "szenenplot") {
    const data = await suggestSzenenplotFromCoAutor({
      buchTyp,
      title: roman.title,
      genre: roman.genre,
      ideeKurz,
      grobRegeln,
      editorial,
      charaktere: roman.charaktere,
      weltSchauplaetze: roman.weltSchauplaetze,
      weltRegeln: roman.weltRegeln,
      existingPlot: roman.manuskriptRaw ?? "",
    });
    const guard = assertChapterStructure(
      roman.manuskriptRaw ?? "",
      data.szenenplot,
      { minChapters: 2, allowTitleChange: true },
    );
    // First-time create: baseline may be empty — accept if candidate has chapters
    let text = data.szenenplot;
    if ((roman.manuskriptRaw ?? "").trim().length >= 80 && !guard.ok) {
      throw new Error(guard.error);
    }
    if (guard.ok) text = guard.text;
    const nextEd = withStageImprove(
      {
        ...editorial,
        szenenplotStructured: data.structured,
      },
      "szenenplot",
      null,
    );
    const saved = await persist(roman, {
      manuskriptRaw: text,
      editorial: nextEd,
    });
    const sceneCount = data.structured.chapters.reduce(
      (n, c) => n + c.scenes.length,
      0,
    );
    return {
      roman: saved,
      summary: `Kapitelgerüst entworfen (${data.modelLabel}) · ${data.structured.chapters.length} Kap. / ${sceneCount} Szenen.`,
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
    const data = await suggestManuskriptFromLektorUndCoAutor({
      buchTyp,
      title: roman.title,
      genre: roman.genre,
      ideeKurz,
      grobRegeln,
      editorial,
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
    const nextEd = withStageImprove(
      withLeserFeedbackForStage(
        {
          ...(liveRoman.editorial ?? emptyRomanEditorial()),
          manuskriptText: sealed,
          manuskriptOriginalText: "",
          manuskriptOriginalSavedAt: null,
          canon: null,
          storyState: data.storyState ?? null,
        },
        "manuskript",
        null,
      ),
      "manuskript",
      null,
    );
    const saved = await persist(liveRoman, { editorial: nextEd });
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
    const r = await critiqueWeltMitFachberater({
      buchTyp,
      ideeKurz,
      grobRegeln,
      charaktere: roman.charaktere,
      welt: {
        weltSchauplaetze: roman.weltSchauplaetze,
        weltRegeln: roman.weltRegeln,
      },
      editorial,
      roleKey: "entwicklungslektor",
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
  } else if (stage === "szenenplot") {
    const r = await critiqueSzenenplotMitEntwicklungslektor({
      buchTyp,
      ideeKurz,
      grobRegeln,
      expose: exposeTextFromEditorial(editorial),
      charaktere: roman.charaktere,
      weltSchauplaetze: roman.weltSchauplaetze,
      weltRegeln: roman.weltRegeln,
      szenenplot: roman.manuskriptRaw ?? "",
      editorial,
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
  const data = await refineCharaktereWithFachberater({
    buchTyp: buchTypOf(roman),
    ideeKurz: editorial.ideeKurz ?? "",
    grobRegeln: editorial.grobRegeln ?? "",
    existing: roman.charaktere,
  });
  return persist(roman, { charaktere: data.charaktere });
}
