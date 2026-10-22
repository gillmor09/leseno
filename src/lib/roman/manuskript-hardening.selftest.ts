/**
 * Self-test: Canon/Style/Timeline hardening helpers (Absicherung defect classes).
 * Run: npx tsx src/lib/roman/manuskript-hardening.selftest.ts
 */

import assert from "node:assert/strict";
import {
  formatTimelineFrameMandate,
} from "@/lib/roman/manuskript-chapter-packet";
import {
  chapterHasHumorCues,
  tonalitaetDemandsHumor,
  validateManuskriptChapterHumorPresence,
} from "@/lib/roman/manuskript-humor-presence";
import {
  formatPhraseBansForPacket,
  scanManuskriptPhraseFrequency,
} from "@/lib/roman/manuskript-phrase-freq";
import {
  findClaimActorConflicts,
  parsePlotClaimsFromLedger,
  validateChapterAgainstPriorClaims,
} from "@/lib/roman/manuskript-plot-truth";
import type { RomanSzenenplotChapterNode } from "@/lib/roman/szenenplot-structured";

const phraseMs = `Kapitel 1 — Abend

Sie ging über die geölten Dielen zum Schrank. Die geölte Eiche glänzte.



Kapitel 2 — Morgen

Wieder die geölten Dielen. Und die geölte Eiche im Flur.



Kapitel 3 — Nacht

Auf den geölten Dielen blieb er stehen. Die geölte Eiche knackte.
`;

const hits = scanManuskriptPhraseFrequency(phraseMs, {
  minCount: 3,
  minChapters: 2,
});
assert.ok(
  hits.some((h) => /geölt/.test(h.phrase)),
  "should flag geölte … phrases",
);
assert.ok(
  !hits.some((h) => /sagte|ich habe|herr /.test(h.phrase)),
  "must not flag dialogue tags / auxiliaries / Herr-Anrede",
);
const ban = formatPhraseBansForPacket(hits);
assert.ok(/Stil-Verbote/.test(ban), "packet ban section");

const dialogueNoise = `Kapitel 1 — A

»Hallo«, sagte sie. Ich habe Hunger. Herr Stiller nickte. Apartment 204 war still.



Kapitel 2 — B

»Ja«, sagte sie. Ich habe Zeit. Herr Stiller lachte. Apartment 204 roch nach Kaffee.



Kapitel 3 — C

»Nein«, sagte sie. Ich habe nichts. Herr Stiller ging. Apartment 204 blieb dunkel.
`;
const noiseHits = scanManuskriptPhraseFrequency(dialogueNoise, {
  minCount: 3,
  minChapters: 2,
});
assert.equal(
  noiseHits.length,
  0,
  "dialogue/auxiliary/name collocations must not freigabe-flag",
);

const claims = parsePlotClaimsFromLedger([
  "CLAIM: Dr. Behrens|Manipulation|Versicherung",
  "CLAIM: Tobias|Manipulation|Versicherung",
]);
const conflicts = findClaimActorConflicts(claims);
assert.equal(conflicts.length, 1, "Behrens vs Tobias claim conflict");

const priorCheck = validateChapterAgainstPriorClaims({
  prose:
    "Tobias hatte die Manipulation der Versicherung längst zugegeben.",
  chapterNumber: 3,
  storyState: {
    updatedAt: new Date().toISOString(),
    afterChapter: 1,
    location: "",
    presentCharacters: [],
    openThreads: [],
    secretsAndKnowledge: [],
    inventoryAndProps: [],
    relationshipNotes: [],
    hardFacts: [
      "CLAIM: Dr. Behrens|Manipulation|Versicherung",
      "CLAIM: Tobias|Manipulation|Versicherung",
    ],
    mood: "",
  },
});
assert.equal(priorCheck.ok, false, "chapter contradicts Behrens claim");

assert.equal(tonalitaetDemandsHumor("trockener Humor, Wortwitz"), true);
const flat =
  "Es war dunkel und kalt und schwer im Flur. Nichts bewegte sich. Die Tür blieb zu. Der Regen trommelte gegen das Fenster ohne Unterlass.";
assert.equal(chapterHasHumorCues(flat), false);
const humor = validateManuskriptChapterHumorPresence({
  prose: flat,
  tonalitaet: "Humor und Wortwitz",
});
assert.equal(humor.ok, false, "flat prose vs humor tonality");

const flashCh = {
  number: 2,
  title: "Rückblick",
  kernsatz: "Flashback auf die Kindheit",
  props: [],
  events: [],
  openThreads: [],
  mustNotRepeat: [],
  introduces: [],
  resolves: [],
  arcBeats: [],
  scenes: [],
} satisfies RomanSzenenplotChapterNode;
const timeline = formatTimelineFrameMandate({
  chapter: flashCh,
  storyState: {
    updatedAt: new Date().toISOString(),
    afterChapter: 1,
    location: "",
    presentCharacters: [],
    openThreads: [],
    secretsAndKnowledge: [],
    inventoryAndProps: [],
    relationshipNotes: [],
    hardFacts: [],
    mood: "",
    timeFrame: "Rückblick",
  },
});
assert.ok(/Zeitrahmen-MUSS/.test(timeline), "timeline mandate for flashback");

console.log("manuskript-hardening.selftest: ok");
