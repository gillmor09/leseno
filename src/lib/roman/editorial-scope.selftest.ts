/**
 * Self-test for critique scope normalization (parse / narrow / resolve).
 * Run: npx tsx src/lib/roman/editorial-scope.selftest.ts
 */

import assert from "node:assert/strict";
import {
  isLeserFeedbackBookWideWording,
  narrowAenderungsPromptsWithKritikChapters,
  parseAenderungsPrompts,
  resolveLeserFeedbackApplyChapters,
  resolveReifegradImproveChapters,
  type RomanAenderungsPrompt,
  type RomanLeserFeedback,
  type RomanReifegradImprovePlan,
} from "@/lib/roman/editorial";

function msDoc(...nums: number[]): string {
  return nums
    .map((n) => `## Kapitel ${n} — Titel ${n}\n\nText zu Kapitel ${n}.\n`)
    .join("\n");
}

function planWith(
  prompts: RomanAenderungsPrompt[],
): RomanReifegradImprovePlan {
  return {
    createdAt: new Date().toISOString(),
    stage: "manuskript",
    dimension: "logik",
    dimensionLabel: "Logik",
    modelLabel: "test",
    kritik: "",
    aenderungsPrompts: prompts,
  };
}

// Parse: buchweit label + Kap. in text → lokal, keep numbers
{
  const [p] = parseAenderungsPrompts([
    {
      titel: "Schuhe",
      scope: "buchweit",
      kapitel: [],
      anweisung:
        "Harmonisiere die Schuh-Genese im gesamten Text — Belege in Kap. 2 und Kapitel 8.",
      wichtigkeit: "kritisch",
    },
  ]);
  assert.equal(p.scope, "lokal");
  assert.deepEqual(p.kapitel, [2, 8]);
}

// Parse: empty kapitel + no numbers → buchweit
{
  const [p] = parseAenderungsPrompts([
    {
      titel: "Stimme",
      scope: "buchweit",
      kapitel: [],
      anweisung: "Erzählhaltung durchgehend knapper und trockener halten.",
      wichtigkeit: "wichtig",
    },
  ]);
  assert.equal(p.scope, "buchweit");
  assert.deepEqual(p.kapitel, []);
}

// Parse: explicit kapitel array wins over buchweit
{
  const [p] = parseAenderungsPrompts([
    {
      titel: "Raum",
      scope: "buchweit",
      kapitel: [15, 17],
      anweisung: "Stockwerk in Raum Taunus vereinheitlichen.",
      wichtigkeit: "kritisch",
    },
  ]);
  assert.equal(p.scope, "lokal");
  assert.deepEqual(p.kapitel, [15, 17]);
}

// Narrow: kritik chapters demote empty buchweit
{
  const narrowed = narrowAenderungsPromptsWithKritikChapters(
    [
      {
        titel: "Schuhe",
        scope: "buchweit",
        kapitel: [],
        anweisung: "Canon der Lederschuhe vereinheitlichen.",
        wichtigkeit: "kritisch",
      },
    ],
    "In Kap. 2 und Kap. 8 widersprechen sich die Kauforte.",
  );
  assert.equal(narrowed[0].scope, "lokal");
  assert.deepEqual(narrowed[0].kapitel, [2, 8]);
}

// Regex: “über mehrere Kapitel” alone is not book-wide
{
  assert.equal(
    isLeserFeedbackBookWideWording("über mehrere Kapitel anpassen"),
    false,
  );
  assert.equal(
    isLeserFeedbackBookWideWording("in jedem Kapitel die Stimme halten"),
    true,
  );
}

// Resolve: mixed lokal + buchweit with known chapters → union, not all
{
  const doc = msDoc(1, 2, 3, 8, 15, 17, 19, 21, 22);
  const resolved = resolveReifegradImproveChapters(
    doc,
    planWith([
      {
        titel: "Schuhe",
        scope: "buchweit",
        kapitel: [],
        anweisung: "Schuhe laut Kap. 2 und Kap. 8 angleichen.",
        wichtigkeit: "kritisch",
      },
      {
        titel: "Raum",
        scope: "lokal",
        kapitel: [15, 17],
        anweisung: "Stockwerk korrigieren.",
        wichtigkeit: "kritisch",
      },
      {
        titel: "Titel",
        scope: "lokal",
        kapitel: [15, 19],
        anweisung: "Kapiteltitel duplikat beheben.",
        wichtigkeit: "wichtig",
      },
    ]),
  );
  assert.equal(resolved.bookWide, false);
  assert.deepEqual(resolved.chapterNumbers, [2, 8, 15, 17, 19]);
}

// Resolve: pure buchweit without numbers → all available
{
  const doc = msDoc(1, 2, 3);
  const resolved = resolveReifegradImproveChapters(
    doc,
    planWith([
      {
        titel: "Stimme",
        scope: "buchweit",
        kapitel: [],
        anweisung: "Erzählhaltung durchgehend knapper halten.",
        wichtigkeit: "wichtig",
      },
    ]),
  );
  assert.equal(resolved.bookWide, true);
  assert.deepEqual(resolved.chapterNumbers, [1, 2, 3]);
}

// Leser-Feedback resolve: same union rule
{
  const doc = msDoc(1, 2, 3, 5, 9);
  const feedback: RomanLeserFeedback = {
    createdAt: new Date().toISOString(),
    modelLabel: "test",
    personaName: "Fan",
    weiterlesen: true,
    gesamt: "Ok",
    regelnStatus: "teilweise",
    vernachlaessigtesBeduerfnisStatus: "teilweise",
    erfuelltesBeduerfnisStatus: "teilweise",
    checkDetail: "",
    vorschlaege: [],
    aenderungsPrompts: [
      {
        titel: "Prop",
        scope: "buchweit",
        kapitel: [],
        anweisung: "In Kap. 2 und Kap. 5 den Prop angleichen.",
        wichtigkeit: "kritisch",
      },
      {
        titel: "Lokal",
        scope: "lokal",
        kapitel: [9],
        anweisung: "Schlussbeat schärfen.",
        wichtigkeit: "wichtig",
      },
    ],
    genreVergleich: "",
  };
  const resolved = resolveLeserFeedbackApplyChapters(doc, feedback);
  assert.equal(resolved.bookWide, false);
  assert.deepEqual(resolved.chapterNumbers, [2, 5, 9]);
}

console.log("editorial-scope.selftest: ok");
