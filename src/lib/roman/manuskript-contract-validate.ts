/**
 * Draft-time checks: Manuskript prose vs structured chapter contracts.
 * Catches mustNotRepeat leaks and kept_secret spills without an LLM call.
 */

import type { RomanSzenenplotChapterNode } from "@/lib/roman/szenenplot-structured";

function normalizeHay(s: string): string {
  return s
    .normalize("NFC")
    .toLowerCase()
    .replace(/[„“”"']/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Significant tokens from a secret / ban phrase (≥4 letters). */
function significantTokens(phrase: string): string[] {
  return phrase
    .split(/[^\p{L}\p{N}]+/u)
    .map((t) => t.toLowerCase())
    .filter((t) => t.length >= 4)
    .slice(0, 8);
}

export type ManuskriptContractViolation = {
  code: "must_not_repeat" | "kept_secret_leak";
  message: string;
};

/**
 * Heuristic validation of chapter prose against plot contracts.
 * False positives possible on short tokens — phrases need ≥10 chars / ≥2 tokens.
 */
export function validateManuskriptChapterAgainstContracts(input: {
  prose: string;
  chapter: RomanSzenenplotChapterNode;
}): { ok: boolean; violations: ManuskriptContractViolation[] } {
  const hay = normalizeHay(input.prose);
  const violations: ManuskriptContractViolation[] = [];
  if (hay.length < 40) {
    return { ok: true, violations: [] };
  }

  for (const ban of input.chapter.mustNotRepeat ?? []) {
    const phrase = ban.trim();
    if (phrase.length < 10) continue;
    const needle = normalizeHay(phrase);
    if (needle.length >= 10 && hay.includes(needle)) {
      violations.push({
        code: "must_not_repeat",
        message: `Verbotenes Motiv wiederholt („${phrase.slice(0, 80)}“).`,
      });
      continue;
    }
    const tokens = significantTokens(phrase);
    if (tokens.length >= 2 && tokens.every((t) => hay.includes(t))) {
      violations.push({
        code: "must_not_repeat",
        message: `Verbotenes Motiv (Token-Treffer) „${phrase.slice(0, 80)}“.`,
      });
    }
  }

  for (const scene of input.chapter.scenes) {
    const secret = scene.information_flow.kept_secret?.trim() ?? "";
    if (!secret || /^(keins?|none|—|-)$/i.test(secret)) continue;
    if (secret.length < 10) continue;
    const needle = normalizeHay(secret);
    if (needle.length >= 10 && hay.includes(needle)) {
      violations.push({
        code: "kept_secret_leak",
        message: `Geheimnis aus ${scene.scene_id} geleakt („${secret.slice(0, 80)}“).`,
      });
      continue;
    }
    const tokens = significantTokens(secret);
    if (tokens.length >= 3 && tokens.filter((t) => hay.includes(t)).length >= 3) {
      violations.push({
        code: "kept_secret_leak",
        message: `Geheimnis aus ${scene.scene_id} vermutlich geleakt („${secret.slice(0, 80)}“).`,
      });
    }
  }

  return { ok: violations.length === 0, violations };
}

/** Patch brief fragment to force a rewrite that respects contracts. */
export function formatContractViolationRewriteBrief(
  violations: ManuskriptContractViolation[],
): string {
  if (!violations.length) return "";
  return [
    "## Vertragsverletzung — Korrektur (verbindlich)",
    "Der Entwurf verstößt gegen Szenenplot-Verträge. Schreibe das Kapitel neu und beachte:",
    ...violations.map((v, i) => `${i + 1}. ${v.message}`),
    "Handlung laut Szenenverträgen behalten — Verbote und Geheimnisse strikt einhalten.",
  ].join("\n");
}
