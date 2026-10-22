/**
 * Who-did-X / causal consistency for Kapitelgerüst + Szenenplot (before Manuskript).
 * Deterministic extract from events/kernsatz/inhalt — hard preflight when
 * the same Tat is pinned to different actors (Absicherung: Behrens vs Tobias).
 */

import {
  findClaimActorConflicts,
  parsePlotClaimsFromLedger,
  type PlotClaim,
} from "@/lib/roman/manuskript-plot-truth";

/** Same shape as SzenenplotPreflightIssue — kept local to avoid import cycles. */
export type GeruestPlotClaimIssue = {
  severity: "error" | "warning";
  code: string;
  message: string;
};

const CAUSAL_RE =
  /\b(manipul\w*|verfälsch\w*|fälsch\w*|lüg\w*|belüg\w*|verrat\w*|sabotier\w*|bestech\w*|erpress\w*|hintergeh\w*|täusch\w*|gesteh\w*|schuldig|täter|verursach\w*|hat\s+\w+\s+getan)\b/i;

/** German proper-name-ish tokens (Frau X, Dr. X, Firstname Capitalized). */
const ACTOR_RE =
  /\b(?:(?:Frau|Herr|Dr\.|Doktor)\s+)?([A-ZÄÖÜ][a-zäöüß]{2,}(?:\s+[A-ZÄÖÜ][a-zäöüß]{2,})?)\b/g;

const SKIP_ACTORS = new Set([
  "Kapitel",
  "Szene",
  "Montag",
  "Dienstag",
  "Mittwoch",
  "Donnerstag",
  "Freitag",
  "Samstag",
  "Sonntag",
  "Januar",
  "Februar",
  "März",
  "April",
  "Mai",
  "Juni",
  "Juli",
  "August",
  "September",
  "Oktober",
  "November",
  "Dezember",
  "Auto",
  "Haus",
  "Schule",
  "Keller",
  "Garage",
  "Versicherung",
  "Polizei",
  "Mutter",
  "Vater",
  "Sohn",
  "Tochter",
  "Erzähler",
]);

export type GeruestChapterClaimSource = {
  number: number;
  title?: string;
  kernsatz?: string;
  inhaltKurz?: string;
  events?: string[];
  introduces?: string[];
  resolves?: string[];
  scenes?: Array<{
    summary?: string;
    schreibPrompt?: string;
    dramaturgy?: { scene_goal?: string; outcome_value_change?: string };
  }>;
};

function actionKey(text: string): string {
  const m = text.match(CAUSAL_RE);
  if (!m?.[1]) return "tat";
  return m[1].toLowerCase().replace(/(en|t|te|ten|ung)$/i, "").slice(0, 24);
}

function extractActors(line: string): string[] {
  const out: string[] = [];
  ACTOR_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = ACTOR_RE.exec(line)) !== null) {
    const full = m[0]!.replace(/\s+/g, " ").trim();
    const core = (m[1] ?? full).trim();
    if (SKIP_ACTORS.has(core) || SKIP_ACTORS.has(full.split(/\s+/)[0]!)) continue;
    if (core.length < 3) continue;
    out.push(full);
    if (out.length >= 4) break;
  }
  return out;
}

function linesFromChapter(ch: GeruestChapterClaimSource): string[] {
  const lines: string[] = [];
  if (ch.kernsatz?.trim()) lines.push(ch.kernsatz.trim());
  if (ch.inhaltKurz?.trim()) {
    for (const p of ch.inhaltKurz.split(/\n+/)) {
      if (p.trim().length >= 12) lines.push(p.trim());
    }
  }
  for (const e of ch.events ?? []) {
    if (e.trim().length >= 8) lines.push(e.trim());
  }
  for (const e of ch.introduces ?? []) {
    if (e.trim().length >= 8) lines.push(e.trim());
  }
  for (const e of ch.resolves ?? []) {
    if (e.trim().length >= 8) lines.push(e.trim());
  }
  for (const s of ch.scenes ?? []) {
    for (const bit of [
      s.summary,
      s.schreibPrompt,
      s.dramaturgy?.scene_goal,
      s.dramaturgy?.outcome_value_change,
    ]) {
      if (bit && bit.trim().length >= 12) lines.push(bit.trim().slice(0, 240));
    }
  }
  return lines;
}

