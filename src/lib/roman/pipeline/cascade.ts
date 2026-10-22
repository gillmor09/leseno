/**
 * Downstream invalidation for Roman pipeline stages.
 * Spec → Graph → Plot → Szenen → Manuskript; never clears upstream.
 * Soft upstream edits: {@link markDownstreamPhasesStale} (no wipe).
 * Hard regen: {@link invalidateDownstreamEditorial} wipes content + marks stale.
 */

import type {
  RomanEditorial,
  StageGateKey,
  StageGateOverrides,
} from "@/lib/roman/editorial";
import { markDownstreamPhasesStale } from "@/lib/roman/phase-state";
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
  idee: [
    "idee",
    "typ",
    "rahmen",
    "fundament",
    "spec",
    "graph",
    "plot",
    "szenen",
    "feingeruest",
    "feinplot",
    "schreiben",
    "export",
    "roman",
    "outline",
    "szenenplot",
    "grobgeruest",
    "grobplot",
  ],
  rahmen: [
    "rahmen",
    "typ",
    "fundament",
    "spec",
    "graph",
    "plot",
    "szenen",
    "schreiben",
    "export",
  ],
  fundament: [
    "fundament",
    "spec",
    "graph",
    "plot",
    "szenen",
    "schreiben",
    "export",
  ],
  expose: [
    "spec",
    "graph",
    "plot",
    "szenen",
    "feingeruest",
    "feinplot",
    "schreiben",
    "export",
    "outline",
    "szenenplot",
    "grobgeruest",
    "grobplot",
  ],
  graph: ["graph", "plot", "szenen", "schreiben", "export"],
  plot: [
    "plot",
    "feingeruest",
    "szenen",
    "feinplot",
    "schreiben",
    "export",
    "szenenplot",
    "grobplot",
  ],
  szenen: ["szenen", "feinplot", "schreiben", "export", "szenenplot", "grobplot"],
  feingeruest: ["plot", "feingeruest", "szenen", "feinplot", "schreiben", "export"],
  feinplot: ["szenen", "feinplot", "schreiben", "export"],
  manuskript: ["schreiben", "export", "roman"],
};

const STAGE_TO_GATE_KEYS: Partial<Record<PipelineStage, StageGateKey[]>> = {
  idee: [
    "idee",
    "basics",
    "rahmen",
    "fundament",
    "spec",
    "expose",
    "graph",
    "plot",
    "szenen",
    "feingeruest",
    "feinplot",
    "schreiben",
  ],
  rahmen: [
    "basics",
    "rahmen",
    "fundament",
    "spec",
    "expose",
    "graph",
    "plot",
    "szenen",
    "schreiben",
  ],
  fundament: ["fundament", "spec", "expose", "graph", "plot", "szenen", "schreiben"],
  expose: ["spec", "expose", "graph", "plot", "szenen", "schreiben"],
  graph: ["graph", "plot", "szenen", "schreiben"],
  plot: ["plot", "feingeruest", "szenen", "feinplot", "schreiben"],
  szenen: ["szenen", "feinplot", "schreiben"],
  feingeruest: ["plot", "feingeruest", "szenen", "feinplot", "schreiben"],
  feinplot: ["szenen", "feinplot", "schreiben"],
  manuskript: ["schreiben"],
};

function clearStageGateOverridesFor(
  overrides: StageGateOverrides | undefined,
  keys: StageGateKey[],
): StageGateOverrides {
  const next: StageGateOverrides = { ...(overrides ?? {}) };
  for (const k of keys) delete next[k];
  return next;
}

/**
 * Stages whose content + Reifegrad + Fertig flags become stale after `changed`.
 */
export function cascadeStagesAfter(changed: PipelineStage): PipelineStage[] {
  const canonical = normalizePipelineStage(changed) ?? changed;
  if (canonical === "idee") {
    return stagesAfter("idee");
  }
  return stagesAfter(canonical as PipelineStage);
}

/**
 * Soft impact: mark downstream phases stale without wiping artifacts.
 */
