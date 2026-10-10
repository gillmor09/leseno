/**
 * Downstream invalidation for Roman pipeline stages.
 * Spec → Grobgerüst → Feingerüst → Grobplot → Feinplot → Manuskript;
 * never clears upstream.
 */

import type { RomanEditorial } from "@/lib/roman/editorial";
import {
  normalizePipelineStage,
  stagesAfter,
  type PipelineStage,
} from "@/lib/roman/pipeline/stages";
import { clearReifegradeForStages } from "@/lib/roman/reifegrad-model";

/** UI tab ids cleared when a pipeline stage is regenerated / improved. */
const STAGE_TO_FERTIG_TABS: Partial<
  Record<PipelineStage, Array<keyof NonNullable<RomanEditorial["pipelineFertig"]>>>
> = {
  expose: [
    "grobgeruest",
    "feingeruest",
    "grobplot",
    "feinplot",
    "schreiben",
    "export",
    // Legacy tab ids
    "outline",
    "szenenplot",
  ],
  grobgeruest: [
    "grobgeruest",
    "feingeruest",
    "grobplot",
    "feinplot",
    "schreiben",
    "export",
    "outline",
    "szenenplot",
  ],
  feingeruest: [
    "feingeruest",
    "grobplot",
    "feinplot",
    "schreiben",
    "export",
    "outline",
    "szenenplot",
  ],
  grobplot: ["grobplot", "feinplot", "schreiben", "export", "szenenplot"],
  feinplot: ["feinplot", "schreiben", "export", "szenenplot"],
  manuskript: ["schreiben", "export", "roman"],
};

/**
 * Stages whose content + Reifegrad + Fertig flags become stale after `changed`.
 */
export function cascadeStagesAfter(changed: PipelineStage): PipelineStage[] {
  const canonical = normalizePipelineStage(changed) ?? changed;
  return stagesAfter(canonical).filter(
    (s) =>
      s === "grobgeruest" ||
      s === "feingeruest" ||
      s === "grobplot" ||
      s === "feinplot" ||
      s === "manuskript",
  );
}

/**
 * Clear Fertig flags, Reifegrad, and stage content downstream of `changed`.
 * Does not wipe the changed stage itself.
 */
export function invalidateDownstreamEditorial(
  editorial: RomanEditorial,
  changed: PipelineStage | string,
): RomanEditorial {
  const canonical =
    normalizePipelineStage(changed) ??
    ((PIPELINE_SAFE as readonly string[]).includes(changed)
      ? (changed as PipelineStage)
      : null);
  if (!canonical) return editorial;

  const downstream = cascadeStagesAfter(canonical);
  if (downstream.length === 0 && !STAGE_TO_FERTIG_TABS[canonical]) {
    return editorial;
  }

  let next: RomanEditorial = {
    ...editorial,
    reifegrade: clearReifegradeForStages(editorial.reifegrade, downstream),
  };

  const fertigTabs = new Set(
    [
      ...(STAGE_TO_FERTIG_TABS[canonical] ?? []),
      ...downstream.flatMap((s) => STAGE_TO_FERTIG_TABS[s] ?? []),
    ],
  );
  if (fertigTabs.size > 0) {
    const pipelineFertig = { ...(next.pipelineFertig ?? {}) };
    for (const tab of fertigTabs) {
      delete pipelineFertig[tab];
    }
    next = { ...next, pipelineFertig };
  }

  const improve = { ...(next.reifegradImprove ?? {}) };
  const stageImprove = { ...(next.stageImprove ?? {}) };
  const feedback = { ...(next.leserFeedbackByStage ?? {}) };
  for (const s of downstream) {
    delete improve[s];
    delete stageImprove[s];
    delete feedback[s];
    // Legacy keys
    if (s === "feingeruest") delete improve.kapitelgeruest;
    if (s === "feinplot") delete improve.szenenplot;
  }
  next = {
    ...next,
    reifegradImprove: improve,
    stageImprove,
    leserFeedbackByStage: feedback,
  };

  if (downstream.includes("feingeruest") || downstream.includes("grobgeruest")) {
    next = {
      ...next,
      kapitelGeruestStructured: null,
      kapitelGeruestRaw: "",
    };
  }
  if (downstream.includes("grobplot") || downstream.includes("feinplot")) {
    next = {
      ...next,
      szenenplotStructured: null,
    };
  }
  if (downstream.includes("manuskript")) {
    const reifegrade = clearReifegradeForStages(next.reifegrade, [
      "manuskript",
      "roman",
    ]);
    next = {
      ...next,
      manuskriptText: "",
      manuskriptOriginalText: "",
      manuskriptOriginalSavedAt: null,
      manuskriptFreigabe: null,
      romanText: "",
      storyState: null,
      canon: null,
      leserFeedback: null,
      klappentext: "",
      einzeiler: "",
      amazonKeywords: [],
      reifegrade,
    };
  }

  return next;
}