/**
 * Extract Who-did-X claims from Gerüst/Plot chapter fields (no LLM).
 * Prefers explicit `CLAIM:` lines; else causal verb + actor near it.
 */
export function extractClaimsFromGeruestChapters(
  chapters: GeruestChapterClaimSource[],
): PlotClaim[] {
  const claims: PlotClaim[] = [];
  const seen = new Set<string>();

  for (const ch of chapters) {
    for (const line of linesFromChapter(ch)) {
      const explicit = parsePlotClaimsFromLedger([line]);
      for (const c of explicit) {
        const key = `${ch.number}|${c.actor}|${c.action}|${c.object}`;
        if (seen.has(key)) continue;
        seen.add(key);
        claims.push({ ...c, chapter: ch.number });
      }
      if (explicit.length) continue;

      if (!CAUSAL_RE.test(line)) continue;
      const actors = extractActors(line);
      if (!actors.length) continue;
      const action = actionKey(line);
      const object = line.slice(0, 80).replace(/\s+/g, " ");
      // First actor in the line is the attributed doer (heuristic).
      const actor = actors[0]!;
      const key = `${ch.number}|${actor.toLowerCase()}|${action}`;
      if (seen.has(key)) continue;
      seen.add(key);
      claims.push({
        actor,
        action,
        object,
        chapter: ch.number,
      });
    }
  }
  return claims;
}

/** hardInvariant lines for Wissensgraph seed. */
export function formatGeruestClaimsAsInvariants(claims: PlotClaim[]): string[] {
  return claims.slice(0, 24).map(
    (c) =>
      `CLAIM: ${c.actor}|${c.action}|${c.object.slice(0, 60)} — Kap. ${c.chapter}`,
  );
}

/**
 * Hard preflight issues when the same causal action is pinned to different actors.
 */
export function auditGeruestPlotClaims(
  chapters: GeruestChapterClaimSource[],
): GeruestPlotClaimIssue[] {
  const claims = extractClaimsFromGeruestChapters(chapters);
  const conflicts = findClaimActorConflicts(claims);
  const issues: GeruestPlotClaimIssue[] = [];

  for (const c of conflicts) {
    const caps = c.chapterNumbers.length
      ? `Kap. ${c.chapterNumbers.join(", ")}`
      : "mehrere Kapitel";
    issues.push({
      severity: "error",
      code: "plot_claim_conflict",
      message: `Who-did-X-Widerspruch im Gerüst/Plot (${caps}): ${c.summary} — vor Manuskript im Gerüst klären (eine Wahrheit, Verdacht vs. Tatsache trennen).`,
    });
  }

  // Soft: causal beat without any actor (orphan blame)
  let orphanCausal = 0;
  for (const ch of chapters) {
    for (const line of linesFromChapter(ch)) {
      if (!CAUSAL_RE.test(line)) continue;
      if (parsePlotClaimsFromLedger([line]).length) continue;
      if (extractActors(line).length === 0) orphanCausal += 1;
    }
  }
  if (orphanCausal >= 2) {
    issues.push({
      severity: "warning",
      code: "plot_claim_orphan",
      message: `${orphanCausal} kausale Events ohne klaren Akteur — Who-did-X später im Manuskript driftet. Akteur in events/kernsatz benennen oder CLAIM: setzen.`,
    });
  }

  return issues;
}

/** Prompt block for Stage Verbessern Nur Logik (Gerüst/Plot). */
export function formatGeruestPlotClaimCritiqueBlock(
  chapters: GeruestChapterClaimSource[],
): string {
  const issues = auditGeruestPlotClaims(chapters);
  if (!issues.length) return "";
  return `# Deterministische Who-did-X-Prüfung (Gerüst/Plot)
${issues.map((i) => `- [${i.severity}] ${i.message}`).join("\n")}
Härteste Widersprüche zuerst als aenderungsPrompts (kritisch) — eine Canon-Wahrheit, Verdacht klar als Verdacht markieren.`;
}
