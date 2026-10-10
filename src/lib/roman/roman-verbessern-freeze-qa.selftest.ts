/**
 * Self-test: stil-pass Freeze-QA must not reject polish for secrets
 * already present in the Manuskript draft.
 * Run: npx tsx src/lib/roman/roman-verbessern-freeze-qa.selftest.ts
 */

import assert from "node:assert/strict";
import { novelContractViolations } from "@/lib/roman/manuskript-contract-validate";
import {
  filterDraftSharedFreezeReasons,
  isSoftOnlyFreezeNoise,
  shouldSoftRepairFreezeReasons,
} from "@/lib/roman/roman-verbessern-freeze-qa";
import type { RomanSzenenplotChapterNode } from "@/lib/roman/szenenplot-structured";

const chapter = {
  number: 1,
  title: "Test",
  mustNotRepeat: [],
  scenes: [
    {
      scene_id: "SZ_01",
      information_flow: {
        kept_secret:
          "Tobias verschweigt den vollen Umfang seiner vertraglichen Loyalitätsklauseln",
        revealed_to_audience: "",
      },
      dramaturgy: {
        scene_goal: "",
        obstacle_conflict: "",
        turning_point: "",
        outcome_value_change: "",
      },
    },
  ],
} as unknown as RomanSzenenplotChapterNode;

const draft = `
Tobias wusste, dass er den vollen Umfang seiner vertraglichen Loyalitätsklauseln
verschweigen musste. Melanie durfte das nicht erfahren.
`.repeat(3);

const polish = `
Tobias wusste genau, dass er den vollen Umfang seiner vertraglichen
Loyalitätsklauseln vor Melanie verschweigen musste — kein Wort darüber.
`.repeat(3);

const novel = novelContractViolations({
  draftProse: draft,
  polishedProse: polish,
  chapter,
});
assert.equal(
  novel.length,
  0,
  "shared Geheimnis tokens must not be novel stil-pass violations",
);

const sharedReasons = filterDraftSharedFreezeReasons(draft, [
  'Geheimnis aus SZ_01 vermutlich geleakt („Tobias verschweigt den vollen Umfang seiner vertraglichen Loyalitätsklauseln“).',
  "Inhalt: Neuer Handlungs-Beat: Brinkmann droht dem Arbeitgeber.",
]);
assert.ok(
  !sharedReasons.some((r) => /geleakt/i.test(r)),
  "draft-shared Geheimnis reason dropped",
);
assert.ok(
  sharedReasons.some((r) => /Brinkmann/i.test(r)),
  "real new-beat reason kept",
);

assert.equal(
  shouldSoftRepairFreezeReasons(["Maß: Carport 550 statt 485"]),
  true,
);
assert.equal(
  shouldSoftRepairFreezeReasons([
    "Inhalt: Satzbau etwas holprig am Absatzende",
  ]),
  false,
);
assert.equal(
  isSoftOnlyFreezeNoise(["Inhalt: Satzbau etwas holprig am Absatzende"]),
  true,
);

console.log("roman-verbessern-freeze-qa.selftest: ok");
