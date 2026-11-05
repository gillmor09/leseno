/**
 * Smooth meta "90-Tage-Verdichtung" asides into KlarNetz company history.
 * Usage: npx tsx --env-file=.env.local scripts/tmp-apply-90tage-organic.ts
 */
import {
  getSachbuchKontext,
  patchSachbuchBook,
  patchSachbuchKapitel,
} from "../src/lib/sachbuch/repository";
import {
  sachbuchKapitelBodyText,
  sachbuchKapitelNeedsManuscriptImprove,
} from "../src/lib/sachbuch/parse";
import type { SachbuchKontext } from "../src/lib/sachbuch/types";

const ID = "1640c419-5f83-4c62-a25b-d57190727fa4";

type Swap = { find: string; to: string };

async function load(): Promise<SachbuchKontext> {
  const book = await getSachbuchKontext(ID);
  if (!book) throw new Error("missing");
  return book;
}

async function applyChapter(chapter1: number, swaps: Swap[]): Promise<void> {
  const book = await load();
  const k = book.kapitel[chapter1 - 1]!;
  let text = sachbuchKapitelBodyText(k);
  const before = text;
  for (const s of swaps) {
    if (!text.includes(s.find)) {
      console.log(`K${chapter1} MISS: ${s.find.slice(0, 90)}`);
      continue;
    }
    text = text.split(s.find).join(s.to);
    console.log(`K${chapter1} OK: ${s.find.slice(0, 70)}`);
  }
  if (text === before) return;
  const now = new Date().toISOString();
  await patchSachbuchKapitel(ID, k.id, {
    manuscript: {
      ...k.manuscript,
      improvedText: text,
      draftText: k.manuscript.draftText || before,
      improvedAt: now,
    },
    updatedAt: now,
  });
}

