/**
 * Self-test: introduce ledger + deterministic double-introduce cleanup.
 * Run: npx tsx src/lib/roman/szenenplot-preflight.selftest.ts
 */

import {
  auditKapitelGeruestStructured,
  dedupeGeruestChapterIntroduces,
  hygieneKapitelGeruestLogik,
  introducedLabelsBeforeChapter,
  seedMustNotRepeatFromPriorIntroduces,
} from "@/lib/roman/szenenplot-preflight";
import type { RomanKapitelGeruestChapter } from "@/lib/roman/szenenplot-structured";

function emptyCh(
  number: number,
  introduces: string[],
  mustNotRepeat: string[] = [],
): RomanKapitelGeruestChapter {
  return {
    number,
    title: `Kap ${number}`,
    kernsatz: `Kern ${number}`,
    inhaltKurz: `Inhalt ${number} mit etwas mehr Text für die Skizze.`,
    props: [],
    events: [],
    openThreads: [],
    mustNotRepeat,
    introduces,
    resolves: [],
    arcBeats: [],
  };
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

const dirty = [
  emptyCh(1, ["Depotvereinbarung über 55.000 €", "Prüfkladde"]),
  emptyCh(2, ["Depotvereinbarung über 55.000 €"]),
  emptyCh(13, ["  Depotvereinbarung über 55.000 €  ", "Zen-Auszeichnung"]),
];

const before2 = introducedLabelsBeforeChapter(dirty, 2);
assert(
  before2.some((l) => /depotvereinbarung/i.test(l)),
  "Ledger vor Kap. 2 muss Depot enthalten",
);
assert(
  !introducedLabelsBeforeChapter(dirty, 1).length,
  "Ledger vor Kap. 1 muss leer sein",
);

const cleaned = dedupeGeruestChapterIntroduces(dirty);
assert(
  cleaned[0]!.introduces.filter((l) => /depot/i.test(l)).length === 1,
  "Kap. 1 behält Depot-introduce",
);
assert(
  cleaned[1]!.introduces.every((l) => !/depot/i.test(l)),
  "Kap. 2 verliert doppeltes Depot-introduce",
);
assert(
  cleaned[2]!.introduces.every((l) => !/depot/i.test(l)),
  "Kap. 13 verliert doppeltes Depot-introduce",
);
assert(
  cleaned[1]!.mustNotRepeat.some((l) => /depot/i.test(l)),
  "Kap. 2 bekommt Depot in mustNotRepeat",
);
assert(
  cleaned[2]!.mustNotRepeat.some((l) => /depot/i.test(l)),
  "Kap. 13 bekommt Depot in mustNotRepeat",
);
assert(
  cleaned[2]!.introduces.some((l) => /zen/i.test(l)),
  "Kap. 13 behält neues Introduce Zen-Auszeichnung",
);

const auditDirty = auditKapitelGeruestStructured({
  updatedAt: new Date().toISOString(),
  modelLabel: "test",
  centralArcs: [],
  chapters: dirty,
});
assert(
  auditDirty.errors.some((e) => e.code === "double_introduce"),
  "Dirty Gerüst muss double_introduce melden",
);

const auditClean = auditKapitelGeruestStructured({
  updatedAt: new Date().toISOString(),
  modelLabel: "test",
  centralArcs: [],
  chapters: cleaned,
});
assert(
  !auditClean.errors.some((e) => e.code === "double_introduce"),
  "Nach Dedup kein double_introduce",
);

// mustNotRepeat seed when prior introduce still appears in later props
{
  const withPropReuse = [
    emptyCh(1, ["Prüfkladde"]),
    {
      ...emptyCh(2, []),
      props: ["Prüfkladde liegt offen"],
      events: ["Astra blättert"],
    },
  ];
  const seeded = seedMustNotRepeatFromPriorIntroduces(withPropReuse);
  assert(
    seeded[1]!.mustNotRepeat.some((l) => /prüfkladde/i.test(l)),
    "Kap. 2 bekommt Prüfkladde in mustNotRepeat aus Prior-Introduce",
  );
}

{
  const dirtyGeruest = {
    updatedAt: new Date().toISOString(),
    modelLabel: "test",
    centralArcs: [],
    chapters: dirty,
  };
  const { structured, changed } = hygieneKapitelGeruestLogik(dirtyGeruest);
  assert(changed, "Hygiene muss Dirty-Gerüst ändern");
  assert(
    !auditKapitelGeruestStructured(structured).errors.some(
      (e) => e.code === "double_introduce",
    ),
    "Nach Logik-Hygiene kein double_introduce",
  );
  const again = hygieneKapitelGeruestLogik(structured);
  assert(!again.changed, "Zweite Hygiene ist no-op");
}

// Arc + resolve-without-intro hygiene: fixes arc_order, arc_peak_no_beat, arc_peak_tension, arc_beat_unknown, resolve_without_intro
{
  const brokenChapters: RomanKapitelGeruestChapter[] = [
    {
      ...emptyCh(1, ["Alter Schlüssel"]),
      openThreads: ["Geheimtür im Keller"],
      arcBeats: [{ arcId: "unknown_arc_xyz", tension: 5, mustShow: "Start", delta: "Start" }],
    },
    emptyCh(2, []),
    emptyCh(3, []),
    {
      ...emptyCh(4, []),
      resolves: ["Geheimtür im Keller", "Völlig unbekanntes Phantom-Motiv"],
    },
  ];
  const brokenGeruest = {
    updatedAt: new Date().toISOString(),
    modelLabel: "test",
    centralArcs: [
      {
        id: "arc_main",
        label: "Hauptbogen",
        parties: ["A", "B"],
        setupChapter: 99,
        peakChapter: 1,
        payoffChapter: 3,
      },
    ],
    chapters: brokenChapters,
  };
  const beforeAudit = auditKapitelGeruestStructured(brokenGeruest);
  assert(!beforeAudit.ok, "Broken Gerüst muss Audit-Fehler haben");

  const hygiened = hygieneKapitelGeruestLogik(brokenGeruest);
  assert(hygiened.changed, "Hygiene muss Broken-Gerüst reparieren");
  const afterAudit = auditKapitelGeruestStructured(hygiened.structured);
  assert(
    afterAudit.ok,
    `Nach Hygiene müssen alle Arc-/Lifecycle-Gates grün sein, aber: ${afterAudit.errors.map((i) => `${i.code}: ${i.message}`).join(" | ")}`,
  );
  // "Geheimtür im Keller" was mentioned in Kap. 1 openThreads -> seeded into Kap. 1 introduces and kept in Kap. 4 resolves
  assert(
    hygiened.structured.chapters[0]!.introduces.includes("Geheimtür im Keller"),
    "Erwähnter Faden aus Kap. 1 wird in Kap. 1 introduces nachgetragen",
  );
  assert(
    hygiened.structured.chapters[3]!.resolves.includes("Geheimtür im Keller") &&
      !hygiened.structured.chapters[3]!.resolves.includes(
        "Völlig unbekanntes Phantom-Motiv",
      ),
    "Phantom-Resolve wird entfernt, verankerter Resolve bleibt erhalten",
  );
}

console.log("szenenplot-preflight.selftest: ok");
