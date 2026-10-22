/**
 * Soft-migrate existing books onto `editorial.phaseState`.
 * Conservative: prefer draft over silent canon unless Fertig + fingerprint match.
 */

import {
  emptyRomanEditorial,
  isPipelineTabFertig,
  type RomanEditorial,
} from "@/lib/roman/editorial";
import { fingerprintForPhase } from "@/lib/roman/phase-fingerprints";
import {
  approvePhase,
  emptyPhaseStateEntry,
  getPhaseState,
  withPhaseState,
  type PhaseStateEntry,
} from "@/lib/roman/phase-state";
import {
  PROCESS_PHASES,
  type ProcessPhase,
} from "@/lib/roman/pipeline/stages";
import { evaluateStageHardGate } from "@/lib/roman/stage-hard-gates";
import type { RomanKontext } from "@/lib/roman/types";

/** Map process phase → soft Fertig tab id used historically. */
const FERTIG_TAB_FOR_PHASE: Partial<
  Record<ProcessPhase, keyof NonNullable<RomanEditorial["pipelineFertig"]>>
> = {
  idee: "idee",
  rahmen: "rahmen",
  fundament: "fundament",
  expose: "expose",
  graph: "graph",
  plot: "plot",
  szenen: "szenen",
  manuskript: "schreiben",
  export: "export",
};

/**
 * Ensure phaseState keys exist; optionally promote to approved when
 * Hard-Gate green + Fertig — stores current fingerprint as canon.
 */
export function migrateEditorialPhaseState(
  roman: Pick<
    RomanKontext,
    | "title"
    | "genre"
    | "tonalitaet"
    | "perspektive"
    | "zeitform"
    | "charaktere"
    | "weltSchauplaetze"
    | "weltRegeln"
    | "manuskriptRaw"
    | "coverImageDataUrl"
    | "coverPrompt"
    | "autorName"
    | "vorsatz"
  > & { editorial: RomanEditorial | null | undefined },
): RomanEditorial {
  const editorial = roman.editorial ?? emptyRomanEditorial();
  let next = editorial;
  const ctx = { ...roman, editorial: next };

  for (const phase of PROCESS_PHASES) {
    const prev = getPhaseState(next, phase);
    if (prev.status !== "draft" || prev.approvedAt || prev.fingerprint) {
      if (!next.phaseState?.[phase]) {
        next = withPhaseState(next, phase, prev);
      }
      continue;
    }

    const fp = fingerprintForPhase(phase, { ...ctx, editorial: next });
    const fertigTab = FERTIG_TAB_FOR_PHASE[phase];
    const fertig = fertigTab
      ? isPipelineTabFertig(next, fertigTab)
      : false;

    let gateOk = false;
    // Lektorat / Export have no Hard-Gate stage.
    if (phase !== "lektorat" && phase !== "export") {
      try {
        const gate = evaluateStageHardGate({
          stage: phase,
          editorial: next,
          tonalitaet: roman.tonalitaet,
          genre: roman.genre,
        });
        gateOk = gate.ok && !gate.viaOverride;
      } catch {
        gateOk = false;
      }
    }

    let entry: PhaseStateEntry = emptyPhaseStateEntry();
    if (fertig && gateOk && fp) {
      next = approvePhase(next, phase, fp);
      continue;
    }

    next = withPhaseState(next, phase, entry);
  }

  return next;
}