const PIPELINE_SAFE = [
  "idee",
  "charaktere",
  "welt",
  "expose",
  "grobgeruest",
  "feingeruest",
  "grobplot",
  "feinplot",
  "manuskript",
] as const;

/**
 * Clear Manuskript prose + continuity + Export-Marketing texts.
 */
export function clearManuskriptAndExportEditorial(
  editorial: RomanEditorial,
): RomanEditorial {
  const pipelineFertig = { ...(editorial.pipelineFertig ?? {}) };
  delete pipelineFertig.schreiben;
  delete pipelineFertig.export;
  delete pipelineFertig.roman;
  return {
    ...editorial,
    manuskriptText: "",
    manuskriptOriginalText: "",
    manuskriptOriginalSavedAt: null,
    manuskriptFreigabe: null,
    romanText: "",
    storyState: null,
    canon: null,
    leserFeedback: null,
    klappentext: "",
    einzeiler: "",
    amazonKeywords: [],
    pipelineFertig,
    reifegrade: clearReifegradeForStages(editorial.reifegrade, [
      "manuskript",
      "roman",
    ]),
  };
}

export function hasManuskriptContent(
  editorial: RomanEditorial | null | undefined,
): boolean {
  return Boolean((editorial?.manuskriptText ?? "").trim().length >= 80);
}

export function hasSzenenplotOrManuskriptContent(
  editorial: RomanEditorial | null | undefined,
): boolean {
  if (hasManuskriptContent(editorial)) return true;
  const plot = editorial?.szenenplotStructured;
  return Boolean(plot && plot.chapters.length > 0);
}

export function hasGeruestContent(
  editorial: RomanEditorial | null | undefined,
): boolean {
  return Boolean(
    (editorial?.kapitelGeruestStructured?.chapters.length ?? 0) > 0 ||
      (editorial?.kapitelGeruestRaw ?? "").trim().length >= 40,
  );
}

/**
 * Banner copy when regenerating a stage that will wipe downstream.
 * Call as `generateCascadeConfirm(editorial, stage)`.
 */
export function generateCascadeConfirm(
  editorial: RomanEditorial,
  stageRaw: PipelineStage | string,
): { title: string; description: string } | null {
  const stage = normalizePipelineStage(stageRaw) ?? stageRaw;

  if (
    (stage === "expose" || stage === "grobgeruest") &&
    (hasGeruestContent(editorial) || hasSzenenplotOrManuskriptContent(editorial))
  ) {
    return {
      title: "Downstream verwerfen?",
      description:
        "Gerüst, Plot und Manuskript können veraltet sein. Beim Erzeugen werden sie geleert und neu aufgebaut.",
    };
  }
  if (
    stage === "feingeruest" &&
    hasSzenenplotOrManuskriptContent(editorial)
  ) {
    return {
      title: "Plot & Manuskript verwerfen?",
      description:
        "Szenenplot und Manuskript können veraltet sein — Feingerüst geändert. Bitte Plot und Manuskript neu erzeugen oder prüfen.",
    };
  }
  if (
    (stage === "grobplot" || stage === "feinplot") &&
    hasManuskriptContent(editorial)
  ) {
    return {
      title: "Manuskript verwerfen?",
      description:
        "Manuskript kann veraltet sein — Plot geändert. Bitte Manuskript neu erzeugen oder prüfen.",
    };
  }
  return null;
}

/** Call as `downstreamStaleBanner(editorial, stage)`. */
export function downstreamStaleBanner(
  editorial: RomanEditorial,
  stageRaw: PipelineStage | string,
): string | null {
  const stage = normalizePipelineStage(stageRaw) ?? stageRaw;
  const hasPlot = Boolean(editorial.szenenplotStructured?.chapters.length);
  const hasMs = hasManuskriptContent(editorial);

  if (stage === "feingeruest" && (hasPlot || hasMs)) {
    return "Szenenplot / Manuskript können veraltet sein — Gerüst geändert. Bitte Plot und Manuskript neu erzeugen oder prüfen.";
  }
  if ((stage === "grobplot" || stage === "feinplot") && hasMs) {
    return "Manuskript kann veraltet sein — Szenenplot geändert. Bitte Manuskript neu erzeugen oder prüfen.";
  }
  return null;
}
