/**
 * Self-test for Raum-/Prop-Spine formatting.
 * Run: npx tsx src/lib/roman/manuskript-spatial.selftest.ts
 */

import assert from "node:assert/strict";
import {
  formatSpatialSpineForChapter,
  type RomanSzenenplotChapterNode,
} from "@/lib/roman/szenenplot-structured";

const ch: RomanSzenenplotChapterNode = {
  number: 1,
  title: "Test",
  kernsatz: "",
  props: ["Schuhe"],
  events: [],
  openThreads: [],
  mustNotRepeat: [],
  introduces: [],
  resolves: [],
  arcBeats: [],
  scenes: [
    {
      scene_id: "SZ_01",
      heading: "Ankunft",
      summary: "Tobias kommt heim.",
      characters_present: ["Tobias"],
      dramaturgy: {
        scene_goal: "Heimkommen",
        obstacle_conflict: "Müdigkeit",
        turning_point: "Schuhe aus",
        outcome_value_change: "Ankommen",
      },
      information_flow: {
        revealed_to_audience: "",
        revealed_to_characters: "",
        kept_secret: "",
      },
      continuity: {
        character_states_after: {
          Tobias: "Arbeitszimmer OG · barfuß",
        },
        prop_placements_after: {
          Schuhe: "Garderobe EG",
        },
        next_scene_hook: "Melanie ruft von unten hoch.",
      },
      schreibPrompt: "Schuhe an Garderobe, dann hoch.",
    },
    {
      scene_id: "SZ_02",
      heading: "Ruf",
      summary: "Gespräch mit Familie.",
      characters_present: ["Tobias", "Melanie"],
      dramaturgy: {
        scene_goal: "Reagieren",
        obstacle_conflict: "Unterbrechung",
        turning_point: "Runtergehen",
        outcome_value_change: "Familie",
      },
      information_flow: {
        revealed_to_audience: "",
        revealed_to_characters: "",
        kept_secret: "",
      },
      continuity: {
        character_states_after: {
          Tobias: "Küche EG · barfuß",
          Melanie: "Küche EG",
        },
        prop_placements_after: {
          Schuhe: "Garderobe EG",
        },
        next_scene_hook: "Gemeinsames Gespräch.",
      },
      schreibPrompt: "Tobias geht runter zur Küche — Schuhe bleiben unten.",
    },
  ],
};

const spine = formatSpatialSpineForChapter(ch);
assert.match(spine, /Raum-\/Prop-Spine/);
assert.match(spine, /Arbeitszimmer OG/);
assert.match(spine, /Garderobe EG/);
assert.match(spine, /runter|Küche/i);
assert.equal(formatSpatialSpineForChapter(null), "");

console.log("manuskript-spatial.selftest: ok");
