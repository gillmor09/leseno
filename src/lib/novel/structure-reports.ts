/**
 * Persisted structure-audit scores per pyramid level (acts / chapters / manifests).
 * Stored on `novel.state_matrix.__structureReports` for Skelett-UI + retries.
 */

import {
  structureNoteToString,
  type SkeletonStructureLevel,
} from "@/lib/novel/tree-schemas";
import type { NovelBundle } from "@/lib/novel/types";

export const STRUCTURE_REPORTS_KEY = "__structureReports";

export type StructureLevelReport = {
  passed: boolean;
  /** Craft score 1–10 from the structure auditor. */
  score: number;
  issues: string[];
  changeOrders: string[];
  updatedAt: string;
};

export type StructureReports = Partial<
  Record<SkeletonStructureLevel, StructureLevelReport>
>;

function clipScore(n: unknown): number {
  const x = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(x)) return 5;
  return Math.max(1, Math.min(10, Math.round(x)));
}

export function parseStructureLevelReport(
  raw: unknown,
): StructureLevelReport | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const issues = Array.isArray(o.issues)
    ? o.issues.map((x) => structureNoteToString(x)).filter(Boolean).slice(0, 8)
    : [];
  const changeOrders = Array.isArray(o.changeOrders)
    ? o.changeOrders
        .map((x) => structureNoteToString(x))
        .filter(Boolean)
        .slice(0, 6)
    : [];
  return {
    passed: Boolean(o.passed),
    score: clipScore(o.score),
    issues,
    changeOrders,
    updatedAt: typeof o.updatedAt === "string" ? o.updatedAt : "",
  };
}

export function getStructureReports(
  bundle: NovelBundle | null | undefined,
): StructureReports {
  const raw = bundle?.novel.stateMatrix?.[STRUCTURE_REPORTS_KEY];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const o = raw as Record<string, unknown>;
  const out: StructureReports = {};
  for (const level of ["acts", "chapters", "manifests"] as const) {
    const r = parseStructureLevelReport(o[level]);
    if (r) out[level] = r;
  }
  return out;
}

/** Merge one level into state_matrix entity without wiping siblings. */
export function stateMatrixWithStructureReport(
  matrix: Record<string, unknown>,
  level: SkeletonStructureLevel,
  report: StructureLevelReport,
): Record<string, unknown> {
  const prev = matrix[STRUCTURE_REPORTS_KEY];
  const base =
    prev && typeof prev === "object" && !Array.isArray(prev)
      ? { ...(prev as Record<string, unknown>) }
      : {};
  return {
    ...matrix,
    [STRUCTURE_REPORTS_KEY]: {
      ...base,
      [level]: {
        ...report,
        updatedAt: report.updatedAt || new Date().toISOString(),
      },
    },
  };
}

export const STRUCTURE_LEVEL_LABELS: Record<SkeletonStructureLevel, string> = {
  acts: "Akte",
  chapters: "Kapitel",
  manifests: "Szenen / Manifeste",
};
