/**
 * Hard progression gates Idee → … → Manuskript.
 * `pipelineFertig` is NOT a silent bypass for logic/Who-did-X/props/timeline —
 * only explicit {@link StageGateOverride} (UI „Trotzdem weiter“) unlocks red gates.
 */

import {
  exposeTextFromEditorial,
  hardManuskriptFreigabeFindings,
  hasStageGateOverride,
  isManuskriptFreigabeReadyForRoman,
  type RomanEditorial,
  type StageGateKey,
  type StageGateOverride,
  type StageGateOverrides,
} from "@/lib/roman/editorial";
import { auditGeruestPlotClaims } from "@/lib/roman/geruest-plot-claims";
import {
  isGeruestStage,
  isPlotStage,
  normalizePipelineStage,
  type PipelineStage,
} from "@/lib/roman/pipeline/stages";
import type { StageReifegrad } from "@/lib/roman/reifegrad-model";
import {
  GERUEST_MANUSKRIPT_AXIS_MIN_PCT,
  auditKapitelGeruestStructured,
  auditSzenenplotStructured,
} from "@/lib/roman/szenenplot-preflight";
import { hasFilledManuskript } from "@/lib/roman/fill-checks";
import { listThinConcreteNodes } from "@/lib/roman/wissens-graph-thin";

export type {
  StageGateKey,
  StageGateOverride,
  StageGateOverrides,
} from "@/lib/roman/editorial";

export {
  hasStageGateOverride,
  parseStageGateOverrides,
  withStageGateOverride,
} from "@/lib/roman/editorial";

export type StageHardGateFinding = {
  severity: "error" | "warning";
  code: string;
  message: string;
};

export type StageHardGateResult = {
  stage: StageGateKey | PipelineStage;
  ok: boolean;
  /** True when ok only because of explicit override. */
  viaOverride: boolean;
  findings: StageHardGateFinding[];
  summary: string;
};

/** Idee / Spec Reifegrad floors before leaving the stage. */
export const IDEE_GATE_LOGIK_MIN_PCT = 70;
/** Idee craft B = Kernkonflikt (stored as dramaturgiePct). */
export const IDEE_GATE_KERNKONFLIKT_MIN_PCT = 70;
/** Idee craft C = Tragfähigkeit (stored as leseflussPct). */
export const IDEE_GATE_TRAGFAEHIGKEIT_MIN_PCT = 65;
/** @deprecated Use {@link IDEE_GATE_KERNKONFLIKT_MIN_PCT}. */
export const IDEE_GATE_VERSPRECHEN_MIN_PCT = IDEE_GATE_KERNKONFLIKT_MIN_PCT;
export const SPEC_GATE_LOGIK_MIN_PCT = 70;
export const GERUEST_GATE_LOGIK_MIN_PCT = 70;

const GATE_KEYS: StageGateKey[] = [
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
];

function mapIssues(
  issues: Array<{
    severity: "error" | "warning";
    code: string;
    message: string;
  }>,
): StageHardGateFinding[] {
  return issues.map((i) => ({
    severity: i.severity,
    code: i.code,
    message: i.message,
  }));
}

function scoreAxesOk(
  score: StageReifegrad | null | undefined,
  axes: Array<{ pct: number; min: number; label: string }>,
): StageHardGateFinding[] {
  if (!score) {
    return [
      {
        severity: "error",
        code: "reifegrad_missing",
        message: "Reifegrad fehlt — zuerst messen (läuft mit Erzeugen).",
      },
    ];
  }
  const out: StageHardGateFinding[] = [];
  for (const a of axes) {
    if (a.pct < a.min) {
      out.push({
        severity: "error",
        code: "reifegrad_floor",
        message: `${a.label} ${a.pct}% — Ziel ≥${a.min}%.`,
      });
    }
  }
  return out;
}

/**
 * Basics gate (after Idee): genre + tonality + grobRegeln are Priority-0 Canon.
 * Tonalität lives on `roman_kontext.tonalitaet` — pass via `tonalitaet` / `genre`.
 */
