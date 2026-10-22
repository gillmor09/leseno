/**
 * Manuskript Freigabe audit bundle (no Server Action / auth).
 * Used by `roman-manuskript-freigabe.ts` and admin scripts.
 *
 * Hard (block Feinschliff): Canon, Ledger, deterministic Nahtdopplung,
 * Comedy-Humor when tonalitätRequiresComedyHard.
 * Soft (advisory): Assist Seam/Emotion/Timeline/Plot-Truth + Style.
 */

import {
  type ManuskriptFreigabeFinding,
  type RomanStoryState,
  type RomanWissensGraph,
} from "@/lib/roman/editorial";
import { scanManuskriptContinuity } from "@/lib/roman/manuskript-continuity-pass";
import { auditManuskriptContinuityLedger } from "@/lib/roman/manuskript-continuity-ledger";
import { auditManuskriptEmotionalConsequence } from "@/lib/roman/manuskript-emotional-consequence";
import {
  tonalitaetDemandsHumor,
  tonalitaetRequiresComedyHard,
  validateManuskriptChapterHumorPresence,
} from "@/lib/roman/manuskript-humor-presence";
import { scanDeterministicNahtdopplung } from "@/lib/roman/manuskript-nahtdopp-scan";
import {
  phraseHitsToFreigabeFindings,
  scanManuskriptPhraseFrequency,
} from "@/lib/roman/manuskript-phrase-freq";
import { auditManuskriptPlotTruth } from "@/lib/roman/manuskript-plot-truth";
import { auditManuskriptSeamAndPayoff } from "@/lib/roman/manuskript-seam-payoff";
import { parsePlotChapters } from "@/lib/roman/plot-chapters";
import type { RomanSzenenplotStructured } from "@/lib/roman/szenenplot-structured";
import type { RomanCharakter } from "@/lib/roman/types";

/**
 * Seam / Emotion / Plot-Truth / Continuity / Ledger (+ soft Style).
 * Assist taste findings are marked `soft` so they never block Freigabe.
 */
export async function runFreigabeAudits(input: {
  manuskriptText: string;
  structured: RomanSzenenplotStructured | null;
  wissensGraph?: RomanWissensGraph | null;
  storyState?: RomanStoryState | null;
  charaktere?: RomanCharakter[];
  tonalitaet?: string | null;
}): Promise<ManuskriptFreigabeFinding[]> {
  // Fail-soft on Assist JSON/transport: Erneut prüfen must not abort the
  // whole Freigabe-Check when Emotion/Seam/Ledger return truncated JSON.
  const [seam, emotion, plotTruth, continuity, ledger] = await Promise.all([
    auditManuskriptSeamAndPayoff({
      manuskriptText: input.manuskriptText,
      structured: input.structured,
      strict: false,
    }),
    auditManuskriptEmotionalConsequence({
      manuskriptText: input.manuskriptText,
      structured: input.structured,
      strict: false,
    }),
    auditManuskriptPlotTruth({
      manuskriptText: input.manuskriptText,
      storyState: input.storyState,
      wissensGraph: input.wissensGraph,
      strict: false,
    }),
    scanManuskriptContinuity({
      sourceText: input.manuskriptText,
      target: "manuskript",
      wissensGraph: input.wissensGraph,
      charaktere: input.charaktere ?? [],
      skipAliasLlm: false,
    }),
    auditManuskriptContinuityLedger({
      manuskriptText: input.manuskriptText,
      structured: input.structured,
      strict: false,
    }),
  ]);

  const findings: ManuskriptFreigabeFinding[] = [];

  // Deterministic Nahtdopplung first (hard) — Assist seam stays soft below.
  findings.push(...scanDeterministicNahtdopplung(input.manuskriptText));

  for (const f of ledger.findings) {
    findings.push({
      source: "ledger",
      kind: f.kind,
      chapterNumbers: f.chapterNumbers,
      summary: f.quote ? `${f.summary} („${f.quote}“)`.slice(0, 280) : f.summary,
    });
  }

  for (const f of seam) {
    if (f.kind === "timeline") {
      findings.push({
        source: "timeline",
        kind: "timeline",
        chapterNumbers: f.chapterNumbers,
        summary: f.summary,
        soft: true,
      });
    } else {
      findings.push({
        source: "seam",
        kind: f.kind,
        chapterNumbers: f.chapterNumbers,
        summary: f.summary,
        soft: true,
      });
    }
  }

  for (const f of emotion) {
    findings.push({
      source: "emotion",
      kind: f.kind,
      chapterNumbers: f.chapterNumbers,
      summary: f.summary,
      soft: true,
    });
  }

  for (const f of plotTruth) {
    findings.push({
      source: "plot_truth",
      kind: "plot_truth",
      chapterNumbers: f.chapterNumbers,
      summary: f.summary,
      soft: true,
    });
  }

  for (const fix of continuity.fixes.slice(0, 10)) {
    findings.push({
      source: "canon",
      kind: fix.kind,
      chapterNumbers: [fix.chapter],
      summary: fix.reason.slice(0, 280),
    });
  }

  const phraseHits = scanManuskriptPhraseFrequency(input.manuskriptText, {
    minCount: 3,
    minChapters: 2,
    maxHits: 8,
  });
  findings.push(...phraseHitsToFreigabeFindings(phraseHits));

  if (tonalitaetDemandsHumor(input.tonalitaet)) {
    const chapters = parsePlotChapters(input.manuskriptText).filter((c) =>
      c.body.trim(),
    );
    const sample = chapters.slice(0, 3);
    const weak = sample.filter(
      (c) =>
        !validateManuskriptChapterHumorPresence({
          prose: c.body,
          tonalitaet: input.tonalitaet,
        }).ok,
    );
    if (weak.length >= 2 || (weak.length >= 1 && sample.length === 1)) {
      const hard = tonalitaetRequiresComedyHard(input.tonalitaet);
      findings.push({
        source: hard ? "emotion" : "style",
        kind: "humor",
        chapterNumbers: weak.map((c) => c.number).slice(0, 6),
        summary: hard
          ? "Tonalität verlangt Comedy — mehrere Kapitel ohne spürbaren Humor."
          : "Tonalität nennt Humor/Wortwitz — frühe Kapitel wirken ohne Comic-Beat.",
        soft: !hard,
      });
    }
  }

  return findings.slice(0, 20);
}
