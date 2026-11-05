/**
 * Smoke: seed closed COs as prior → Buch bewerten → expect convergence.
 * Usage: npx tsx --env-file=.env.local scripts/tmp-smoke-scoring-loop.ts
 */
import { scoreSachbuchBookManuscript } from "../src/lib/sachbuch/manuscript";
import {
  getSachbuchKontext,
  patchSachbuchBook,
} from "../src/lib/sachbuch/repository";
import { sachbuchKapitelNeedsManuscriptImprove } from "../src/lib/sachbuch/parse";

const ID = "1640c419-5f83-4c62-a25b-d57190727fa4";

const CLOSED_ORDERS = [
  "Entfernen der metatextuellen Klammer-Verweise und selbstreferenziellen Kapitel-Abgrenzungen in Kapitel 3, 6 und 8 (z. B. „(Dass weniger Felder den Durchsatz heben, ist Kapitel 4…)“); stattdessen die inhaltliche Brücke organisch in den Fließtext weben.",
  "Feinschliff der zeitlichen Synchronisation im KlarNetz-Referenzfall zwischen Kapitel 3, 5 und 9, damit unmissverständlich klar bleibt, welche Metriken zum initialen 90-Tage-Rollout gehören und welche Ergebnisse den Reifegrad nach vier Quartalen bzw. im zweiten Betriebsjahr beschreiben.",
  "Leichte Straffung der wiederkehrenden Basis-Definitionen von Muda, Poka-Yoke und 5S ab Kapitel 4: Statt das jeweilige Lean-Prinzip erneut herzuleiten, direkt auf die spezifische Anwendung im jeweiligen Kapitel (Datenminimierung, Lösch-Architektur, Stammdaten-Syntax) fokussieren.",
  "Beseitigung der in den Einzelkapiteln vermerkten minimalen Flüchtigkeitsfehler (vereinzelte Tippfehler in Kap. 7 und 9 sowie kleinere begriffliche Unschärfen an den Kapitelenden von Kap. 2 und 8).",
];

async function main() {
  const before = await getSachbuchKontext(ID);
  if (!before) throw new Error("missing book");

  // Seed prior so delta-context is exercised (simulates re-score after fixes).
  await patchSachbuchBook(ID, {
    idee: {
      ...before.idee,
      manuscriptReview: {
        ...before.idee.manuscriptReview,
        salesScore: before.idee.manuscriptReview.salesScore ?? 9,
        scoreSummary:
          before.idee.manuscriptReview.scoreSummary ||
          "Vor-Smoke: vier Change-Orders waren offen und wurden im Text geschlossen.",
        gaps: [
          "Meta-Klammer-Verweise zwischen Kapiteln.",
          "KlarNetz-Zeitachse Metrik-Eigentum.",
          "Lean-Basisdefinitionen wiederholt.",
          "Flüchtigkeitsfehler / Begriffspaar.",
        ],
        changeOrders: CLOSED_ORDERS,
        scoredAt: new Date().toISOString(),
        modelSlug: "smoke-prior",
      },
    },
  });

  console.log("Seeded 4 prior COs — running Buch bewerten…");
  const scored = await scoreSachbuchBookManuscript(ID);
  const rev = scored.idee.manuscriptReview;
  console.log("\n=== BOOK SCORE ===");
  console.log("score:", rev.salesScore);
  console.log("summary:", rev.scoreSummary?.slice(0, 400));
  console.log("gaps:", rev.gaps.length);
  for (const g of rev.gaps) console.log("  G:", g.slice(0, 160));
  console.log("orders:", rev.changeOrders.length);
  for (const o of rev.changeOrders) console.log("  O:", o.slice(0, 200));

  const reinvented = CLOSED_ORDERS.filter((old) =>
    rev.changeOrders.some(
      (n) =>
        (old.includes("metatextuell") && /meta|Klammer|Kapitel 4/i.test(n)) ||
        (old.includes("zeitlichen Synchronisation") &&
          /Zeitachse|90-Tage|Metrik/i.test(n)) ||
        (old.includes("Muda, Poka-Yoke") && /Muda|Poka-Yoke|5S|Lean/i.test(n)) ||
        (old.includes("Flüchtigkeitsfehler") &&
          /Tippfehler|Flüchtigkeit|begrifflic/i.test(n)),
    ),
  );
  console.log("\nreinvented theme count:", reinvented.length);

  console.log("\nneedsImprove:");
  for (const k of scored.kapitel) {
    console.log(
      `  ${k.title.slice(0, 40)}:`,
      sachbuchKapitelNeedsManuscriptImprove(scored, k.id),
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
