/**
 * Author freigabe / phase lifecycle for the Roman work system.
 * Hard-gates remain quality checks; {@link PhaseStatus} `approved` is canon.
 * Upstream edits mark downstream as `stale` — no silent overwrite of approved art.
 */

import type { RomanEditorial } from "@/lib/roman/editorial";
import {
  normalizePipelineStage,
  PROCESS_PHASES,
  PROCESS_PHASE_LABELS,
  processPhasesAfter,
  type PipelineStage,
  type ProcessPhase,
} from "@/lib/roman/pipeline/stages";

export const PHASE_STATUSES = [
  "draft",
  "review",
  "revision",
  "approved",
  "stale",
] as const;

export type PhaseStatus = (typeof PHASE_STATUSES)[number];

export type PhaseOpenDecision = {
  id: string;
  summary: string;
  options?: string[];
};

export type PhaseContradiction = {
  id: string;
  summary: string;
  sourceIds?: string[];
};

/** Per-phase lifecycle row stored on `editorial.phaseState`. */
export type PhaseStateEntry = {
  status: PhaseStatus;
  approvedAt?: string | null;
  fingerprint?: string | null;
  openDecisions?: PhaseOpenDecision[];
  contradictions?: PhaseContradiction[];
  /** Soft note when marked stale (which upstream triggered). */
  staleReason?: string | null;
};

export type RomanPhaseState = Partial<Record<ProcessPhase, PhaseStateEntry>>;

/** Provenance for user import / coach turns (MVP). */
export type RomanSourceRef = {
  id: string;
  kind: "import" | "coach" | "author" | "ki";
  label: string;
  excerpt?: string;
  createdAt: string;
};

function clampStatus(raw: unknown): PhaseStatus {
  const s = String(raw ?? "").trim();
  if ((PHASE_STATUSES as readonly string[]).includes(s)) {
    return s as PhaseStatus;
  }
  return "draft";
}

export function emptyPhaseStateEntry(): PhaseStateEntry {
  return { status: "draft" };
}

/** Map any stage/tab id onto a ProcessPhase when possible. */
export function normalizeProcessPhase(
  raw: string | null | undefined,
): ProcessPhase | null {
  const s = (raw ?? "").trim();
  if (!s) return null;
  if ((PROCESS_PHASES as readonly string[]).includes(s)) {
    return s as ProcessPhase;
  }
  const aliases: Record<string, ProcessPhase> = {
    typ: "rahmen",
    basics: "rahmen",
    charaktere: "fundament",
    welt: "fundament",
    spec: "expose",
    feingeruest: "plot",
    kapitelgeruest: "plot",
    grobgeruest: "plot",
    feinplot: "szenen",
    szenenplot: "szenen",
    grobplot: "szenen",
    schreiben: "manuskript",
    lektorat: "lektorat",
    export: "export",
    cover: "export",
    marketing: "export",
    hoerbuch: "export",
    wissensgraph: "graph",
  };
  return aliases[s] ?? null;
}

export function parsePhaseState(raw: unknown): RomanPhaseState {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: RomanPhaseState = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const phase = normalizeProcessPhase(key);
    if (!phase || !value || typeof value !== "object" || Array.isArray(value)) {
      continue;
    }
    const row = value as Record<string, unknown>;
    const decisions = Array.isArray(row.openDecisions)
      ? row.openDecisions
          .filter((d) => d && typeof d === "object")
          .map((d) => {
            const o = d as Record<string, unknown>;
            return {
              id: String(o.id ?? "").trim().slice(0, 40) || "d",
              summary: String(o.summary ?? "").trim().slice(0, 800),
              options: Array.isArray(o.options)
                ? o.options
                    .map((x) => String(x).trim())
                    .filter(Boolean)
                    .slice(0, 8)
                : undefined,
            };
          })
          .filter((d) => d.summary)
          .slice(0, 24)
      : undefined;
    const contradictions = Array.isArray(row.contradictions)
      ? row.contradictions
          .filter((c) => c && typeof c === "object")
          .map((c) => {
            const o = c as Record<string, unknown>;
            return {
              id: String(o.id ?? "").trim().slice(0, 40) || "c",
              summary: String(o.summary ?? "").trim().slice(0, 800),
              sourceIds: Array.isArray(o.sourceIds)
                ? o.sourceIds
                    .map((x) => String(x).trim())
                    .filter(Boolean)
                    .slice(0, 12)
                : undefined,
            };
          })
          .filter((c) => c.summary)
          .slice(0, 24)
      : undefined;
    out[phase] = {
      status: clampStatus(row.status),
      approvedAt: String(row.approvedAt ?? "").trim() || null,
      fingerprint: String(row.fingerprint ?? "").trim() || null,
      openDecisions: decisions,
      contradictions,
      staleReason: String(row.staleReason ?? "").trim().slice(0, 400) || null,
    };
  }
  return out;
}

export function parseRomanSources(raw: unknown): RomanSourceRef[] {
  if (!Array.isArray(raw)) return [];
  const out: RomanSourceRef[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const id = String(r.id ?? "").trim().slice(0, 64);
    const kind = String(r.kind ?? "").trim();
    const label = String(r.label ?? "").trim().slice(0, 200);
    if (!id || !label) continue;
    if (!["import", "coach", "author", "ki"].includes(kind)) continue;
    out.push({
      id,
      kind: kind as RomanSourceRef["kind"],
      label,
      excerpt: String(r.excerpt ?? "").trim().slice(0, 2_000) || undefined,
      createdAt: String(r.createdAt ?? "").trim() || new Date().toISOString(),
    });
    if (out.length >= 80) break;
  }
  return out;
}

