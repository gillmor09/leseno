/**
 * Cross-chapter plot-truth (who-did-X) audit for Freigabe + post-draft gates.
 * Claim ledger lives on storyState.hardFacts (`CLAIM: actor|action|object`) and
 * graph hardInvariants. Contradictions → hard Freigabe findings (HITL), not
 * silent string replace.
 */

import { generateText } from "@/lib/ai/provider";
import { parseModelJsonObject } from "@/lib/ai/parse-model-json";
import { resolveRomanAssistModel } from "@/lib/roman/assist-model";
import type { RomanStoryState, RomanWissensGraph } from "@/lib/roman/editorial";
import { parsePlotChapters, type PlotChapter } from "@/lib/roman/plot-chapters";

export type PlotClaim = {
  actor: string;
  action: string;
  object: string;
  chapter: number;
};

export type PlotTruthFinding = {
  kind: "plot_truth";
  chapterNumbers: number[];
  summary: string;
  /** Optional rival actors for continuity token-safe hints. */
  actors?: string[];
};

const CLAIM_RE =
  /^CLAIM:\s*([^|]+)\|([^|]+)\|([^|]+)\s*$/i;

/** Parse CLAIM lines from hardFacts / hardInvariants. */
export function parsePlotClaimsFromLedger(lines: string[]): PlotClaim[] {
  const out: PlotClaim[] = [];
  for (const line of lines) {
    const m = line.trim().match(CLAIM_RE);
    if (!m) continue;
    const actor = m[1]!.trim().slice(0, 80);
    const action = m[2]!.trim().slice(0, 120);
    const object = m[3]!.trim().slice(0, 120);
    if (!actor || !action) continue;
    out.push({ actor, action, object, chapter: 0 });
  }
  return out;
}

/**
 * Deterministic conflict: same action+object attributed to different actors.
 */
export function findClaimActorConflicts(claims: PlotClaim[]): PlotTruthFinding[] {
  const byKey = new Map<string, PlotClaim[]>();
  for (const c of claims) {
    const key = `${c.action.toLowerCase()}|${c.object.toLowerCase()}`;
    const list = byKey.get(key) ?? [];
    list.push(c);
    byKey.set(key, list);
  }
  const findings: PlotTruthFinding[] = [];
  for (const [, list] of byKey) {
    const actors = [
      ...new Set(list.map((c) => c.actor.trim()).filter(Boolean)),
    ];
    if (actors.length < 2) continue;
    const chapters = [
      ...new Set(list.map((c) => c.chapter).filter((n) => n >= 1)),
    ].sort((a, b) => a - b);
    findings.push({
      kind: "plot_truth",
      chapterNumbers: chapters.length ? chapters.slice(0, 6) : [1],
      summary: `Widerspruch Who-did-X: „${list[0]!.action}“ / „${list[0]!.object}“ — Akteure ${actors.join(" vs. ")}.`,
      actors,
    });
    if (findings.length >= 5) break;
  }
  return findings;
}

function clip(s: string, max: number): string {
  const t = s.replace(/\r\n/g, "\n").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max).trim()}…`;
}

function buildChapterSamples(chapters: PlotChapter[], maxChapters = 12): string {
  const pick = chapters.slice(0, maxChapters);
  return pick
    .map(
      (c) =>
        `### Kap.${c.number} — ${c.title.trim() || "—"}\n${clip(c.body, 900)}`,
    )
    .join("\n\n")
    .slice(0, 22_000);
}

/**
 * Assist audit: actor/event contradictions across chapters (Absicherung: Behrens vs Tobias).
 */
