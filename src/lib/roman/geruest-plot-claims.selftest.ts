/**
 * Self-test: Gerüst Who-did-X preflight (Absicherung Behrens vs Tobias class).
 * Run: npx tsx src/lib/roman/geruest-plot-claims.selftest.ts
 */

import assert from "node:assert/strict";
import {
  auditGeruestPlotClaims,
  extractClaimsFromGeruestChapters,
} from "@/lib/roman/geruest-plot-claims";

const chapters = [
  {
    number: 1,
    title: "Abend",
    kernsatz: "Verdacht fällt auf Behrens",
    events: [
      "Dr. Behrens manipuliert die Versicherungspolice im Keller.",
      "CLAIM: Dr. Behrens|Manipulation|Versicherung",
    ],
  },
  {
    number: 3,
    title: "Enthüllung",
    kernsatz: "Tobias war es",
    events: [
      "Tobias gesteht die Manipulation der Versicherung.",
      "CLAIM: Tobias|Manipulation|Versicherung",
    ],
  },
];

const claims = extractClaimsFromGeruestChapters(chapters);
assert.ok(claims.length >= 2, "extract claims");

const issues = auditGeruestPlotClaims(chapters);
assert.ok(
  issues.some((i) => i.code === "plot_claim_conflict" && i.severity === "error"),
  "hard conflict Behrens vs Tobias",
);

console.log("geruest-plot-claims.selftest: ok");
