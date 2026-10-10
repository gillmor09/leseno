/**
 * Self-test: Verbessern cache prefix is byte-identical across waves.
 * Run: npx tsx src/lib/roman/roman-verbessern-context.selftest.ts
 */

import assert from "node:assert/strict";
import { emptyRomanEditorial } from "@/lib/roman/editorial";
import type { PlotChapter } from "@/lib/roman/plot-chapters";
import {
  buildStilPassChapterContext,
  buildVerbessernRunCachePrefix,
  buildWaveVoiceLockAddendum,
  stabilizeCacheText,
} from "@/lib/roman/roman-verbessern-context";

const chapters: PlotChapter[] = [
  {
    number: 1,
    title: "Start",
    body: "A".repeat(500) + " Tobias ging in die Küche und sah Melanie an. ".repeat(40),
  },
  {
    number: 2,
    title: "Weiter",
    body: "B".repeat(500) + " Der Carport maß vier Meter. ".repeat(50),
  },
  {
    number: 3,
    title: "Bank",
    body: "C".repeat(200) + " Behrens lächelte dünn. ".repeat(30),
  },
];

const editorial = emptyRomanEditorial();
const roman = {
  tonalitaet: "kühl, präzise, unterkühlter Humor",
  stilbibel: "kurze Sätze, konkrete Verben",
  kiRegelwerk: "keine Meta",
  genre: "Wirtschaftsthriller",
};

const slim = "# Slim-Canon\nTitel: Test\n";

const wave1Prefix = buildVerbessernRunCachePrefix({
  slimCanon: slim,
  roman,
  editorial,
  manuskriptChapters: chapters,
});
const wave2Prefix = buildVerbessernRunCachePrefix({
  slimCanon: slim + "\r\n",
  roman,
  editorial,
  manuskriptChapters: chapters,
});

assert.equal(
  wave1Prefix,
  wave2Prefix,
  "cache prefix must be byte-identical for both waves",
);
assert.equal(wave1Prefix, stabilizeCacheText(wave1Prefix));
assert.ok(wave1Prefix.length > 1_500, "prefix should be substantial for caching");

const polished = chapters.slice(0, 2).map((c) => ({
  ...c,
  body: `POLISHED ${c.body}`,
}));
const lockA = buildWaveVoiceLockAddendum(polished);
const lockB = buildWaveVoiceLockAddendum(polished);
assert.equal(lockA, lockB, "voice lock addendum byte-identical within wave");
assert.ok(lockA.includes("Stimme nach Welle 1"));
assert.notEqual(
  lockA,
  wave1Prefix,
  "voice lock must not live inside the cache prefix",
);

const slimCtx = buildStilPassChapterContext({
  previousTail: "Ende des Vorgängers mit Schuhen an der Tür.",
  structured: {
    chapters: [
      {
        number: 2,
        mustNotRepeat: ["zweite Garderobe oben"],
        scenes: [
          {
            scene_id: "SZ_01",
            information_flow: {
              kept_secret: "Tobias verschweigt die Klausel",
              revealed_to_audience: "",
            },
          },
        ],
      },
    ],
  } as never,
  chapterNumber: 2,
});
assert.ok(slimCtx.includes("Geheimnisse halten"));
assert.ok(slimCtx.includes("Nicht wiederholen"));
assert.ok(slimCtx.length < 2_000, "stil-pass context must stay slim");

console.log("roman-verbessern-context.selftest: ok");
