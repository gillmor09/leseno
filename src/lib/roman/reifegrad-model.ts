/**
 * Reifegrad model: scores, labels, parse — no AI / editorial imports.
 *
 * Four equal dimensions: Logik + three stage-specific craft axes.
 * `regelnPct` stores Logik (legacy field name). Bedürfnis-Felder bleiben in
 * JSON für Kompatibilität, zählen aber nicht mehr zum Gesamt (immer 0 bei Neu-Assess).
 */

import {
  PIPELINE_STAGES,
  PIPELINE_STAGE_LABELS,
  type PipelineStage,
} from "@/lib/roman/pipeline/stages";
import {
  STAGE_CRAFT_DIMENSIONS,
} from "@/lib/roman/reifegrad-craft";

export type ReifegradErfuellung =
  | "nicht_erfuellt"
  | "teilweise"
  | "erfuellt";

export type ReifegradFreigabe =
  | "keine_freigabe"
  | "freigabe_bedenken"
  | "freigabe";

export type StageReifegrad = {
  /** Logik / Kontinuität 0–100 (legacy key name `regelnPct`). */
  regelnPct: number;
  /** Deprecated — kept for JSON; not scored in Gesamt. */
  erfuelltesBeduerfnisPct: number;
  /** Deprecated — kept for JSON; not scored in Gesamt. */
  vernachlaessigtesBeduerfnisPct: number;
  /** Craft slot A (stage-specific) 0–100. Stored as stilPct for compat. */
  stilPct: number;
  /** Craft slot B (stage-specific) 0–100. */
  dramaturgiePct: number;
  /** Craft slot C (stage-specific) 0–100. */
  leseflussPct: number;
  /** Unweighted mean of Logik + 3 craft axes. */
  gesamtPct: number;
  /** Logik status (legacy key `regelnStatus`). */
  regelnStatus: ReifegradErfuellung;
  erfuelltesBeduerfnisStatus: ReifegradErfuellung;
  vernachlaessigtesBeduerfnisStatus: ReifegradErfuellung;
  stilStatus: ReifegradErfuellung;
  dramaturgieStatus: ReifegradErfuellung;
  leseflussStatus: ReifegradErfuellung;
  freigabe: ReifegradFreigabe;
  assessedAt: string;
  modelLabel: string;
};

export type RomanReifegrade = Partial<Record<PipelineStage, StageReifegrad>>;

export const REIFEGRAD_ERFUELLUNG_LABEL: Record<ReifegradErfuellung, string> = {
  nicht_erfuellt: "Nicht erfüllt",
  teilweise: "Teilweise erfüllt",
  erfuellt: "Erfüllt",
};

export const REIFEGRAD_FREIGABE_LABEL: Record<ReifegradFreigabe, string> = {
  keine_freigabe: "Noch schwach",
  freigabe_bedenken: "Mit Bedenken",
  freigabe: "Stark genug",
};

/**
 * Upstream-Patch-Schwellen (Gesamt-Reifegrad):
 * ≥80 ≈ Freigabe → nur bei kritischen Findings;
 * ≥90 → nur bei kritischem Upstream-Mangel.
 */
export const REIFEGRAD_UPSTREAM_SOFT_PCT = 80;
export const REIFEGRAD_UPSTREAM_HARD_PCT = 90;

/** Compact Reifegrad lines for the pipeline router prompt. */
export function formatReifegradeForRouter(
  reifegrade: RomanReifegrade | undefined | null,
): string {
  if (!reifegrade) return "(noch keine Reifegrade gemessen)";
  const lines: string[] = [];
  for (const stage of PIPELINE_STAGES) {
    const s = reifegrade[stage];
    if (!s) {
      lines.push(`- ${stage}: noch nicht bewertet`);
      continue;
    }
    const [a, b, c] = STAGE_CRAFT_DIMENSIONS[stage];
    lines.push(
      `- ${PIPELINE_STAGE_LABELS[stage]} (${stage}): Gesamt ${s.gesamtPct}% (${REIFEGRAD_FREIGABE_LABEL[s.freigabe]}) · Logik ${s.regelnPct}% · ${a.label} ${s.stilPct}% · ${b.label} ${s.dramaturgiePct}% · ${c.label} ${s.leseflussPct}%`,
    );
  }
  return lines.join("\n");
}

