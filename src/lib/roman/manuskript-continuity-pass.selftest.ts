/**
 * Self-test for Kontinuitäts-Pass (MASS + name apply).
 * Run: npx tsx src/lib/roman/manuskript-continuity-pass.selftest.ts
 */

import assert from "node:assert/strict";
import type { RomanWissensGraph } from "@/lib/roman/editorial";
import {
  applyManuskriptContinuityFixes,
  formatGermanMeasure,
  scanMetricContinuityFixes,
  scanNameFixesFromClusters,
} from "@/lib/roman/manuskript-continuity-pass";

assert.equal(formatGermanMeasure(20), "zwanzig Zentimeter");
assert.equal(formatGermanMeasure(485), "vier Meter fünfundachtzig");
assert.equal(formatGermanMeasure(505), "fünf Meter und fünf Zentimeter");

const graph: RomanWissensGraph = {
  updatedAt: new Date().toISOString(),
  modelLabel: "test",
  seededFrom: ["manuskript"],
  nodes: [
    {
      id: "prop_carport",
      kind: "prop",
      label: "Carport",
      summary: "Tiefe",
      attrs: {
        status: "active",
        laenge_cm: "485",
        mass_label: "Carport Tiefe ab Außenkante Klinker",
      },
      sinceChapter: 1,
    },
  ],
  edges: [],
  hardInvariants: [
    "MASS: Carport Tiefe ab Außenkante Klinker = 485 cm — FROZEN (seit Kap. 1)",
  ],
};

const ms = `Kapitel 1 — Start

Der Carport maß exakt fünf Meter fünfzig ab Außenkante Klinker.



Kapitel 8 — Grill

„Eure Carport-Tiefe ist exakt fünf Meter fünfzig ab Außenkante Klinker.“
`;

const massFixes = scanMetricContinuityFixes(ms, graph);
assert.ok(massFixes.length >= 1, "should find 5,50 vs 485 cm drift");
assert.ok(
  massFixes.some((f) => /fünf Meter fünfzig|5/i.test(f.find)),
  "find mentions wrong measure",
);

const appliedMass = applyManuskriptContinuityFixes({
  manuskriptText: ms,
  wissensGraph: graph,
  fixes: massFixes,
});
assert.ok(appliedMass.appliedCount >= 1, "mass apply");
assert.ok(
  !/fünf Meter fünfzig/i.test(appliedMass.manuskriptText),
  "wrong depth removed",
);
assert.ok(
  /vier Meter fünfundachtzig/i.test(appliedMass.manuskriptText),
  "canon depth present",
);

const nameMs = `Kapitel 1 — Schule

Frau Lindemann gab eine Sechs in Mathe.



Kapitel 2 — Nachbar

Hartmut Kuhlmann tippte an den Stoßfänger.
`;

const nameFixes = scanNameFixesFromClusters(nameMs, [
  {
    canon: "Tebrügge",
    aliases: ["Lindemann"],
    frauForms: true,
    schoolContextOnly: true,
  },
]);
assert.ok(
  nameFixes.some((f) => f.find === "Frau Lindemann"),
  "Frau Lindemann fix",
);

const appliedName = applyManuskriptContinuityFixes({
  manuskriptText: nameMs,
  wissensGraph: null,
  fixes: nameFixes,
});
assert.ok(
  /Frau Tebrügge/.test(appliedName.manuskriptText),
  "teacher renamed",
);
assert.ok(
  /Hartmut Kuhlmann/.test(appliedName.manuskriptText),
  "neighbor preserved",
);
assert.ok(
  !/Frau Lindemann/.test(appliedName.manuskriptText),
  "old teacher gone",
);

console.log("manuskript-continuity-pass.selftest: ok");