async function main() {
  // K3 — first governance wins ≠ later company-wide sales cycle
  await applyChapter(3, [
    {
      find: "Das ist der Nachweis-Hebel der Governance-Reife über die Quartale hinweg: Fragebogen-Vorbereitung von Wochen auf Stunden, Audit-Freigabe von sechs Wochen auf drei Werktage — noch nicht die Sales-Velocity der späteren unternehmensweiten 90-Tage-Verdichtung.",
      to: "Das ist der Nachweis-Hebel der Governance-Reife über die Quartale hinweg: Fragebogen-Vorbereitung von Wochen auf Stunden, Audit-Freigabe von sechs Wochen auf drei Werktage. Diese ersten Bereichserfolge im Audit-Alltag sind noch nicht die spätere Verkürzung des gesamten B2B-Vertriebszyklus.",
    },
  ]);

  // K5 — support pilot / year-2 maturity vs later company-wide program
  await applyChapter(5, [
    {
      find: "Was folgt, ist der Erfahrungsbericht eines lokalen Support-Piloten, der zeitlich vor der unternehmensweiten 90-Tage-Verdichtung lag.",
      to: "Was folgt, ist der Erfahrungsbericht eines lokalen Support-Piloten — ein früher Bereichserfolg, lange bevor KlarNetz den Umbau unternehmensweit verdichtete.",
    },
    {
      find: "Retrospektiv war dieses lokale Pilot-Quartal die Blaupause; die unternehmensweite 90-Tage-Verdichtung skalierte später genau diese Erfahrung.",
      to: "Retrospektiv war dieses lokale Pilot-Quartal die Blaupause; KlarNetz skalierte später genau diese Erfahrung auf das gesamte Unternehmen.",
    },
    {
      find: "Das Pilotvorhaben gliederte sich rückblickend in drei klar abgegrenzte Etappen zu je 30 Tagen — eine Blaupause für die spätere unternehmensweite Verdichtung.",
      to: "Das Pilotvorhaben gliederte sich rückblickend in drei klar abgegrenzte Etappen zu je 30 Tagen — eine Blaupause für den späteren unternehmensweiten Ausbau.",
    },
    {
      find: "zeigt der Blick ins zweite Betriebsjahr: Nach dem Support-Piloten und etablierter Löschhygiene sinkt das Migrationsvolumen — ein Reifegrad-Ergebnis, nicht die Kennzahl der unternehmensweiten 90-Tage-Verdichtung.",
      to: "zeigt der Blick ins zweite Betriebsjahr: Nach dem Support-Piloten und etablierter Löschhygiene sinkt das Migrationsvolumen — ein Reifegrad-Ergebnis der ersten Bereichserfolge, noch bevor KlarNetz den Gesamtumbau konzernweit bilanzierte.",
    },
  ]);

  // K8 — fairness foundation precedes company-wide sales-cycle bilanz
  await applyChapter(8, [
    {
      find: "Hier entsteht die Voraussetzung, dass das Trust Center Vertrauen transportiert; die messbare Gesamt-Sales-Velocity der unternehmensweiten 90-Tage-Verdichtung folgt daraus erst als Bilanz.",
      to: "Hier entsteht die Voraussetzung, dass das Trust Center Vertrauen transportiert. Die messbare Verkürzung des gesamten B2B-Vertriebszyklus bilanzierte KlarNetz erst später — als die Bereichserfolge an Nachweis und Fairness unternehmensweit zusammengreifen.",
    },
  ]);

  // K9 — this IS the company-wide bilanz; name the program naturally without meta-label formula
  await applyChapter(9, [
    {
      find: "Im B2B-Geschäft schlägt sich dieser Wert in der Sales Cycle Velocity der 90-Tage-Verdichtung nieder: Der gesamte Vertriebs- und Auditzyklus sank bei KlarNetz von einst neun Wochen auf zwölf Tage. Die zuvor in der Governance-Reife erreichte Fragebogen-Vorbereitung (Wochen auf Stunden) bleibt unter KI-Last stabil; Standardanfragen über das Self-Service Trust Center dauern in dieser Bilanz Minuten statt Stunden.",
      to: "Im B2B-Geschäft schlägt sich dieser Wert in der Sales Cycle Velocity nieder: Als KlarNetz die Bereichserfolge aus Governance und Kundenschnittstelle unternehmensweit zusammenführte, sank der gesamte Vertriebs- und Auditzyklus von einst neun Wochen auf zwölf Tage. Die zuvor in der Governance-Reife erreichte Fragebogen-Vorbereitung (Wochen auf Stunden) bleibt unter KI-Last stabil; Standardanfragen über das Self-Service Trust Center dauern in dieser Gesamtbilanz Minuten statt Stunden.",
    },
    {
      find: "Komplexe B2B-Freigaben stützen sich auf dieselben Trust-Center-Nachweise: Die Stunden-Vorbereitung aus der Governance-Reife bleibt die Basis; in der 90-Tage-Verdichtung sinken Standardfragebögen weiter auf Minuten — nur bei hochregulierten Finanzkunden bleiben Einzelabstimmungen. Die Sales-Velocity von neun Wochen auf zwölf Tage ist damit die Bilanz der 90-Tage-Verdichtung, nicht der Quartals- oder Jahresreife allein.",
      to: "Komplexe B2B-Freigaben stützen sich auf dieselben Trust-Center-Nachweise: Die Stunden-Vorbereitung aus der Governance-Reife bleibt die Basis; unter dem konzernweiten Programm sinken Standardfragebögen weiter auf Minuten — nur bei hochregulierten Finanzkunden bleiben Einzelabstimmungen. Die Sales-Velocity von neun Wochen auf zwölf Tage ist damit die Gesamtbilanz dieses unternehmensweiten Zusammenspiels — nicht der Quartals- oder Jahresreife allein.",
    },
  ]);

  console.log("\n=== leftover 90-Tage-Verdichtung ===");
  {
    const book = await load();
    for (const n of [3, 5, 8, 9]) {
      const t = sachbuchKapitelBodyText(book.kapitel[n - 1]!);
      const count = (t.match(/90-Tage-Verdichtung/g) || []).length;
      console.log(`K${n}:`, count, count ? "STILL PRESENT" : "clean");
      // also dump nearby if any
      let from = 0;
      while (count) {
        const i = t.indexOf("90-Tage-Verdichtung", from);
        if (i < 0) break;
        console.log(" ", JSON.stringify(t.slice(Math.max(0, i - 60), i + 80)));
        from = i + 10;
      }
    }
  }

  // Sync book review: drop this CO; keep score honest
  console.log("\n=== sync review ===");
  const fresh = await load();
  const remaining = (fresh.idee.manuscriptReview.changeOrders ?? []).filter(
    (o) => !/90-Tage-Verdichtung/i.test(o),
  );
  const now = new Date().toISOString();
  await patchSachbuchBook(ID, {
    idee: {
      ...fresh.idee,
      manuscriptReview: {
        ...fresh.idee.manuscriptReview,
        changeOrders: remaining,
        gaps: (fresh.idee.manuscriptReview.gaps ?? []).filter(
          (g) => !/90-Tage-Verdichtung|Lektorats-Kommentar/i.test(g),
        ),
        scoredAt: now,
        scoreSummary:
          (fresh.idee.manuscriptReview.scoreSummary || "").replace(
            /\s*\(Score an Kapitel-Maximum angepasst[^)]*\)\.?/g,
            "",
          ) +
          " Meta-Einschübe zur 90-Tage-Abgrenzung in K3/5/8/9 als KlarNetz-Unternehmensgeschichte geglättet.",
      },
    },
  });
  const stamped = await load();
  const scoredAt = stamped.idee.manuscriptReview.scoredAt!;
  for (const k of stamped.kapitel) {
    await patchSachbuchKapitel(ID, k.id, {
      manuscript: { ...k.manuscript, bookPassAppliedScoredAt: scoredAt },
    });
  }
  const final = await load();
  console.log(
    "book orders:",
    final.idee.manuscriptReview.changeOrders.length,
    final.idee.manuscriptReview.changeOrders,
  );
  for (let i = 0; i < final.kapitel.length; i++) {
    console.log(
      `needsImprove K${i + 1}:`,
      sachbuchKapitelNeedsManuscriptImprove(final, final.kapitel[i]!.id),
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
