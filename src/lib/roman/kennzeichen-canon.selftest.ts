/**
 * Self-test: Kennzeichen canon snap.
 * Run: npx tsx src/lib/roman/kennzeichen-canon.selftest.ts
 */
import assert from "node:assert/strict";
import type { RomanWissensGraph } from "@/lib/roman/editorial";
import {
  canonicalizeKennzeichenInText,
  normalizeKennzeichen,
  protectFrozenKennzeichenAttrs,
} from "@/lib/roman/kennzeichen-canon";

assert.equal(normalizeKennzeichen("es-hs 1412"), "ES-HS 1412");
assert.equal(normalizeKennzeichen("E-HS  1958"), "E-HS 1958");

const graph: RomanWissensGraph = {
  updatedAt: new Date().toISOString(),
  modelLabel: "test",
  seededFrom: ["manuskript"],
  nodes: [
    {
      id: "p1",
      kind: "prop",
      label: "VW Passat",
      summary: "",
      attrs: { kennzeichen: "E-HS 1958" },
      sinceChapter: 1,
    },
  ],
  edges: [],
  hardInvariants: [],
};

const prose = `Kapitel 1

Am Stellplatz stand E-HS 2046. Später ES-HS 1412 und E-HS 4411.

DIN A4 und Um 8 Uhr bleiben.
`;
const fixed = canonicalizeKennzeichenInText(prose, graph);
assert.ok(!/2046|1412|4411/.test(fixed), "invented plates removed");
assert.ok(/E-HS 1958/.test(fixed), "canon plate present");
assert.ok(/DIN A4/.test(fixed) && /Um 8/.test(fixed), "false positives kept");

const grown: RomanWissensGraph = {
  ...graph,
  nodes: [
    {
      ...graph.nodes[0]!,
      attrs: { kennzeichen: "E-HS 9999" },
    },
  ],
};
const kept = protectFrozenKennzeichenAttrs(graph, grown);
assert.equal(
  kept.nodes[0]?.attrs.kennzeichen,
  "E-HS 1958",
  "graph grow cannot change plate",
);

console.log("kennzeichen-canon.selftest: ok");
