/**
 * Freigabe Nachziehen: vary stockphrases flagged by phrase-frequency scan
 * („Formulierungs-Variation“). Content-frozen — same beats/facts, different wording.
 */

import { emptyRomanEditorial } from "@/lib/roman/editorial";
import {
  scanManuskriptPhraseFrequency,
  type PhraseFreqHit,
} from "@/lib/roman/manuskript-phrase-freq";
import { applyRouteTarget } from "@/lib/roman/pipeline/apply";
import { parsePlotChapters } from "@/lib/roman/plot-chapters";
import type { RomanKontext } from "@/lib/roman/types";

/** Freigabe-Nachziehen: few chapters so Co-Autor finishes. */
const MAX_REWRITE_CHAPTERS = 2;
/** At most this many stockphrases in one click. */
const MAX_PHRASES = 3;

export type PhraseVariationPassResult = {
  roman: RomanKontext;
  hits: PhraseFreqHit[];
  patchedChapters: number[];
  summary: string;
  skipped: boolean;
  /**
   * Stored Freigabe listed Stockphrasen that are structural noise
   * (sagte sie / ich habe) — scan is clean, just refresh Freigabe.
   */
  alreadyClean?: boolean;
};

function parsePhraseFromSummary(summary: string): string | null {
  const m = summary.match(/Stockphrase\s+[„"]([^„"“]+)[“"]/i);
  const p = m?.[1]?.trim().toLowerCase();
  return p && p.length >= 3 ? p : null;
}

/**
 * Rewrite later chapters that reuse stockphrases so wording varies.
 * Keeps the first chapter occurrence; patches subsequent chapters.
 */
export async function runManuskriptPhraseVariationPass(input: {
  roman: RomanKontext;
  /** Phrases from Freigabe style_repeat summaries (optional). */
  seedPhrases?: string[];
  onProgress?: (label: string) => void | Promise<void>;
}): Promise<PhraseVariationPassResult> {
  const editorial = input.roman.editorial ?? emptyRomanEditorial();
  if (editorial.buchTyp === "clever_erzaehlt") {
    return {
      roman: input.roman,
      hits: [],
      patchedChapters: [],
      summary: "Formulierungs-Variation übersprungen (Clever erzählt).",
      skipped: true,
    };
  }

  const text = (editorial.manuskriptText ?? "").trim();
  if (!text) {
    return {
      roman: input.roman,
      hits: [],
      patchedChapters: [],
      summary: "Formulierungs-Variation übersprungen (kein Manuskript).",
      skipped: true,
    };
  }

  await input.onProgress?.(
    "Formulierungs-Variation · Stockphrasen prüfen …",
  );

  const scanned = scanManuskriptPhraseFrequency(text, {
    minCount: 3,
    minChapters: 2,
    maxHits: 12,
  });

  const seedNorm = (input.seedPhrases ?? [])
    .map((p) => p.trim().toLowerCase())
    .filter((p) => p.length >= 3);
  let hits = scanned;
  if (seedNorm.length > 0) {
    const seeded = scanned.filter((h) =>
      seedNorm.some(
        (s) => h.phrase === s || h.phrase.includes(s) || s.includes(h.phrase),
      ),
    );
    // Keep seed order preference, then fill from scan.
    const byPhrase = new Map(scanned.map((h) => [h.phrase, h]));
    const ordered: PhraseFreqHit[] = [];
    const seen = new Set<string>();
    for (const s of seedNorm) {
      const hit =
        byPhrase.get(s) ??
        scanned.find((h) => h.phrase.includes(s) || s.includes(h.phrase));
      if (hit && !seen.has(hit.phrase)) {
        seen.add(hit.phrase);
        ordered.push(hit);
      }
    }
    for (const h of seeded) {
      if (!seen.has(h.phrase)) {
        seen.add(h.phrase);
        ordered.push(h);
      }
    }
    hits = ordered.length > 0 ? ordered : scanned;
  }

  hits = hits.slice(0, MAX_PHRASES);
  if (hits.length === 0) {
    return {
      roman: input.roman,
      hits: [],
      patchedChapters: [],
      summary:
        seedNorm.length > 0
          ? "Formulierungs-Variation: gemeldete Phrasen sind Allerwelts-/Namens-Kollokationen — keine Variation nötig."
          : "Formulierungs-Variation: keine wiederholten Stockphrasen.",
      skipped: false,
      alreadyClean: true,
    };
  }

  // Patch chapters after the first occurrence so the phrase still appears once.
  const toPatch: number[] = [];
  const seenCh = new Set<number>();
  for (const hit of hits) {
    const rest = hit.chapterNumbers.slice(1);
    for (const n of rest) {
      if (seenCh.has(n)) continue;
      seenCh.add(n);
      toPatch.push(n);
      if (toPatch.length >= MAX_REWRITE_CHAPTERS) break;
    }
    if (toPatch.length >= MAX_REWRITE_CHAPTERS) break;
  }
  // Fallback: if every hit is single-chapter heavy, still patch that chapter.
  if (toPatch.length === 0) {
    for (const hit of hits) {
      for (const n of hit.chapterNumbers) {
        if (seenCh.has(n)) continue;
        seenCh.add(n);
        toPatch.push(n);
        if (toPatch.length >= MAX_REWRITE_CHAPTERS) break;
      }
      if (toPatch.length >= MAX_REWRITE_CHAPTERS) break;
    }
  }

  if (toPatch.length === 0) {
    return {
      roman: input.roman,
      hits,
      patchedChapters: [],
      summary: "Formulierungs-Variation: keine Kapitel zum Nachziehen.",
      skipped: false,
    };
  }

  const phraseLines = hits
    .map(
      (h) =>
        `- „${h.phrase}“ (${h.count}×, Kap. ${h.chapterNumbers.join(", ")})`,
    )
    .join("\n");

  await input.onProgress?.(
    `Formulierungs-Variation · Kap. ${toPatch.join(", ")} …`,
  );

  const chapters = parsePlotChapters(text);

  try {
    const applied = await applyRouteTarget({
      roman: input.roman,
      critiqueText: `Stockphrasen ohne Formulierungs-Variation:\n${phraseLines}`,
      target: {
        stage: "manuskript",
        reason: "Formulierungs-Variation / Freigabe-Nachziehen",
        patchBrief: `Formulierungs-Variation — Stockphrasen in Kap. ${toPatch.join(", ")} variieren (content frozen).`,
        chapterNumbers: toPatch,
      },
      patchBriefForChapter: (chapterNumber) => {
        const ch = chapters.find((c) => c.number === chapterNumber);
        const local = hits.filter((h) =>
          h.chapterNumbers.includes(chapterNumber),
        );
        const bans = (local.length ? local : hits)
          .map((h) => `- „${h.phrase}“`)
          .join("\n");
        return `ARBEITSAUFTRAG — Formulierungs-Variation Kap. ${chapterNumber}:
Content frozen: gleiche Beats, Fakten, Dialogbedeutung, Reihenfolge — nur Wortwahl/Satzbau.
FREIGABE-NACHZIEHEN: Die folgenden Stockphrasen dürfen in DIESEM Kapitel NICHT wörtlich wiederkehren — ersetze sie durch frische, situationsgenaue Formulierungen (Synonyme, anderer Bildausschnitt, verkürzt/anders betont). Nicht streichen ohne Ersatz, wenn die Info nötig ist.

# Stockphrasen (variieren)
${bans}

# Kapitel-Meta
${ch ? `Kapitel ${ch.number}` : `Kapitel ${chapterNumber}`}

Schreibe den vollständigen Kapitel-Body neu (Inhalt gleich, Formulierungen anders wo die Verbote greifen).`.slice(
          0,
          4_500,
        );
      },
    });

    const patched = applied.patchedChapters ?? toPatch;
    return {
      roman: applied.roman,
      hits,
      patchedChapters: patched,
      summary:
        patched.length > 0
          ? `Formulierungs-Variation: Kap. ${patched.join(", ")} (${hits.map((h) => `„${h.phrase}“`).join(", ")}).`
          : `Formulierungs-Variation: keine sichtbare Änderung (${hits.length} Phrasen).`,
      skipped: false,
    };
  } catch (error) {
    const msg =
      error instanceof Error
        ? error.message
        : "Formulierungs-Variation fehlgeschlagen";
    return {
      roman: input.roman,
      hits,
      patchedChapters: [],
      summary: `Formulierungs-Variation abgebrochen: ${msg.slice(0, 200)}`,
      skipped: false,
    };
  }
}

/** Extract stockphrase strings from Freigabe style_repeat summaries. */
export function seedPhrasesFromFreigabeFindings(
  findings: Array<{ source?: string; kind?: string; summary?: string; soft?: boolean }>,
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const f of findings) {
    if (f.source !== "style" && f.kind !== "style_repeat") continue;
    const p = parsePhraseFromSummary(f.summary ?? "");
    if (!p || seen.has(p)) continue;
    seen.add(p);
    out.push(p);
  }
  return out;
}