/**
 * Whether an upstream stage may be patched given its maturity + critique severity.
 */
export function mayPatchUpstreamByReifegrad(input: {
  gesamtPct: number | null | undefined;
  critique: {
    findings: Array<{
      severity: "kritisch" | "wichtig" | "optional";
      severityHint?: "lokal" | "upstream";
    }>;
  };
}): { ok: boolean; detail: string } {
  const pct = input.gesamtPct;
  if (pct == null || !Number.isFinite(pct)) {
    return { ok: true, detail: "kein Reifegrad — Upstream erlaubt" };
  }
  const hasKritisch = input.critique.findings.some(
    (f) => f.severity === "kritisch",
  );
  const hasKritischUpstream = input.critique.findings.some(
    (f) => f.severity === "kritisch" && f.severityHint === "upstream",
  );

  if (pct >= REIFEGRAD_UPSTREAM_HARD_PCT) {
    if (hasKritischUpstream) {
      return {
        ok: true,
        detail: `Reifegrad ${pct}% ≥${REIFEGRAD_UPSTREAM_HARD_PCT} — Ausnahme: kritisch+upstream`,
      };
    }
    return {
      ok: false,
      detail: `Reifegrad ${pct}% ≥${REIFEGRAD_UPSTREAM_HARD_PCT} (quasi freigegeben) — Upstream nur bei extrem wichtigem/kritischem Upstream-Mangel`,
    };
  }

  if (pct >= REIFEGRAD_UPSTREAM_SOFT_PCT) {
    if (hasKritisch) {
      return {
        ok: true,
        detail: `Reifegrad ${pct}% ≥${REIFEGRAD_UPSTREAM_SOFT_PCT} — Ausnahme: severity kritisch`,
      };
    }
    return {
      ok: false,
      detail: `Reifegrad ${pct}% ≥${REIFEGRAD_UPSTREAM_SOFT_PCT} (Freigabe) — Upstream nur bei severity „kritisch“; sonst nur aktueller Schritt`,
    };
  }

  return {
    ok: true,
    detail: `Reifegrad ${pct}% <${REIFEGRAD_UPSTREAM_SOFT_PCT} — Upstream erlaubt`,
  };
}

function clampPct(n: unknown): number {
  const v = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(100, Math.round(v)));
}

/** Map a percent to Erfüllung status. */
export function erfuellungFromPct(pct: number): ReifegradErfuellung {
  if (pct < 40) return "nicht_erfuellt";
  if (pct < 75) return "teilweise";
  return "erfuellt";
}

/** Map overall percent to Freigabe status. */
export function freigabeFromPct(pct: number): ReifegradFreigabe {
  if (pct < 50) return "keine_freigabe";
  if (pct < 80) return "freigabe_bedenken";
  return "freigabe";
}

/**
 * Overall = unweighted mean of Logik + three craft axes.
 * Bedürfnis-Felder werden ignoriert (Marktanalyse wird separat überarbeitet).
 */
export function computeGesamtPct(input: {
  regelnPct: number;
  stilPct: number;
  dramaturgiePct: number;
  leseflussPct: number;
  /** @deprecated ignored */
  erfuelltesBeduerfnisPct?: number;
  /** @deprecated ignored */
  vernachlaessigtesBeduerfnisPct?: number;
  /** When set, reserved for future stage-specific averaging; currently always 4. */
  stage?: PipelineStage;
}): number {
  const raw =
    (input.regelnPct +
      input.stilPct +
      input.dramaturgiePct +
      input.leseflussPct) /
    4;
  return clampPct(raw);
}

