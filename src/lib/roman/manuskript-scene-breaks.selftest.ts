/**
 * Self-test: scene-break helpers (normalize, count, speech strip).
 * Run: npx tsx src/lib/roman/manuskript-scene-breaks.selftest.ts
 */

import assert from "node:assert/strict";
import {
  chapterMissingSceneBreaks,
  expectedSceneBreakCount,
  formatSceneBreakMandate,
  normalizeSceneBreakMarkers,
} from "@/lib/roman/manuskript-scene-breaks";
import {
  countSceneBreaks,
  SCENE_BREAK_MARKER,
  stripSceneBreaksForSpeech,
} from "@/lib/roman/plot-chapters";

const mixed = `Er ging in den Flur.

***

Gegenüber hing der Sensor.

⁂

Dann klingelte das Telefon.

~ ~ ~
`;

const normalized = normalizeSceneBreakMarkers(mixed);
assert.equal(countSceneBreaks(normalized), 3);
assert.ok(normalized.includes(SCENE_BREAK_MARKER));
assert.equal((normalized.match(/\*\*\*/g) ?? []).length, 0);

const spoken = stripSceneBreaksForSpeech(normalized);
assert.equal(countSceneBreaks(spoken), 0);
assert.ok(spoken.includes("Er ging in den Flur."));
assert.ok(spoken.includes("Dann klingelte das Telefon."));

assert.equal(expectedSceneBreakCount(4), 3);
assert.equal(expectedSceneBreakCount(1), 0);
assert.equal(chapterMissingSceneBreaks("nur ein Block", 4), true);
assert.equal(chapterMissingSceneBreaks(normalized, 4), false);
assert.ok(formatSceneBreakMandate(3).includes("2"));
assert.equal(formatSceneBreakMandate(1), "");

console.log("manuskript-scene-breaks.selftest ok");