export function evaluateBasicsGate(input: {
  editorial: RomanEditorial;
  tonalitaet?: string | null;
  genre?: string | null;
}): StageHardGateFinding[] {
  const findings: StageHardGateFinding[] = [];
  if (!(input.genre ?? "").trim()) {
    findings.push({
      severity: "error",
      code: "basics_genre",
      message:
        "Basics: Genre fehlt — aus Idee ableiten oder manuell setzen.",
    });
  }
  if (!(input.tonalitaet ?? "").trim()) {
    findings.push({
      severity: "error",
      code: "basics_tonalitaet",
      message:
        "Basics: Sprache & Tonalität fehlt — aus Idee ableiten (Priority-0-Canon).",
    });
  } else if ((input.tonalitaet ?? "").trim().length < 40) {
    findings.push({
      severity: "error",
      code: "basics_tonalitaet_thin",
      message: "Basics: Tonalität zu dünn — bitte nachschärfen oder neu ableiten.",
    });
  }
  if (!(input.editorial.grobRegeln ?? "").trim()) {
    findings.push({
      severity: "error",
      code: "basics_regeln",
      message:
        "Basics: Basis-Regeln fehlen — aus Idee ableiten (Priority-0-Canon).",
    });
  } else if ((input.editorial.grobRegeln ?? "").trim().length < 40) {
    findings.push({
      severity: "error",
      code: "basics_regeln_thin",
      message: "Basics: Basis-Regeln zu dünn — bitte nachschärfen oder neu ableiten.",
    });
  }
  return findings;
}

/** @deprecated Prefer {@link evaluateBasicsGate}; kept for call-site compatibility. */
export function evaluateBasicsTonalitaetFinding(
  tonalitaet: string | null | undefined,
): StageHardGateFinding | null {
  if ((tonalitaet ?? "").trim()) return null;
  return {
    severity: "error",
    code: "basics_tonalitaet",
    message:
      "Basics: Sprache & Tonalität fehlt — ohne Ton kein harter Canon für spätere Stufen.",
  };
}

function evaluateIdee(editorial: RomanEditorial): StageHardGateFinding[] {
  const findings: StageHardGateFinding[] = [];
  const idee = (editorial.ideeKurz ?? "").trim();
  if (idee.length < 80) {
    findings.push({
      severity: "error",
      code: "idee_thin",
      message: "Idee zu dünn (<80 Zeichen) — bitte Idee erzeugen/vertiefen.",
    });
  }
  const score = editorial.reifegrade?.idee ?? null;
  // Gate order follows weight priority (Kernkonflikt → Tragfähigkeit → Logik).
  findings.push(
    ...scoreAxesOk(score, [
      {
        pct: score?.dramaturgiePct ?? 0,
        min: IDEE_GATE_KERNKONFLIKT_MIN_PCT,
        label: "Idee · Kernkonflikt",
      },
      {
        pct: score?.leseflussPct ?? 0,
        min: IDEE_GATE_TRAGFAEHIGKEIT_MIN_PCT,
        label: "Idee · Tragfähigkeit",
      },
      {
        pct: score?.regelnPct ?? 0,
        min: IDEE_GATE_LOGIK_MIN_PCT,
        label: "Idee · Logik",
      },
    ]),
  );
  return findings;
}

function evaluateSpec(editorial: RomanEditorial): StageHardGateFinding[] {
  const findings: StageHardGateFinding[] = [];
  const expose = exposeTextFromEditorial(editorial).trim();
  if (expose.length < 120) {
    findings.push({
      severity: "error",
      code: "spec_thin",
      message: "Spec/Exposé zu dünn — bitte Spec erzeugen.",
    });
  }
  const score = editorial.reifegrade?.expose ?? null;
  findings.push(
    ...scoreAxesOk(score, [
      {
        pct: score?.regelnPct ?? 0,
        min: SPEC_GATE_LOGIK_MIN_PCT,
        label: "Spec · Logik",
      },
    ]),
  );
  return findings;
}

