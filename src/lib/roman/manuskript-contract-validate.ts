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

/**
 * German function words + contract meta-framing words ("verschweigt", "bleibt",
 * "erwähnt", "unbekannt", "offen", ...) that appear inside `kept_secret` or
 * `mustNotRepeat` phrasing but are NOT the secret payload itself.
 */
const CONTRACT_META_STOPWORDS = new Set([
  "aber",
  "alle",
  "allem",
  "allen",
  "aller",
  "alles",
  "also",
  "andere",
  "anderen",
  "anderer",
  "auch",
  "ausdrücklich",
  "außerhalb",
  "beide",
  "beiden",
  "beim",
  "bereits",
  "bleiben",
  "bleibt",
  "bisher",
  "dabei",
  "dadurch",
  "dafür",
  "dagegen",
  "daher",
  "damit",
  "danach",
  "dann",
  "daran",
  "darauf",
  "daraus",
  "darf",
  "darin",
  "darüber",
  "darum",
  "darunter",
  "dass",
  "dazu",
  "dein",
  "deine",
  "demnach",
  "denen",
  "denn",
  "jeweils",
  "jedoch",
  "jetzt",
  "kaum",
  "kein",
  "keine",
  "keinem",
  "keinen",
  "keiner",
  "klar",
  "konkret",
  "konkrete",
  "konkreten",
  "konkreter",
  "lässt",
  "lassen",
  "legt",
  "lediglich",
  "mehr",
  "mein",
  "meine",
  "meinem",
  "meinen",
  "mitte",
  "müssen",
  "muss",
  "nach",
  "nachdem",
  "nächste",
  "nächsten",
  "neben",
  "nicht",
  "nichts",
  "noch",
  "oder",
  "offen",
  "offenbart",
  "ohne",
  "preis",
  "räumt",
  "rund",
  "sagt",
  "schon",
  "sein",
  "seine",
  "seinem",
  "seinen",
  "seiner",
  "seit",
  "selbst",
  "sich",
  "sieht",
  "sind",
  "sobald",
  "soll",
  "sollen",
  "sondern",
  "sowie",
  "später",
  "spätere",
  "späteren",
  "pricht",
  "spricht",
  "statt",
  "steht",
  "stellt",
  "tatsächlich",
  "trotz",
  "über",
  "überhaupt",
  "unausgesprochen",
  "unbekannt",
  "unter",
  "verbergen",
  "verborgen",
  "verheimlicht",
  "verrät",
  "verschweigen",
  "verschweigt",
  "verschwiegen",
  "völlig",
  "vollständig",
  "vorab",
  "orerst",
  "vorerst",
  "während",
  "wann",
  "warum",
  "weder",
  "wegen",
  "weil",
  "weiter",
  "weitere",
  "weiteren",
  "weiterhin",
  "welche",
  "welchem",
  "welchen",
  "welcher",
  "welches",
  "wenn",
  "wird",
  "werden",
  "wissen",
  "weiß",
  "wusste",
  "wurde",
  "wurden",
  "zeigen",
  "zeigt",
  "zuerst",
  "zunächst",
  "zusammenhang",
  "zwischen",
  "erwähnt",
  "erwähnen",
  "erklärt",
  "erklären",
  "erfährt",
  "erfahren",
  "genannt",
  "genaue",
  "genauen",
  "genauer",
  "exakte",
  "exakten",
  "diesem",
  "diesen",
  "dieser",
  "dieses",
  "diese",
  "durch",
  "eigen",
  "eigene",
  "eigenen",
  "eigener",
  "einem",
  "einen",
  "einer",
  "eines",
  "einzelne",
  "einzelnen",
  "erst",
  "folgt",
  "folgetag",
  "frühere",
  "früheren",
  "gegen",
  "gegenüber",
  "gehalten",
  "geheim",
  "geheimnis",
  "genau",
  "gerade",
  "gespräch",
  "getragen",
  "gleiche",
  "gleichen",
  "haben",
  "hatte",
  "hatten",
  "hier",
  "hinter",
  "hintergrund",
  "höhe",
  "ihre",
  "ihrem",
  "ihren",
  "ihrer",
  "immer",
  "indem",
  "innerhalb",
  "intern",
  "interne",
  "internen",
  "kapitel",
  "kapiteln",
  "moment",
  "monat",
  "monatliche",
  "monatlichen",
  "text",
  "ausgelöst",
  "ausgeloest",
  "festlegt",
  "festgelegt",
  "gewichtung",
]);

/** Significant tokens from a secret / ban phrase (≥4 chars, excluding meta stopwords). */
function significantTokens(
  phrase: string,
  allowedChapterTokens?: ReadonlySet<string>,
): string[] {
  return phrase
    .split(/[^\p{L}\p{N}]+/u)
    .map((t) => t.toLowerCase())
    .filter(
      (t) =>
        t.length >= 4 &&
        !CONTRACT_META_STOPWORDS.has(t) &&
        !/^sz_\d+$/i.test(t) &&
        !(allowedChapterTokens && allowedChapterTokens.has(t)),
    )
    .slice(0, 10);
}

