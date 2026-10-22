/**
 * Self-test for Kontinuitäts-Pass (MASS + name apply).
 * Run: npx tsx src/lib/roman/manuskript-continuity-pass.selftest.ts
 */

import assert from "node:assert/strict";
import type { RomanWissensGraph } from "@/lib/roman/editorial";
import {
  applyManuskriptContinuityFixes,
  formatGermanMeasure,
  scanIdentityContinuityFixes,
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

const materialGraph: RomanWissensGraph = {
  updatedAt: new Date().toISOString(),
  modelLabel: "test",
  seededFrom: ["manuskript"],
  nodes: [
    {
      id: "prop_t14",
      kind: "prop",
      label: "t14",
      summary: "Gerät",
      attrs: { status: "active", material: "Aluminium" },
      sinceChapter: 1,
    },
  ],
  edges: [],
  hardInvariants: ["t14 Material Aluminium — FROZEN"],
};

const materialMs = `Kapitel 1 — Keller

Das t14 lag auf der Werkbank, Gehäuse aus Kunststoff.



Kapitel 3 — Garage

Wieder das t14 — diesmal klar als Kunststoff erkennbar.
`;

const materialFixes = scanIdentityContinuityFixes(materialMs, materialGraph);
assert.ok(
  materialFixes.some((f) => /kunststoff/i.test(f.find)),
  "should flag Kunststoff vs Aluminium",
);
const appliedMat = applyManuskriptContinuityFixes({
  manuskriptText: materialMs,
  wissensGraph: materialGraph,
  fixes: materialFixes,
});
assert.ok(
  /Aluminium/i.test(appliedMat.manuskriptText),
  "canon material applied",
);

// Compound material: „Glas“ in prose must not false-positive vs
// FROZEN „Glas und Aluminiumrahmen“ (Wandterminal / AuraTab case).
const compoundMatGraph: RomanWissensGraph = {
  updatedAt: new Date().toISOString(),
  modelLabel: "test",
  seededFrom: ["manuskript"],
  nodes: [
    {
      id: "prop_wand",
      kind: "prop",
      label: "Wandterminal Flur App. 204 (AuraTab 10 Pro)",
      summary: "Terminal",
      attrs: {
        status: "active",
        material: "Glas und Aluminiumrahmen",
      },
      sinceChapter: 1,
    },
  ],
  edges: [],
  hardInvariants: [],
};
const compoundMatMs = `Kapitel 12 — Flur

Am Wandterminal Flur App. 204 (AuraTab 10 Pro) blinkt das Display hinter Glas.
`;
const compoundMatFixes = scanIdentityContinuityFixes(
  compoundMatMs,
  compoundMatGraph,
);
assert.equal(
  compoundMatFixes.length,
  0,
  "Glas in prose must not flag against compound Glas+Aluminiumrahmen",
);

// Two vehicles with different plates must not flip-flop on Übernehmen.
const plateGraph: RomanWissensGraph = {
  updatedAt: new Date().toISOString(),
  modelLabel: "test",
  seededFrom: ["manuskript"],
  nodes: [
    {
      id: "prop_stellplatz",
      kind: "place",
      label: "Stellplatz 14 Residenz",
      summary: "Parkplatz",
      attrs: { kennzeichen: "E-HS 1958" },
      sinceChapter: 1,
    },
    {
      id: "prop_passat",
      kind: "prop",
      label: "VW Passat Variant (Hartmut)",
      summary: "Auto",
      attrs: { kennzeichen: "E-HS 1412" },
      sinceChapter: 1,
    },
  ],
  edges: [],
  hardInvariants: [],
};

const plateMs = `Kapitel 5 — Hof

Am Stellplatz 14 Residenz stand der Wagen mit dem Kennzeichen E-HS 1412.



Kapitel 15 — Parkplatz

Hartmuts VW Passat Variant (Hartmut) trug E-HS 1958 am Heck.
`;

const plateFixes = scanIdentityContinuityFixes(plateMs, plateGraph);
assert.ok(plateFixes.length >= 1, "plate drift found");
const appliedPlate = applyManuskriptContinuityFixes({
  manuskriptText: plateMs,
  wissensGraph: plateGraph,
  fixes: plateFixes,
});
assert.ok(appliedPlate.appliedCount >= 1, "plate apply");
const plateAgain = scanIdentityContinuityFixes(
  appliedPlate.manuskriptText,
  plateGraph,
);
assert.equal(
  plateAgain.length,
  0,
  "no Kennzeichen flip-flop after apply",
);
assert.ok(
  /Stellplatz 14 Residenz[\s\S]{0,120}E-HS 1958/i.test(
    appliedPlate.manuskriptText,
  ),
  "Stellplatz keeps/gets 1958",
);
assert.ok(
  /Passat[\s\S]{0,80}E-HS 1412/i.test(appliedPlate.manuskriptText),
  "Passat keeps/gets 1412",
);

console.log("manuskript-continuity-pass.selftest: ok");