function evaluateFundament(
  editorial: RomanEditorial,
  input: { tonalitaet?: string | null; genre?: string | null },
): StageHardGateFinding[] {
  void input;
  const findings: StageHardGateFinding[] = [];
  // Charaktere/Welt live on roman_kontext — gate only checks expose/spec score when present;
  // structural emptiness is enforced via UI + producer asserts.
  const score =
    editorial.reifegrade?.fundament ?? editorial.reifegrade?.expose ?? null;
  if (score) {
    findings.push(
      ...scoreAxesOk(score, [
        {
          pct: score.regelnPct ?? 0,
          min: SPEC_GATE_LOGIK_MIN_PCT,
          label: "Fundament · Logik",
        },
      ]),
    );
  }
  return findings;
}

/** Reifegrad floors before leaving Wissensgraph (Logik + Konkretheit). */
export const GRAPH_GATE_LOGIK_MIN_PCT = 70;
export const GRAPH_GATE_KONKRETHEIT_MIN_PCT = 70;

function evaluateGraph(editorial: RomanEditorial): StageHardGateFinding[] {
  const findings: StageHardGateFinding[] = [];
  const graph = editorial.wissensGraph;
  if (!graph?.nodes.length || graph.nodes.length < 4) {
    findings.push({
      severity: "error",
      code: "graph_missing",
      message: "Wissensgraph fehlt oder zu dünn (mind. 4 Knoten).",
    });
    return findings;
  }
  const thin = listThinConcreteNodes(graph);
  const critical = thin.filter(
    (t) => t.kind === "prop" || t.kind === "place" || t.kind === "event",
  );
  if (critical.length >= 4) {
    findings.push({
      severity: "error",
      code: "graph_thin",
      message: `Wissensgraph zu unkonkret (${critical.length} Props/Orte/Events ohne Farbe/Kennzeichen/Material/Adresse).`,
    });
  }
  const score = editorial.reifegrade?.graph ?? null;
  findings.push(
    ...scoreAxesOk(score, [
      {
        pct: score?.regelnPct ?? 0,
        min: GRAPH_GATE_LOGIK_MIN_PCT,
        label: "Wissensgraph · Logik",
      },
      {
        // craft B = Konkretheit (dramaturgiePct)
        pct: score?.dramaturgiePct ?? 0,
        min: GRAPH_GATE_KONKRETHEIT_MIN_PCT,
        label: "Wissensgraph · Konkretheit",
      },
    ]),
  );
  return findings;
}

function evaluatePlotGeruest(editorial: RomanEditorial): StageHardGateFinding[] {
  const findings: StageHardGateFinding[] = [];
  const label = "Plot";
  const geruest = editorial.kapitelGeruestStructured;
  if (!geruest?.chapters.length || geruest.chapters.length < 2) {
    findings.push({
      severity: "error",
      code: "geruest_missing",
      message: `${label} fehlt (mind. 2 Kapitel).`,
    });
    return findings;
  }
  const geruestAudit = auditKapitelGeruestStructured(geruest);
  findings.push(...mapIssues(geruestAudit.errors));
  findings.push(
    ...mapIssues(
      geruestAudit.warnings.filter((w) => w.code === "plot_claim_orphan"),
    ),
  );
  const score =
    editorial.reifegrade?.plot ??
    editorial.reifegrade?.feingeruest ??
    editorial.reifegrade?.kapitelgeruest ??
    editorial.reifegrade?.grobgeruest ??
    null;
  findings.push(
    ...scoreAxesOk(score, [
      {
        pct: score?.regelnPct ?? 0,
        min: GERUEST_GATE_LOGIK_MIN_PCT,
        label: `${label} · Logik`,
      },
    ]),
  );
  return findings;
}