export function buildStageReifegrad(input: {
  regelnPct: number;
  erfuelltesBeduerfnisPct: number;
  vernachlaessigtesBeduerfnisPct: number;
  stilPct: number;
  dramaturgiePct: number;
  leseflussPct: number;
  modelLabel: string;
  assessedAt?: string;
  stage?: PipelineStage;
}): StageReifegrad {
  const regelnPct = clampPct(input.regelnPct);
  const erfuelltesBeduerfnisPct = clampPct(input.erfuelltesBeduerfnisPct);
  const vernachlaessigtesBeduerfnisPct = clampPct(
    input.vernachlaessigtesBeduerfnisPct,
  );
  const stilPct = clampPct(input.stilPct);
  const dramaturgiePct = clampPct(input.dramaturgiePct);
  const leseflussPct = clampPct(input.leseflussPct);
  const gesamtPct = computeGesamtPct({
    regelnPct,
    stilPct,
    dramaturgiePct,
    leseflussPct,
    stage: input.stage,
  });
  return {
    regelnPct,
    erfuelltesBeduerfnisPct,
    vernachlaessigtesBeduerfnisPct,
    stilPct,
    dramaturgiePct,
    leseflussPct,
    gesamtPct,
    regelnStatus: erfuellungFromPct(regelnPct),
    erfuelltesBeduerfnisStatus: erfuellungFromPct(erfuelltesBeduerfnisPct),
    vernachlaessigtesBeduerfnisStatus: erfuellungFromPct(
      vernachlaessigtesBeduerfnisPct,
    ),
    stilStatus: erfuellungFromPct(stilPct),
    dramaturgieStatus: erfuellungFromPct(dramaturgiePct),
    leseflussStatus: erfuellungFromPct(leseflussPct),
    freigabe: freigabeFromPct(gesamtPct),
    assessedAt: input.assessedAt ?? new Date().toISOString(),
    modelLabel: input.modelLabel.slice(0, 120),
  };
}

function parseOneReifegrad(raw: unknown): StageReifegrad | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const regelnPct = clampPct(row.regelnPct);
  const erfuelltesBeduerfnisPct = clampPct(row.erfuelltesBeduerfnisPct);
  const vernachlaessigtesBeduerfnisPct = clampPct(
    row.vernachlaessigtesBeduerfnisPct,
  );
  // Legacy 3-dim records: provisional craft scores from the mean of the old three.
  const hasCraft =
    row.stilPct != null ||
    row.dramaturgiePct != null ||
    row.leseflussPct != null;
  const legacyMean = clampPct(
    (regelnPct + erfuelltesBeduerfnisPct + vernachlaessigtesBeduerfnisPct) / 3,
  );
  return buildStageReifegrad({
    regelnPct,
    erfuelltesBeduerfnisPct,
    vernachlaessigtesBeduerfnisPct,
    stilPct: hasCraft ? clampPct(row.stilPct) : legacyMean,
    dramaturgiePct: hasCraft ? clampPct(row.dramaturgiePct) : legacyMean,
    leseflussPct: hasCraft ? clampPct(row.leseflussPct) : legacyMean,
    modelLabel: String(row.modelLabel ?? "").trim() || "—",
    assessedAt:
      typeof row.assessedAt === "string" && row.assessedAt.trim()
        ? row.assessedAt
        : new Date().toISOString(),
  });
}

export function parseRomanReifegrade(raw: unknown): RomanReifegrade {
  if (!raw || typeof raw !== "object") return {};
  const out: RomanReifegrade = {};
  const row = raw as Record<string, unknown>;
  for (const stage of PIPELINE_STAGES) {
    const parsed = parseOneReifegrad(row[stage]);
    if (parsed) out[stage] = parsed;
  }
  return out;
}

export function emptyRomanReifegrade(): RomanReifegrade {
  return {};
}

/** Drop maturity for cleared downstream stages. */
export function clearReifegradeForStages(
  current: RomanReifegrade | undefined,
  stages: PipelineStage[],
): RomanReifegrade {
  if (!current || stages.length === 0) return current ?? {};
  const next = { ...current };
  for (const s of stages) {
    delete next[s];
  }
  return next;
}

export function withStageReifegrad<
  T extends { reifegrade?: RomanReifegrade },
>(editorial: T, stage: PipelineStage, score: StageReifegrad): T {
  return {
    ...editorial,
    reifegrade: {
      ...(editorial.reifegrade ?? {}),
      [stage]: score,
    },
  };
}
