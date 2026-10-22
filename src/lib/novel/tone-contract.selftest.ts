/**
 * Run: npx tsx src/lib/novel/tone-contract.selftest.ts
 */

import {
  detectToneModeFromTexts,
  enrichVoiceCardForToneMode,
  formatToneContractForAuthor,
  toneModeStyleLabels,
} from "@/lib/novel/tone-contract";

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg);
}

assert(
  detectToneModeFromTexts("Ein Thriller über Banken") === "default",
  "thriller stays default",
);
assert(
  detectToneModeFromTexts(
    "Humorvolle Satire über Behörden und Optimierungswahn",
  ) === "satire_humor",
  "satire idea locks mode",
);
assert(
  detectToneModeFromTexts("Eine Komödie mit bitterer Ironie") === "satire_humor",
  "comedy+irony locks",
);

const labels = toneModeStyleLabels("satire_humor");
assert(labels.genre === "Satire", "genre Satire");
assert(formatToneContractForAuthor("satire_humor").includes("HARD"), "author hard");
assert(formatToneContractForAuthor("default") === "", "default empty");

const enriched = enrichVoiceCardForToneMode(
  {
    toneLabel: "knapp",
    traits: ["a", "b", "c", "d"],
    doWrite: ["x", "y", "z"],
    sampleLines: ["Eins zwei drei vier fünf.", "Sechs sieben acht neun zehn."],
    endingRotation: ["Handlung", "Dialog", "sinnlich"],
  },
  "satire_humor",
);
assert(/satire/i.test(enriched.toneLabel), "toneLabel mentions satire");
assert(
  enriched.traits.some((t) => /satire|humor/i.test(t)),
  "traits include satire",
);

console.log("tone-contract.selftest: ok");
