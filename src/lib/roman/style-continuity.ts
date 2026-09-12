/**
 * Style continuity for the roman pipeline: anchors from foundation + prior prose.
 * Keeps tonality / devices / diction consistent across scenes (soft constraint via prompts).
 */

import type { ClaimedSzene, Szene } from "@/lib/roman/types";

const MAX_EXCERPT_CHARS = 1_200;
const MAX_TOTAL_SAMPLE_CHARS = 5_500;
const MAX_MANUSCRIPT_SEED_CHARS = 2_500;

function collapseWs(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/**
 * Takes opening + a mid slice so rhythm and diction both show up in the sample.
 */
export function excerptForStyleAnchor(
  text: string,
  maxChars = MAX_EXCERPT_CHARS,
): string {
  const clean = text.trim();
  if (!clean) return "";
  if (clean.length <= maxChars) return clean;

  const headLen = Math.floor(maxChars * 0.55);
  const midLen = maxChars - headLen - 20;
  const midStart = Math.max(
    headLen,
    Math.floor(clean.length / 2) - Math.floor(midLen / 2),
  );
  const head = clean.slice(0, headLen).trim();
  const mid = clean.slice(midStart, midStart + midLen).trim();
  return `${head}\n\n[…]\n\n${mid}`;
}

type StyleSource = Pick<
  ClaimedSzene,
  | "genre"
  | "praemisse"
  | "perspektive"
  | "zeitform"
  | "tonalitaet"
  | "stilbibel"
  | "kiRegelwerk"
  | "charaktere"
>;

/**
 * Mandatory style brief — repeated in author / lektor / revision prompts.
 */
export function buildStilpflichtBlock(source: StyleSource): string {
  const speech = source.charaktere
    .filter((c) => c.name.trim() && c.sprachstil.trim())
    .map((c) => `– ${c.name}: ${c.sprachstil.trim()}`)
    .join("\n");

  const lines = [
    source.tonalitaet.trim() &&
      `Tonalität (verbindlich, überall gleich): ${source.tonalitaet.trim()}`,
    source.perspektive.trim() &&
      `Perspektive (nicht wechseln): ${source.perspektive.trim()}`,
    source.zeitform.trim() &&
      `Zeitform (nicht wechseln): ${source.zeitform.trim()}`,
    source.genre.trim() && `Genre-Register: ${source.genre.trim()}`,
    source.stilbibel.trim() &&
      `Stilbibel / Stilmittel:\n${source.stilbibel.trim()}`,
    source.kiRegelwerk.trim() &&
      `KI-Regelwerk:\n${source.kiRegelwerk.trim()}`,
    speech && `Figuren-Sprachstil:\n${speech}`,
  ].filter(Boolean);

  if (!lines.length) {
    return `## Stil-Pflicht
Halte Tonalität, Stilmittel und Wortwahl über den gesamten Roman hinweg identisch.
Kein Stilbruch, kein generischer KI-Ton.`;
  }

  return `## Stil-Pflicht (überall gleich)
${lines.join("\n\n")}

Regel: Dieselbe Stimme in JEDER Szene — Rhythmus, Bildsprache, Humor/Ernst, Dialog-Register und Wortwahl wie oben. Keine Aufweichung, keine neue „Stimme“.`;
}

/**
 * Prose anchors from already revised scenes (and optional manuscript seed).
 */
export function buildStyleProseSamples(input: {
  priorRevised: Pick<Szene, "kapitelNr" | "szenenNr" | "entwurfRevidiert">[];
  manuskriptRaw?: string;
}): string {
  const blocks: string[] = [];
  let used = 0;

  const prior = [...input.priorRevised].sort(
    (a, b) => a.kapitelNr - b.kapitelNr || a.szenenNr - b.szenenNr,
  );

  // Prefer most recent completed scenes (closest voice), keep chronological label.
  const recent = prior.slice(-3);
  for (const scene of recent) {
    const budget = Math.min(
      MAX_EXCERPT_CHARS,
      MAX_TOTAL_SAMPLE_CHARS - used,
    );
    if (budget < 200) break;
    const excerpt = excerptForStyleAnchor(scene.entwurfRevidiert, budget);
    if (!excerpt) continue;
    blocks.push(
      `### Stil-Anker Kap. ${scene.kapitelNr}.${scene.szenenNr}\n${excerpt}`,
    );
    used += excerpt.length;
  }

  if (!blocks.length && input.manuskriptRaw?.trim()) {
    const seed = excerptForStyleAnchor(
      input.manuskriptRaw,
      MAX_MANUSCRIPT_SEED_CHARS,
    );
    if (seed) {
      blocks.push(
        `### Stil-Anker aus Manuskript / Outline (noch keine fertige Szene)\n${seed}`,
      );
    }
  }

  if (!blocks.length) {
    return `## Stil-Anker (Prosa)
(Noch keine Anker-Prosa — halte dich streng an die Stil-Pflicht oben.)`;
  }

  return `## Stil-Anker (verbindliche Prosa-Beispiele)
Diese Auszüge definieren Stimme, Tonalität, Stilmittel und Wortwahl.
Die neue Szene muss sich LESEN, als stammte sie aus demselben Buch — nicht nur thematisch, sondern stilistisch.

${blocks.join("\n\n")}`;
}

/**
 * Full style continuity package for one pipeline step.
 */
export function buildStyleContinuityPackage(input: {
  scene: StyleSource;
  priorRevised: Pick<Szene, "kapitelNr" | "szenenNr" | "entwurfRevidiert">[];
  manuskriptRaw?: string;
}): string {
  return [
    buildStilpflichtBlock(input.scene),
    buildStyleProseSamples({
      priorRevised: input.priorRevised,
      manuskriptRaw: input.manuskriptRaw,
    }),
  ].join("\n\n");
}

/** Completed scenes that sit before the claimed one in reading order. */
export function priorRevisedBefore(
  all: Szene[],
  claimed: Pick<Szene, "kapitelNr" | "szenenNr" | "id">,
): Szene[] {
  return all.filter((s) => {
    if (s.id === claimed.id) return false;
    if (!s.entwurfRevidiert.trim()) return false;
    if (s.status !== "COMPLETED") return false;
    if (s.kapitelNr < claimed.kapitelNr) return true;
    if (s.kapitelNr > claimed.kapitelNr) return false;
    return s.szenenNr < claimed.szenenNr;
  });
}

export function compactStyleHint(text: string, max = 400): string {
  const one = collapseWs(text);
  if (one.length <= max) return one;
  return `${one.slice(0, max)}…`;
}
