/**
 * Self-test for coverage mandates.
 * Run: npx tsx src/lib/roman/manuskript-coverage.selftest.ts
 */

import assert from "node:assert/strict";
import { buildChapterCoverageMandates } from "@/lib/roman/manuskript-coverage-validate";
import type { RomanSzenenplotChapterNode } from "@/lib/roman/szenenplot-structured";

const ch: RomanSzenenplotChapterNode = {
  number: 1,
  title: "Test",
  kernsatz: "",
  props: ["Schuhe"],
  events: ["Anruf"],
  openThreads: [],
  mustNotRepeat: [],
  introduces: ["Schuhe"],
  resolves: [],
  arcBeats: [
    {
      arcId: "arc_a",
      tension: 2,
      mustShow: "Misstrauen im Blick",
      delta: "steigt",
    },
  ],
  scenes: [
    {
      scene_id: "SZ_01",
      heading: "Heim",
      summary: "Ankommen",
      characters_present: ["Tobias"],
      dramaturgy: {
        scene_goal: "Ankommen",
        obstacle_conflict: "Müdigkeit",
        turning_point: "Schuhe aus",
        outcome_value_change: "Zuhause",
      },
      information_flow: {
        revealed_to_audience: "Er ist erschöpft",
        revealed_to_characters: "",
        kept_secret: "",
      },
      continuity: {
        character_states_after: { Tobias: "OG" },
        prop_placements_after: { Schuhe: "EG" },
        next_scene_hook: "Ruf",
      },
      schreibPrompt: "x",
    },
  ],
};

const mandates = buildChapterCoverageMandates(
  ch,
  "## Fakten\n- Auto | kennzeichen=AB — FROZEN: nicht wechseln\n",
);
assert.ok(mandates.some((m) => /Ziel sichtbar/.test(m)));
assert.ok(mandates.some((m) => /Misstrauen/.test(m)));
assert.ok(mandates.some((m) => /Schuhe/.test(m)));
assert.ok(mandates.some((m) => /FROZEN|kennzeichen/i.test(m)));
console.log("manuskript-coverage.selftest: ok");