/** Simple stable fingerprint (FNV-1a) for freigabe invalidation. */
export function fingerprintText(parts: Array<string | null | undefined>): string {
  const joined = parts
    .map((p) => (p ?? "").trim().replace(/\s+/g, " "))
    .filter(Boolean)
    .join("\n---\n");
  if (!joined) return "";
  let h = 2166136261;
  for (let i = 0; i < joined.length; i++) {
    h ^= joined.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `f${(h >>> 0).toString(16)}:${joined.length}`;
}

export function getPhaseState(
  editorial: RomanEditorial | null | undefined,
  phase: ProcessPhase,
): PhaseStateEntry {
  return editorial?.phaseState?.[phase] ?? emptyPhaseStateEntry();
}

export function isPhaseApproved(
  editorial: RomanEditorial | null | undefined,
  phase: ProcessPhase,
  currentFingerprint?: string | null,
): boolean {
  const entry = getPhaseState(editorial, phase);
  if (entry.status !== "approved") return false;
  if (currentFingerprint && entry.fingerprint) {
    return entry.fingerprint === currentFingerprint;
  }
  return Boolean(entry.approvedAt);
}

export function withPhaseState(
  editorial: RomanEditorial,
  phase: ProcessPhase,
  entry: PhaseStateEntry | null,
): RomanEditorial {
  const next: RomanPhaseState = { ...(editorial.phaseState ?? {}) };
  if (!entry) delete next[phase];
  else next[phase] = entry;
  return { ...editorial, phaseState: next };
}

/**
 * Author freigabe: sets approved + fingerprint. Does not clear hard-gate findings.
 */
export function approvePhase(
  editorial: RomanEditorial,
  phase: ProcessPhase,
  fingerprint: string,
): RomanEditorial {
  return withPhaseState(editorial, phase, {
    ...getPhaseState(editorial, phase),
    status: "approved",
    approvedAt: new Date().toISOString(),
    fingerprint: fingerprint || null,
    staleReason: null,
  });
}

/** Revoke freigabe back to draft (author choice). */
export function revokePhaseApproval(
  editorial: RomanEditorial,
  phase: ProcessPhase,
): RomanEditorial {
  const prev = getPhaseState(editorial, phase);
  return withPhaseState(editorial, phase, {
    ...prev,
    status: "draft",
    approvedAt: null,
    fingerprint: null,
    staleReason: null,
  });
}

/**
 * Content of an already-progressed phase changed (Verbessern / Patch).
 * Marks that phase `stale` so Freigabe must be renewed — does not wipe
 * artifacts and does not touch other phases (use {@link markDownstreamPhasesStale}
 * / softInvalidate for downstream).
 */
export function markPhaseContentChanged(
  editorial: RomanEditorial,
  phase: ProcessPhase,
  reason?: string,
): RomanEditorial {
  const prev = getPhaseState(editorial, phase);
  if (prev.status === "draft" && !prev.approvedAt && !prev.fingerprint) {
    return editorial;
  }
  return withPhaseState(editorial, phase, {
    ...prev,
    status: "stale",
    staleReason: (reason ?? `„${PROCESS_PHASE_LABELS[phase] ?? phase}“ aktualisiert`).slice(
      0,
      400,
    ),
  });
}

/**
 * Mark all stages after `changed` as stale when they had progress.
 * Does not wipe content.
 */
export function markDownstreamPhasesStale(
  editorial: RomanEditorial,
  changed: PipelineStage | ProcessPhase | string,
  reason?: string,
): RomanEditorial {
  const phase =
    normalizeProcessPhase(changed) ??
    normalizePipelineStage(changed) ??
    null;
  if (!phase) return editorial;
  const downstream = processPhasesAfter(phase);
  if (downstream.length === 0) return editorial;
  let next = editorial;
  const note = (reason ?? `Upstream „${PROCESS_PHASE_LABELS[phase] ?? phase}“ geändert`).slice(
    0,
    400,
  );
  for (const p of downstream) {
    const prev = getPhaseState(next, p);
    if (prev.status === "draft" && !prev.approvedAt && !prev.fingerprint) {
      continue;
    }
    next = withPhaseState(next, p, {
      ...prev,
      status: "stale",
      staleReason: note,
    });
  }
  return next;
}

export function assertPhaseApprovedForDownstream(input: {
  editorial: RomanEditorial;
  phase: ProcessPhase;
  fingerprint?: string | null;
  label?: string;
}): void {
  if (isPhaseApproved(input.editorial, input.phase, input.fingerprint)) return;
  const label = input.label ?? PROCESS_PHASE_LABELS[input.phase] ?? input.phase;
  throw new Error(
    `Phase „${label}“ ist nicht freigegeben (oder Fingerprint veraltet). Bitte prüfen und freigeben — KI-Entwurf ist kein Kanon.`,
  );
}

export function ensurePhaseStateDefaults(
  editorial: RomanEditorial,
): RomanEditorial {
  const next: RomanPhaseState = { ...(editorial.phaseState ?? {}) };
  let changed = false;
  for (const phase of PROCESS_PHASES) {
    if (!next[phase]) {
      next[phase] = emptyPhaseStateEntry();
      changed = true;
    }
  }
  return changed ? { ...editorial, phaseState: next } : editorial;
}

export function allStalePhases(
  editorial: RomanEditorial | null | undefined,
): ProcessPhase[] {
  if (!editorial?.phaseState) return [];
  return PROCESS_PHASES.filter(
    (p) => editorial.phaseState?.[p]?.status === "stale",
  );
}

export { PROCESS_PHASE_LABELS };