function evaluateFeinplot(
  editorial: RomanEditorial,
): StageHardGateFinding[] {
  const findings: StageHardGateFinding[] = [];
  const label = "Szenen";
  const structured = editorial.szenenplotStructured;
  if (!structured?.chapters.length) {
    findings.push({
      severity: "error",
      code: "feinplot_missing",
      message: `${label} fehlen.`,
    });
    return findings;
  }
  const audit = auditSzenenplotStructured(structured);
  findings.push(...mapIssues(audit.errors));
  const score =
    editorial.reifegrade?.szenen ??
    editorial.reifegrade?.feinplot ??
    editorial.reifegrade?.szenenplot ??
    editorial.reifegrade?.grobplot ??
    null;
  findings.push(
    ...scoreAxesOk(score, [
      {
        pct: score?.regelnPct ?? 0,
        min: GERUEST_MANUSKRIPT_AXIS_MIN_PCT,
        label: `${label} · Logik`,
      },
      {
        pct: score?.dramaturgiePct ?? 0,
        min: GERUEST_MANUSKRIPT_AXIS_MIN_PCT,
        label: "Szenen · Übergänge",
      },
      {
        pct: score?.leseflussPct ?? 0,
        min: GERUEST_MANUSKRIPT_AXIS_MIN_PCT,
        label: "Szenen · Abdeckung",
      },
    ]),
  );
  findings.push(
    ...mapIssues(
      auditGeruestPlotClaims(structured.chapters).filter(
        (i) => i.severity === "error",
      ),
    ),
  );
  return findings;
}

function evaluateSchreiben(editorial: RomanEditorial): StageHardGateFinding[] {
  const findings: StageHardGateFinding[] = [];
  if (!hasFilledManuskript(editorial.manuskriptText ?? "")) {
    findings.push({
      severity: "error",
      code: "manuskript_missing",
      message: "Manuskript fehlt.",
    });
    return findings;
  }
  if (!isManuskriptFreigabeReadyForRoman(editorial)) {
    const hard = hardManuskriptFreigabeFindings(
      editorial.manuskriptFreigabe?.findings,
    );
    if (!editorial.manuskriptFreigabe?.checkedAt) {
      findings.push({
        severity: "error",
        code: "freigabe_missing",
        message: "Manuskript-Freigabe fehlt (Seam/Canon/Timeline/Plot-Wahrheit).",
      });
    } else if (hard.length) {
      findings.push({
        severity: "error",
        code: "freigabe_hard",
        message: `${hard.length} harte Freigabe-Hinweis(e) offen.`,
      });
    } else {
      findings.push({
        severity: "error",
        code: "freigabe_stale",
        message: "Freigabe veraltet — Manuskript geändert seit dem Check.",
      });
    }
  }
  return findings;
}

function gateKeyForStage(stage: string): StageGateKey | null {
  const n = normalizePipelineStage(stage) ?? stage;
  if (n === "idee") return "idee";
  if (n === "basics" || n === "typ" || n === "rahmen") return "rahmen";
  if (n === "fundament" || n === "charaktere" || n === "welt") return "fundament";
  if (n === "expose" || n === "spec") return "expose";
  if (n === "graph") return "graph";
  if (isGeruestStage(n) || n === "plot") return "plot";
  if (isPlotStage(n) || n === "szenen") return "szenen";
  if (n === "manuskript") return "schreiben";
  return null;
}

/**
 * Evaluate hard gate for a completed stage (before leaving it / starting next).
 * Pass `tonalitaet` / `genre` from `roman_kontext` for the Basics gate.
 */
export function evaluateStageHardGate(input: {
  stage: PipelineStage | StageGateKey | string;
  editorial: RomanEditorial;
  tonalitaet?: string | null;
  genre?: string | null;
}): StageHardGateResult {
  const key = gateKeyForStage(input.stage) ?? (input.stage as StageGateKey);
  let findings: StageHardGateFinding[] = [];
  if (key === "idee") findings = evaluateIdee(input.editorial);
  else if (key === "basics" || key === "rahmen")
    findings = evaluateBasicsGate({
      editorial: input.editorial,
      tonalitaet: input.tonalitaet,
      genre: input.genre,
    });
  else if (key === "fundament")
    findings = evaluateFundament(input.editorial, input);
  else if (key === "spec" || key === "expose")
    findings = evaluateSpec(input.editorial);
  else if (key === "graph") findings = evaluateGraph(input.editorial);
  else if (key === "plot" || key === "feingeruest")
    findings = evaluatePlotGeruest(input.editorial);
  else if (key === "szenen" || key === "feinplot")
    findings = evaluateFeinplot(input.editorial);
  else if (key === "schreiben") findings = evaluateSchreiben(input.editorial);
  else {
    findings = [
      {
        severity: "warning",
        code: "unknown_stage",
        message: `Kein Hard-Gate für Stufe „${input.stage}“.`,
      },
    ];
  }

  const errors = findings.filter((f) => f.severity === "error");
  const viaOverride =
    errors.length > 0 &&
    GATE_KEYS.includes(key as StageGateKey) &&
    hasStageGateOverride(input.editorial, key as StageGateKey);
  const ok = errors.length === 0 || viaOverride;
  const summary = ok
    ? viaOverride
      ? `Gate ${key} mit Override (${errors.length} Fehler übersprungen).`
      : `Gate ${key} grün.`
    : `Gate ${key} rot: ${errors
        .slice(0, 4)
        .map((e) => e.message)
        .join(" · ")}`;

  return {
    stage: key,
    ok,
    viaOverride,
    findings,
    summary,
  };
}