/**
 * Build a set of tokens that are explicitly required/expected in the chapter
 * (character names, locations, props, events, revealed facts, scene headings).
 * Mentioning these in prose must never count as leaking a secret.
 */
function buildAllowedChapterTokenSet(
  chapter: RomanSzenenplotChapterNode,
): Set<string> {
  const parts: string[] = [
    chapter.title ?? "",
    chapter.kernsatz ?? "",
    ...(chapter.props ?? []),
    ...(chapter.events ?? []),
  ];
  for (const s of chapter.scenes ?? []) {
    parts.push(
      s.heading ?? "",
      s.summary ?? "",
      ...(s.characters_present ?? []),
      s.dramaturgy?.scene_goal ?? "",
      s.dramaturgy?.obstacle_conflict ?? "",
      s.dramaturgy?.outcome_value_change ?? "",
      s.information_flow?.revealed_to_audience ?? "",
      s.information_flow?.revealed_to_characters ?? "",
    );
  }
  const tokens = new Set<string>();
  for (const raw of parts) {
    for (const tok of raw.split(/[^\p{L}\p{N}]+/u)) {
      const lower = tok.toLowerCase();
      if (lower.length >= 4) tokens.add(lower);
    }
  }
  return tokens;
}

export type ManuskriptContractViolation = {
  code: "must_not_repeat" | "kept_secret_leak";
  message: string;
};

/**
 * Heuristic validation of chapter prose against plot contracts.
 * Filters out chapter-expected tokens (characters, props, locations, revealed
 * beats) and meta stopwords so `kept_secret` checks only fire when distinct
 * secret-specific payload tokens actually leak into prose.
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

  const allowedPropHay = normalizeHay(
    [...(input.chapter.props ?? []), ...(input.chapter.events ?? [])].join(" "),
  );
  const allowedChapterTokens = buildAllowedChapterTokenSet(input.chapter);

  for (const ban of input.chapter.mustNotRepeat ?? []) {
    const phrase = ban.trim();
    if (phrase.length < 10) continue;
    // Prior-introduce guards ("Erst-Einführung von X nicht wiederholen...") or bans overlapping
    // with active chapter props must not penalize mentioning an explicitly required prop.
    if (/^(?:erst-einführung|bereits in früheren kapiteln)/i.test(phrase)) {
      continue;
    }
    const needle = normalizeHay(phrase);
    if (needle.length >= 10 && allowedPropHay.includes(needle)) {
      continue;
    }
    if (needle.length >= 10 && hay.includes(needle)) {
      violations.push({
        code: "must_not_repeat",
        message: `Verbotenes Motiv wiederholt („${phrase.slice(0, 80)}“).`,
      });
      continue;
    }
    const tokens = significantTokens(phrase, allowedChapterTokens);
    if (
      tokens.length >= 2 &&
      !tokens.every((t) => allowedPropHay.includes(t)) &&
      tokens.every((t) => hay.includes(t))
    ) {
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
    // Only test distinct secret payload tokens that are NOT already part of
    // this chapter's allowed characters/locations/props/revealed facts.
    const secretOnlyTokens = significantTokens(secret, allowedChapterTokens);
    if (
      secretOnlyTokens.length >= 2 &&
      secretOnlyTokens.every((t) => hay.includes(t))
    ) {
      violations.push({
        code: "kept_secret_leak",
        message: `Geheimnis aus ${scene.scene_id} vermutlich geleakt („${secret.slice(0, 80)}“).`,
      });
    }
  }

  return { ok: violations.length === 0, violations };
}

/** Stable key so draft vs polish can drop shared false positives. */
export function contractViolationKey(
  violation: ManuskriptContractViolation,
): string {
  return `${violation.code}:${normalizeHay(violation.message).slice(0, 160)}`;
}

/**
 * Contract hits that appear in polish but not in the Manuskript draft.
 * Stil-Pass must not fail because the draft already narrates the same
 * kept_secret / mustNotRepeat tokens (classic „Geheimnis geleakt“ FP).
 */
export function novelContractViolations(input: {
  draftProse: string;
  polishedProse: string;
  chapter: RomanSzenenplotChapterNode;
}): ManuskriptContractViolation[] {
  const draft = validateManuskriptChapterAgainstContracts({
    prose: input.draftProse,
    chapter: input.chapter,
  });
  const polish = validateManuskriptChapterAgainstContracts({
    prose: input.polishedProse,
    chapter: input.chapter,
  });
  if (polish.ok) return [];
  const draftKeys = new Set(draft.violations.map(contractViolationKey));
  return polish.violations.filter((v) => !draftKeys.has(contractViolationKey(v)));
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
