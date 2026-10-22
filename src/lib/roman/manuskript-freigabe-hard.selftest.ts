/**
 * Self-test: hard vs soft Freigabe findings.
 * Run: npx tsx src/lib/roman/manuskript-freigabe-hard.selftest.ts
 */
import assert from "node:assert/strict";
import {
  hardManuskriptFreigabeFindings,
  isHardFreigabeFinding,
  type ManuskriptFreigabeFinding,
} from "@/lib/roman/editorial";
import { scanDeterministicNahtdopplung } from "@/lib/roman/manuskript-nahtdopp-scan";

const softSeam: ManuskriptFreigabeFinding = {
  source: "seam",
  kind: "seam",
  chapterNumbers: [3, 4],
  summary: "Assist Naht wirkt weich",
  soft: true,
};
const softEmotion: ManuskriptFreigabeFinding = {
  source: "emotion",
  kind: "aftermath",
  chapterNumbers: [5],
  summary: "Keine Nachwirkung",
  soft: true,
};
const softStyle: ManuskriptFreigabeFinding = {
  source: "style",
  kind: "style_repeat",
  chapterNumbers: [1, 2],
  summary: "Stockphrase",
  soft: true,
};
const hardCanon: ManuskriptFreigabeFinding = {
  source: "canon",
  kind: "kennzeichen",
  chapterNumbers: [8],
  summary: "Kennzeichen drift",
};
const hardLedger: ManuskriptFreigabeFinding = {
  source: "ledger",
  kind: "money",
  chapterNumbers: [9],
  summary: "Geld inkonsistent",
};
const hardNahtdopp: ManuskriptFreigabeFinding = {
  source: "seam",
  kind: "seam_dup",
  chapterNumbers: [10, 11],
  summary: "Nahtdopplung",
};
const hardHumor: ManuskriptFreigabeFinding = {
  source: "emotion",
  kind: "humor",
  chapterNumbers: [1, 2],
  summary: "Comedy fehlt",
};

assert.equal(isHardFreigabeFinding(softSeam), false);
assert.equal(isHardFreigabeFinding(softEmotion), false);
assert.equal(isHardFreigabeFinding(softStyle), false);
assert.equal(isHardFreigabeFinding(hardCanon), true);
assert.equal(isHardFreigabeFinding(hardLedger), true);
assert.equal(isHardFreigabeFinding(hardNahtdopp), true);
assert.equal(isHardFreigabeFinding(hardHumor), true);

const hard = hardManuskriptFreigabeFindings([
  softSeam,
  softEmotion,
  softStyle,
  hardCanon,
  hardLedger,
  hardNahtdopp,
  hardHumor,
]);
assert.equal(hard.length, 4);

// Deterministic Nahtdopplung: shared stretch across chapter boundary.
const shared =
  "Die Tür knarrte leise im alten Hausflur und der Geruch von Bohnerwachs hing in der Luft wie immer.";
const ms = [
  "## Kapitel 1 — Start",
  "",
  "Anfang eins. ".repeat(20),
  shared,
  "",
  "## Kapitel 2 — Weiter",
  "",
  shared,
  " Und dann ging es weiter mit ganz anderem Stoff der nichts wiederholt.",
].join("\n");
const dups = scanDeterministicNahtdopplung(ms);
assert.ok(dups.length >= 1, "expected nahtdopp hit");
assert.equal(dups[0]?.kind, "seam_dup");
assert.equal(isHardFreigabeFinding(dups[0]!), true);

console.log("manuskript-freigabe-hard.selftest: ok");