export async function auditManuskriptPlotTruth(input: {
  manuskriptText: string;
  storyState?: RomanStoryState | null;
  wissensGraph?: RomanWissensGraph | null;
  strict?: boolean;
}): Promise<PlotTruthFinding[]> {
  const chapters = parsePlotChapters(input.manuskriptText).filter((c) =>
    c.body.trim(),
  );
  if (chapters.length < 2) return [];

  const ledgerClaims = [
    ...parsePlotClaimsFromLedger(input.storyState?.hardFacts ?? []),
    ...parsePlotClaimsFromLedger(input.wissensGraph?.hardInvariants ?? []),
  ];
  const deterministic = findClaimActorConflicts(ledgerClaims);

  try {
    const model = await resolveRomanAssistModel();
    let raw = "";
    let lastErr: unknown;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        raw = (
          await generateText({
            model,
            systemInstruction: `Du prüfst Plot-Wahrheit (Who-did-X) über Kapitel hinweg.
Finde NUR klare Widersprüche: dieselbe Tat/Manipulation/Entscheidung wird verschiedenen Akteuren zugeschrieben, oder ein Kapitel behauptet X habe Y getan und ein anderes das Gegenteil.
Keine Stil-/Humor-/Namens-Aliasse. Max. 5 findings.
JSON: {"findings":[{"kind":"plot_truth","chapterNumbers":[1,3],"summary":"…","actors":["A","B"]}]}
Wenn keine klaren Widersprüche: leeres Array.`,
            userText: `# Ledger-Claims (falls vorhanden)
${
  ledgerClaims.length
    ? ledgerClaims
        .slice(0, 20)
        .map((c) => `- ${c.actor} | ${c.action} | ${c.object}`)
        .join("\n")
    : "(keine CLAIM:-Zeilen)"
}

# Kapitel-Proben
${buildChapterSamples(chapters)}

Welche klaren Who-did-X-Widersprüche?`,
            preferJson: true,
            maxTokens: 1_200,
            timeoutMs: 70_000,
            reasoningEffort: "low",
          })
        ).trim();
        lastErr = null;
        break;
      } catch (error) {
        lastErr = error;
        if (attempt >= 1) break;
        await new Promise((r) => setTimeout(r, 800));
      }
    }
    if (lastErr || !raw) {
      if (input.strict && deterministic.length === 0) {
        throw lastErr instanceof Error
          ? lastErr
          : new Error("Plot-Truth-Check lieferte keine Antwort.");
      }
      return deterministic;
    }

    let obj: unknown = null;
    try {
      obj = parseModelJsonObject(raw, "Plot-Truth");
    } catch (parseErr) {
      if (input.strict && deterministic.length === 0) throw parseErr;
      return deterministic;
    }
    const list = Array.isArray((obj as { findings?: unknown })?.findings)
      ? ((obj as { findings: unknown[] }).findings)
      : [];
    const findings: PlotTruthFinding[] = [...deterministic];
    const seen = new Set(findings.map((f) => f.summary));
    for (const item of list) {
      if (!item || typeof item !== "object") continue;
      const row = item as Record<string, unknown>;
      const summary = String(row.summary ?? "").trim();
      if (summary.length < 16 || seen.has(summary)) continue;
      const nums = Array.isArray(row.chapterNumbers)
        ? [
            ...new Set(
              row.chapterNumbers
                .map((n) => Number(n))
                .filter((n) => Number.isFinite(n) && n >= 1)
                .map((n) => Math.floor(n)),
            ),
          ].slice(0, 6)
        : [];
      if (!nums.length) continue;
      const actors = Array.isArray(row.actors)
        ? row.actors.map((a) => String(a).trim()).filter(Boolean).slice(0, 4)
        : [];
      findings.push({
        kind: "plot_truth",
        chapterNumbers: nums,
        summary: summary.slice(0, 280),
        actors,
      });
      seen.add(summary);
      if (findings.length >= 5) break;
    }
    return findings;
  } catch (error) {
    if (input.strict && deterministic.length === 0) throw error;
    return deterministic;
  }
}

/**
 * Post-draft: if prior hardFacts claim actor A did X and this chapter claims B — flag rewrite.
 */
export function validateChapterAgainstPriorClaims(input: {
  prose: string;
  chapterNumber: number;
  storyState?: RomanStoryState | null;
  wissensGraph?: RomanWissensGraph | null;
}): { ok: boolean; violations: string[] } {
  const claims = [
    ...parsePlotClaimsFromLedger(input.storyState?.hardFacts ?? []),
    ...parsePlotClaimsFromLedger(input.wissensGraph?.hardInvariants ?? []),
  ].filter((c) => c.chapter === 0 || c.chapter < input.chapterNumber);
  if (!claims.length) return { ok: true, violations: [] };

  const bodyLc = input.prose.toLowerCase();
  const violations: string[] = [];
  for (const claim of claims) {
    const actionLc = claim.action.toLowerCase();
    const objectLc = claim.object.toLowerCase();
    if (actionLc.length < 4) continue;
    // Chapter mentions the action/object but a different listed person as subject nearby — soft heuristic
    if (!bodyLc.includes(actionLc) && !bodyLc.includes(objectLc)) continue;
    const rivals = claims
      .filter(
        (c) =>
          c.action.toLowerCase() === actionLc &&
          c.object.toLowerCase() === objectLc &&
          c.actor.toLowerCase() !== claim.actor.toLowerCase(),
      )
      .map((c) => c.actor);
    for (const rival of rivals) {
      if (bodyLc.includes(rival.toLowerCase()) && !bodyLc.includes(claim.actor.toLowerCase())) {
        violations.push(
          `CLAIM-Konflikt: Canon „${claim.actor}|${claim.action}|${claim.object}“, Kapitel nennt eher „${rival}“.`,
        );
      }
    }
    if (violations.length >= 3) break;
  }
  return { ok: violations.length === 0, violations };
}

export function formatPlotTruthRewriteBrief(violations: string[]): string {
  if (!violations.length) return "";
  return `## Korrektur Plot-Wahrheit (Who-did-X)
${violations.map((v) => `- ${v}`).join("\n")}
Behalte die Canon-Zuordnung aus CLAIM/hardFacts — keine neue Täterschaft erfinden. Nur Formulieren, dass dieselbe Wahrheit gilt.`;
}