/**
 * Prerequisite gate for starting `nextStage` (previous must be green).
 * Flow: Idee → Rahmen → Fundament → Exposé → Graph → Plot → Szenen → Manuskript.
 * Author freigabe is checked separately in producers.
 */
export function evaluatePrerequisiteGate(input: {
  nextStage: PipelineStage | string;
  editorial: RomanEditorial;
  tonalitaet?: string | null;
  genre?: string | null;
}): StageHardGateResult | null {
  const next = normalizePipelineStage(input.nextStage) ?? input.nextStage;
  let prev: StageGateKey | null = null;
  if (next === "rahmen" || next === "basics" || next === "typ") {
    prev = "idee";
  } else if (next === "fundament" || next === "charaktere" || next === "welt") {
    prev = "rahmen";
  } else if (next === "expose" || next === "spec") {
    prev = "fundament";
  } else if (next === "graph") {
    prev = "expose";
  } else if (isGeruestStage(next) || next === "plot") {
    prev = "graph";
  } else if (isPlotStage(next) || next === "szenen") {
    prev = "plot";
  } else if (next === "manuskript") {
    prev = "szenen";
  } else {
    return null;
  }
  return evaluateStageHardGate({
    stage: prev,
    editorial: input.editorial,
    tonalitaet: input.tonalitaet,
    genre: input.genre,
  });
}

/** Throw if prerequisite gate is red (for Erzeugen producers). */
export function assertPrerequisiteHardGate(input: {
  nextStage: PipelineStage | string;
  editorial: RomanEditorial;
  tonalitaet?: string | null;
  genre?: string | null;
}): void {
  const gate = evaluatePrerequisiteGate(input);
  if (!gate || gate.ok) return;
  const detail = gate.findings
    .filter((f) => f.severity === "error")
    .slice(0, 6)
    .map((e) => `• ${e.message}`)
    .join("\n");
  throw new Error(
    `Vorstufe blockiert „${input.nextStage}“ — Hard-Gate nicht grün:\n${detail}\n\nBitte Vorstufe reparieren (Auto-Repair bei Erzeugen) oder „Trotzdem weiter“ (Override).`,
  );
}

/** Throw if this stage itself is red after Erzeugen (no fertig bypass). */
export function assertStageHardGateGreen(input: {
  stage: PipelineStage | string;
  editorial: RomanEditorial;
  tonalitaet?: string | null;
  genre?: string | null;
}): void {
  const gate = evaluateStageHardGate(input);
  if (gate.ok) return;
  const detail = gate.findings
    .filter((f) => f.severity === "error")
    .slice(0, 8)
    .map((e) => `• ${e.message}`)
    .join("\n");
  throw new Error(
    `${gate.summary}\n${detail}\n\nAuto-Repair konnte nicht alles schließen — bitte Findings beheben oder Override „Trotzdem weiter“.`,
  );
}

/** Stages that run internal Logik auto-repair after Erzeugen. */
export function stageUsesAutoLogikRepair(stage: PipelineStage | string): boolean {
  const n = normalizePipelineStage(stage) ?? stage;
  return isGeruestStage(n) || isPlotStage(n) || n === "graph";
}