export function softInvalidateDownstream(
  editorial: RomanEditorial,
  changed: PipelineStage | string,
  reason?: string,
): RomanEditorial {
  return markDownstreamPhasesStale(editorial, changed, reason);
}

/**
 * Clear Fertig flags, Reifegrad, and stage content downstream of `changed`.
 * Does not wipe the changed stage itself. Also marks phaseState stale.
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
    return markDownstreamPhasesStale(editorial, canonical);
  }

  let next: RomanEditorial = {
    ...editorial,
    reifegrade: clearReifegradeForStages(editorial.reifegrade, [
      ...downstream,
      // legacy aliases
      ...(downstream.includes("plot")
        ? (["feingeruest", "kapitelgeruest", "grobgeruest"] as const)
        : []),
      ...(downstream.includes("szenen")
        ? (["feinplot", "szenenplot", "grobplot"] as const)
        : []),
    ] as Parameters<typeof clearReifegradeForStages>[1]),
  };

  const fertigTabs = new Set([
    ...(STAGE_TO_FERTIG_TABS[canonical] ?? []),
    ...downstream.flatMap((s) => STAGE_TO_FERTIG_TABS[s] ?? []),
  ]);
  if (fertigTabs.size > 0) {
    const pipelineFertig = { ...(next.pipelineFertig ?? {}) };
    for (const tab of fertigTabs) {
      delete pipelineFertig[tab];
    }
    next = { ...next, pipelineFertig };
  }

  const gateKeys = new Set<StageGateKey>([
    ...(STAGE_TO_GATE_KEYS[canonical] ?? []),
    ...downstream.flatMap((s) => STAGE_TO_GATE_KEYS[s] ?? []),
  ]);
  if (gateKeys.size > 0) {
    next = {
      ...next,
      stageGateOverrides: clearStageGateOverridesFor(next.stageGateOverrides, [
        ...gateKeys,
      ]),
    };
  }

  const improve = { ...(next.reifegradImprove ?? {}) };
  const stageImprove = { ...(next.stageImprove ?? {}) };
  const feedback = { ...(next.leserFeedbackByStage ?? {}) };
  for (const s of downstream) {
    delete improve[s];
    delete stageImprove[s];
    delete feedback[s];
    if (s === "plot") {
      delete improve.kapitelgeruest;
      delete improve.feingeruest;
      delete improve.grobgeruest;
    }
    if (s === "szenen") {
      delete improve.szenenplot;
      delete improve.feinplot;
      delete improve.grobplot;
    }
    if (s === "fundament") {
      delete improve.charaktere;
      delete improve.welt;
    }
  }
  next = {
    ...next,
    reifegradImprove: improve,
    stageImprove,
    leserFeedbackByStage: feedback,
  };

  if (
    canonical === "idee" ||
    downstream.includes("expose") ||
    downstream.includes("fundament")
  ) {
    next = {
      ...next,
      rechercheDossier: canonical === "idee" ? "" : next.rechercheDossier,
      rechercheChat: canonical === "idee" ? [] : next.rechercheChat,
      rechercheSources: canonical === "idee" ? [] : next.rechercheSources,
      handlungsArchitektur:
        canonical === "idee" || downstream.includes("expose")
          ? ""
          : next.handlungsArchitektur,
      weltBibel:
        canonical === "idee" || downstream.includes("fundament")
          ? ""
          : next.weltBibel,
      wissensGraph:
        canonical === "idee" || downstream.includes("graph")
          ? null
          : next.wissensGraph,
      reifegrade: clearReifegradeForStages(next.reifegrade, [
        ...(canonical === "idee" ? (["idee", "expose"] as const) : []),
        ...downstream,
      ]),
    };
  }

  if (
    downstream.includes("graph") ||
    downstream.includes("plot") ||
    downstream.includes("szenen") ||
    downstream.includes("feingeruest") ||
    downstream.includes("feinplot")
  ) {
    const wipeGraph = downstream.includes("graph") || canonical === "idee";
    const wipePlot =
      downstream.includes("plot") ||
      downstream.includes("feingeruest") ||
      downstream.includes("szenen") ||
      downstream.includes("feinplot");
    const wipeSzenen =
      downstream.includes("szenen") || downstream.includes("feinplot");
    next = {
      ...next,
      ...(wipeGraph ? { wissensGraph: null } : {}),
      ...(wipePlot
        ? {
            kapitelGeruestStructured: null,
            kapitelGeruestRaw: "",
          }
        : {}),
      ...(wipeSzenen ? { szenenplotStructured: null } : {}),
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

  return markDownstreamPhasesStale(next, canonical, "Downstream nach Erzeugen/Wipe");
}

/**
 * Idee-Neustart: wipe Spec→Manuskript while keeping Basics
 * (grobRegeln, harteRegeln, richtungen, Alter, Lesestufe, Zielwortzahl, buchTyp).
 * Tonalität / kiRegelwerk live on roman_kontext roots — caller must not wipe them.
 */
