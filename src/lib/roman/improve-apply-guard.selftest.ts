/**
 * Self-test: Reifegrad apply regression guard.
 * Run: npx tsx src/lib/roman/improve-apply-guard.selftest.ts
 */
import assert from "node:assert/strict";
import {
  reifegradDimensionApplyRegressed,
  reifegradGesamtRegressed,
} from "@/lib/roman/improve-apply-guard";
import type { StageReifegrad } from "@/lib/roman/reifegrad-model";

function score(
  partial: Partial<StageReifegrad> & {
    gesamtPct: number;
    regelnPct: number;
  },
): StageReifegrad {
  return {
    stage: "manuskript",
    assessedAt: new Date().toISOString(),
    modelLabel: "test",
    stilPct: 60,
    dramaturgiePct: 60,
    leseflussPct: 50,
    stilStatus: "teilweise",
    dramaturgieStatus: "teilweise",
    leseflussStatus: "teilweise",
    regelnStatus: "teilweise",
    erfuelltesBeduerfnisPct: 0,
    vernachlaessigtesBeduerfnisPct: 0,
    freigabe: "freigabe_bedenken",
    belege: [],
    ...partial,
  } as StageReifegrad;
}

const prev = score({
  gesamtPct: 52,
  regelnPct: 39,
  stilPct: 62,
  dramaturgiePct: 60,
  leseflussPct: 48,
});

// Real incident: Logik patch, Gesamt −5 from Bewerter noise, Logik held/up.
const afterNoise = score({
  gesamtPct: 47,
  regelnPct: 42,
  stilPct: 55,
  dramaturgiePct: 52,
  leseflussPct: 40,
});
assert.equal(
  reifegradGesamtRegressed(prev, afterNoise, "manuskript"),
  true,
  "old Gesamt guard would reject",
);
assert.equal(
  reifegradDimensionApplyRegressed(prev, afterNoise, {
    stage: "manuskript",
    dimension: "logik",
  }),
  false,
  "dimension guard keeps patch when Logik improved",
);

// Target axis tanks → reject.
const afterAxisDrop = score({
  gesamtPct: 50,
  regelnPct: 30,
});
assert.equal(
  reifegradDimensionApplyRegressed(prev, afterAxisDrop, {
    stage: "manuskript",
    dimension: "logik",
  }),
  true,
  "reject when Logik drops",
);

// Catastrophic Gesamt even if Logik flat → reject.
const afterCollapse = score({
  gesamtPct: 40,
  regelnPct: 39,
});
assert.equal(
  reifegradDimensionApplyRegressed(prev, afterCollapse, {
    stage: "manuskript",
    dimension: "logik",
  }),
  true,
  "reject catastrophic Gesamt drop",
);

console.log("improve-apply-guard.selftest: ok");
