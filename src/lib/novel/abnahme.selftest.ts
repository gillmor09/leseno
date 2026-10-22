/**
 * Selftest: Abnahme assembly must never inject manuscript-looking `[…]` gaps.
 * Run: npx tsx src/lib/novel/abnahme.selftest.ts
 */

import {
  ABNAHME_SAMPLE_CUT,
  assembleManuscriptForAbnahme,
  reconcileAbnahmeOverall,
  stripSampleCutComplaints,
} from "@/lib/novel/abnahme";
import type { NovelBundle } from "@/lib/novel/types";

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

const longBody = ("Szene. ".repeat(2_000) + "Ende.").trim();

const fakeBundle = {
  chapters: Array.from({ length: 12 }, (_, i) => ({
    chapterNumber: i + 1,
    title: `Kap ${i + 1}`,
    finalText: longBody,
    rawDraft: "",
  })),
} as unknown as NovelBundle;

const ms = assembleManuscriptForAbnahme(fakeBundle, 20_000);
assert(!/\[\s*…\s*\]/.test(ms), "must not inject […]");
assert(!/\[\s*\.{2,}\s*\]/.test(ms), "must not inject [...]");
assert(ms.includes(ABNAHME_SAMPLE_CUT), "must use explicit sample-cut marker");

const cleaned = stripSampleCutComplaints([
  "Gute Dialoge.",
  "Das Manuskript enthält mehrfach eckige Auslassungen „[…]“.",
  "Kapitelenden wiederholen Gesten.",
  "<<<ABNAHME_SAMPLE_CUT: x>>> bitte schließen",
]);
assert(cleaned.length === 2, "strip sample-cut / […] complaints");
assert(cleaned[0] === "Gute Dialoge.", "keep real strengths/weaknesses");

const scores67 = {
  genre: 7,
  tonalitaet: 7,
  logik: 6,
  dramaturgie: 6,
  stil: 6,
  versprechen: 7,
};
assert(
  reconcileAbnahmeOverall({
    modelOverall: 5,
    scores: scores67,
    sceneFloor: 6,
  }) >= 6,
  "scene floor lifts overall out of 5 dump",
);

console.log("abnahme.selftest OK");