export function resetEditorialFromIdeeKeepingBasics(
  editorial: RomanEditorial,
): RomanEditorial {
  let next = invalidateDownstreamEditorial(
    {
      ...editorial,
      ideeKurz: "",
      stageImprove: {},
      reifegradImprove: {},
    },
    "idee",
  );
  next = {
    ...next,
    ideeKurz: "",
    rechercheDossier: "",
    rechercheChat: [],
    rechercheSources: [],
    handlungsArchitektur: "",
    weltBibel: "",
    kapitelGeruestStructured: null,
    kapitelGeruestRaw: "",
    szenenplotStructured: null,
    wissensGraph: null,
    stageGateOverrides: {},
    phaseState: {},
  };
  return next;
}

const PIPELINE_SAFE = [
  "idee",
  "rahmen",
  "fundament",
  "charaktere",
  "welt",
  "expose",
  "graph",
  "plot",
  "szenen",
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
 */
export function generateCascadeConfirm(
  editorial: RomanEditorial,
  stageRaw: PipelineStage | string,
): { title: string; description: string } | null {
  const stage = normalizePipelineStage(stageRaw) ?? stageRaw;

  if (
    (stage === "expose" || stage === "fundament") &&
    (hasGeruestContent(editorial) ||
      hasSzenenplotOrManuskriptContent(editorial) ||
      editorial.wissensGraph?.nodes.length)
  ) {
    return {
      title: "Downstream verwerfen?",
      description:
        "Wissensgraph, Plot, Szenen und Manuskript werden geleert und müssen danach Stufe für Stufe neu erzeugt und freigegeben werden.",
    };
  }
  if (
    stage === "graph" &&
    (hasGeruestContent(editorial) || hasSzenenplotOrManuskriptContent(editorial))
  ) {
    return {
      title: "Plot & Szenen verwerfen?",
      description:
        "Plot, Szenen und Manuskript werden verworfen. Danach neu erzeugen und freigeben.",
    };
  }
  if (
    stage === "plot" &&
    (hasSzenenplotOrManuskriptContent(editorial) || hasManuskriptContent(editorial))
  ) {
    return {
      title: "Szenen & Manuskript verwerfen?",
      description:
        "Szenen und Manuskript werden geleert. Nach freigegebenem Plot Szenen neu erzeugen.",
    };
  }
  if (stage === "szenen" && hasManuskriptContent(editorial)) {
    return {
      title: "Manuskript verwerfen?",
      description:
        "Manuskript wird geleert. Nach freigegebenen Szenen Manuskript neu erzeugen.",
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
  const hasMs = hasManuskriptContent(editorial);
  const hasSzenen = Boolean(editorial.szenenplotStructured?.chapters.length);

  if (stage === "plot" && (hasSzenen || hasMs)) {
    return "Szenen / Manuskript können veraltet sein — Plot geändert. Bitte Szenen und Manuskript neu erzeugen und freigeben.";
  }
  if (stage === "szenen" && hasMs) {
    return "Manuskript kann veraltet sein — Szenen geändert. Bitte Manuskript neu erzeugen (Szenen-Hard-Gate + Freigabe).";
  }
  if (stage === "graph" && (hasGeruestContent(editorial) || hasSzenen || hasMs)) {
    return "Plot / Szenen / Manuskript können veraltet sein — Wissensgraph geändert.";
  }
  return null;
}
