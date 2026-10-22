/**
 * Quick assertions for novel prose tic detector.
 * Run: npx tsx src/lib/novel/prose-tic-detect.selftest.ts
 */

import {
  detectCrossChapterFormulaHits,
  detectNovelProseTics,
  detectPlaceholders,
  manuscriptSoundsLikeAiFromTics,
} from "@/lib/novel/prose-tic-detect";

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

const clean = `Mara schloss die Tür. Der Flur roch nach nassem Mantel.
Sie ging zwei Stufen, blieb stehen, hörte den Aufzug.
Unten hustete jemand. Sie wartete, bis es still war, und ging weiter.`;

const aphorismEnd = `${"Die Akte lag auf dem Tisch. ".repeat(20)}
Das war kein Hebel. Aber es war endlich eine Richtung.`;

const negHeavy = `Nicht: Es gab keine Bestellung.
Nicht die Forderung. Nicht die Verrechnung.
Sie blätterte weiter.
Nicht der Stempel. Nicht die Unterschrift.
Am Ende blieb die leere Mappe.`;

const withGap = `Sie öffnete die Mappe.
[...]
Dann schloss sie wieder.`;

const nichtSondern = `Das war nicht die Rechnung, sondern die Drohung.
Und nicht der Ton, sondern die Frist.`;

assert(detectNovelProseTics(clean).length === 0, "clean should pass");
assert(
  detectNovelProseTics(aphorismEnd).some((h) => h.code === "chapter_end_aphorism"),
  "aphorism end should hit",
);
assert(
  detectNovelProseTics(negHeavy).some((h) => h.code === "negation_staccato"),
  "negation staccato should hit",
);
assert(
  detectPlaceholders(withGap).some((h) => h.code === "placeholder_gap"),
  "placeholder should hit",
);
assert(
  detectNovelProseTics(nichtSondern).some((h) => h.code === "nicht_sondern"),
  "nicht sondern should hit",
);

const keinePair = `${"Die Akte lag bereit. ".repeat(15)}
Keine Schweigepflicht, keine Befunde zurückhalten.
Keine Abkürzung, keine spätere Zustimmung.
Sie legte die Mappe beiseite.`;
assert(
  detectNovelProseTics(keinePair).some((h) => h.code === "negation_staccato"),
  "Keine-X-keine-Y should hit negation_staccato",
);

const readTwice = `${"Der Flur war eng. ".repeat(12)}
Er las den Brief zweimal und faltete ihn.
Später las er die Meldung noch einmal und nickte.`;
assert(
  detectNovelProseTics(readTwice).some((h) => h.code === "read_ritual"),
  "read ritual should hit",
);

const monoHeavy = `${"Die Tür ging auf. ".repeat(10)}
„Nein.“
„Gut.“
„Genau.“
„Klar.“
„Schon.“
„Doch.“
„Okay.“
Sie ging weiter.`;
assert(
  detectNovelProseTics(monoHeavy).some((h) => h.code === "mono_reply"),
  "mono reply should hit",
);

const monoNatural = `${"Die Tür ging auf. ".repeat(12)}
„Ich bin angekommen.“
„Das sehe ich.“
„Das war der Plan.“
„Dann muss man zum Sitzen erst den Tisch bewegen.“
Sie ging weiter.`;
assert(
  !detectNovelProseTics(monoNatural).some((h) => h.code === "mono_reply"),
  "natural short dialog should not hit mono_reply",
);

const gestureWait = `${"Der Flur war eng. ".repeat(12)}
Er nickte. Sie wartete. Er nickte erneut. Ihre Hand lag auf dem Tisch.`;
assert(
  detectNovelProseTics(gestureWait).some((h) => h.code === "gesture_lockstep"),
  "gesture/wait lockstep should hit",
);

const silenceEnd = `${"Die Rechnung lag da. ".repeat(20)}
Sie schwieg. Sein Blick blieb auf dem Blatt. Die Hand lag auf den Papieren.`;
assert(
  detectNovelProseTics(silenceEnd).some((h) => h.code === "silence_ending"),
  "silence ending should hit",
);

const dasIst = `${"Der Raum war hell. ".repeat(12)}
„Das ist richtig.“
„Das ist sachgerecht.“
„Das habe ich verstanden.“
„Das beschreibt den Vorgang.“
Sie ging weiter.`;
assert(
  detectNovelProseTics(dasIst).some((h) => h.code === "das_ist_takt"),
  "das ist takt should hit",
);

const procedure = `${"Der Tisch war frei. ".repeat(10)}
Sie ließ es dokumentieren. Er trägt den Vermerk ein. Ins Protokoll kam die Note.
Sie legte die Blätter nebeneinander. Er dokumentierte erneut. Sie trug den Namen ein.`;
assert(
  detectNovelProseTics(procedure).some((h) => h.code === "procedure_lockstep"),
  "procedure lockstep should hit",
);

const endA = `${"Text. ".repeat(40)}Die Lampe schaltet sich ein.`;
const endB = `${"Andere Szene. ".repeat(40)}Die Lampe schaltet sich ein.`;
assert(
  detectCrossChapterFormulaHits({
    currentText: endB,
    priorChapterTexts: [endA],
  }).some((h) => h.code === "ending_echo"),
  "ending echo should hit",
);

const gate = manuscriptSoundsLikeAiFromTics([
  aphorismEnd,
  aphorismEnd,
  aphorismEnd,
  clean,
]);
assert(gate.soundsLikeAi, "3 aphorism chapters should trip manuscript gate");

const gapGate = manuscriptSoundsLikeAiFromTics([clean, withGap]);
assert(gapGate.soundsLikeAi, "placeholder chapters should trip gate");

console.log("prose-tic-detect.selftest: ok");
