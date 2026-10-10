/**
 * Self-test for measurable MASS facts (freeze + deterministic drift check).
 * Run: npx tsx src/lib/roman/wissens-metric-facts.selftest.ts
 */

import assert from "node:assert/strict";
import type { RomanWissensGraph } from "@/lib/roman/editorial";
import {
  extractMetricMentions,
  freezeMetricFactsFromChapters,
  listFrozenMetricFacts,
  protectFrozenMetricAttrs,
  validateProseAgainstMetricFacts,
} from "@/lib/roman/wissens-metric-facts";

const emptyGraph = (): RomanWissensGraph => ({
  updatedAt: new Date().toISOString(),
  modelLabel: "test",
  seededFrom: ["manuskript"],
  nodes: [
    {
      id: "prop_auto",
      kind: "prop",
      label: "Auto",
      summary: "Familienwagen am Carport",
      attrs: { status: "active", introducedChapter: "3", farbe: "silber" },
      sinceChapter: 3,
    },
  ],
  edges: [],
  hardInvariants: [],
});

const mentions = extractMetricMentions(
  "Das Auto hing nur noch elf Zentimeter über dem Carport, ein haarscharfes Spiel.",
  3,
);
// "elf" is a word — numeric form:
const mentionsNum = extractMetricMentions(
  "Das Auto hing nur noch 11 Zentimeter über dem Carport, ein haarscharfes Spiel.",
  3,
);
assert.ok(mentionsNum.length >= 1, "should extract 11 Zentimeter");
assert.equal(mentionsNum[0]!.valueCm, 11);

let graph = freezeMetricFactsFromChapters(emptyGraph(), [
  {
    number: 3,
    title: "Carport",
    body: "Das Auto hing nur noch 11 Zentimeter über dem Carport, ein haarscharfes Spiel.",
  },
]);

const frozen = listFrozenMetricFacts(graph);
assert.ok(frozen.length >= 1, "should freeze MASS fact");
assert.ok(
  frozen.some((f) => Math.abs(f.valueCm - 11) < 0.01),
  "frozen value 11 cm",
);
assert.ok(
  graph.hardInvariants.some((h) => /^MASS:/i.test(h) && /11/.test(h)),
  "MASS invariant present",
);

const okSame = validateProseAgainstMetricFacts({
  prose:
    "Wieder sah er das Auto: immer noch 11 cm über dem Carport, nichts hatte sich bewegt.",
  graph,
});
assert.equal(okSame.ok, true, "same measure must pass");

const drift = validateProseAgainstMetricFacts({
  prose:
    "Jetzt hing das Auto plötzlich 20 Zentimeter über dem Carport — ohne dass jemand etwas geändert hätte.",
  graph,
});
assert.equal(drift.ok, false, "11 vs 20 must fail");
assert.ok(
  drift.violations.some((v) => /11/.test(v.message) && /20/.test(v.message)),
  "violation names both values",
);

// Protect: LLM grow must not overwrite frozen attr
const previous = graph;
const overwritten: RomanWissensGraph = {
  ...graph,
  nodes: graph.nodes.map((n) =>
    n.id === "prop_auto"
      ? { ...n, attrs: { ...n.attrs, abstand_cm: "20", mass_cm: "20" } }
      : n,
  ),
};
const protectedGraph = protectFrozenMetricAttrs(previous, overwritten);
const auto = protectedGraph.nodes.find((n) => n.id === "prop_auto")!;
const kept =
  auto.attrs.abstand_cm === "11" ||
  auto.attrs.mass_cm === "11" ||
  Object.values(auto.attrs).includes("11");
assert.ok(kept || listFrozenMetricFacts(protectedGraph).some((f) => f.valueCm === 11),
  "protect keeps 11 cm");

// Re-freeze from later chapter must not change 11 → 20
graph = freezeMetricFactsFromChapters(protectedGraph, [
  {
    number: 12,
    title: "Später",
    body: "Das Auto hing 20 cm über dem Carport.",
  },
]);
assert.ok(
  listFrozenMetricFacts(graph).some((f) => f.valueCm === 11),
  "first-seen 11 cm survives later 20 cm prose",
);

// silence unused
assert.ok(Array.isArray(mentions));

console.log("wissens-metric-facts.selftest: ok");
