/**
 * Self-test: Freigabe settled suppression.
 * Run: npx tsx src/lib/roman/manuskript-freigabe-settle.selftest.ts
 */
import assert from "node:assert/strict";
import {
  filterFindingsAgainstSettled,
  mergeSettled,
  settledFromFinding,
} from "@/lib/roman/manuskript-freigabe-settle";
import type { ManuskriptFreigabeFinding } from "@/lib/roman/editorial";

const seam: ManuskriptFreigabeFinding = {
  source: "seam",
  kind: "seam",
  chapterNumbers: [17, 18],
  summary: "Nahtdopplung Kap.17→18",
};
const style: ManuskriptFreigabeFinding = {
  source: "style",
  kind: "style_repeat",
  chapterNumbers: [1, 2, 3],
  summary: 'Stockphrase „hellem holz“ 3× — Formulierungs-Variation nötig.',
  soft: true,
};
const other: ManuskriptFreigabeFinding = {
  source: "emotion",
  kind: "aftermath",
  chapterNumbers: [12],
  summary: "Keine Nachwirkung",
};

const now = new Date().toISOString();
const settled = mergeSettled(
  [],
  [settledFromFinding(seam, now), settledFromFinding(style, now)],
);
const filtered = filterFindingsAgainstSettled(
  [
    seam,
    {
      ...seam,
      summary: "Andere Formulierung derselben Naht 17/18",
    },
    style,
    {
      ...style,
      summary: 'Stockphrase „hellem holz“ 4× — Formulierungs-Variation nötig.',
    },
    other,
  ],
  settled,
);

assert.equal(filtered.length, 1, "only unrelated emotion remains");
assert.equal(filtered[0]?.source, "emotion");

// Assist rewords seam → payoff on overlapping chapters — still settled.
const payoffReword: ManuskriptFreigabeFinding = {
  source: "seam",
  kind: "payoff",
  chapterNumbers: [17, 21],
  summary: "Andere Formulierung derselben Naht-Familie",
};
assert.equal(
  filterFindingsAgainstSettled([payoffReword], settled).length,
  0,
  "seam family + chapter overlap stays settled",
);

console.log("manuskript-freigabe-settle.selftest: ok");
