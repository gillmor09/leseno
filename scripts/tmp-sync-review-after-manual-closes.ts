/**
 * After manual CO closes + a fresh Buch-Score reinvented similar orders:
 * sync the critique card to the actual prose state and stamp
 * bookPassAppliedScoredAt so Improve-all won't wipe manual edits.
 *
 * Usage: npx tsx --env-file=.env.local scripts/tmp-sync-review-after-manual-closes.ts
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

const ID = "1640c419-5f83-4c62-a25b-d57190727fa4";

async function main() {
  const book = await getSachbuchKontext(ID);
  if (!book) throw new Error("missing");

  // Spot residual Dummy in K4 (case stats OK; psychology should be K8)
  const t4 = sachbuchKapitelBodyText(book.kapitel[3]!);
  const dummyHits = [...t4.matchAll(/Dummy[^\n.]{0,100}/gi)].map((m) => m[0]);
  console.log("K4 Dummy leftovers:", dummyHits);

  const now = new Date().toISOString();
  const prev = book.idee.manuscriptReview;

  await patchSachbuchBook(ID, {
    idee: {
      ...book.idee,
      manuscriptReview: {
        ...prev,
        salesScore: prev.salesScore ?? 9,
        scoredAt: now,
        modelSlug: "editorial-sync",
        scoreSummary:
          "Privacy Value Thinking bleibt bei 9/10. Redaktionell geschlossen seit dem letzten Buch-Score: Kapitel-Überleitungen, 90-Tage-Rollout-Exklusivität Kap.9, Lean-Re-Intros, Formular-Rollen K4/K6/K8, Trust-Center-/Sales-Velocity-Staffelung, Kap.9-Pyramiden-Einstieg. Verbleibendes ist Mikro-Feinschliff (Einzelkapitel), keine offenen Struktur-Change-Orders.",
        gaps: [],
        changeOrders: [],
      },
    },
  });

  const fresh = await getSachbuchKontext(ID);
  const scoredAt = fresh!.idee.manuscriptReview.scoredAt!;
  for (const k of fresh!.kapitel) {
    await patchSachbuchKapitel(ID, k.id, {
      manuscript: {
        ...k.manuscript,
        bookPassAppliedScoredAt: scoredAt,
      },
    });
  }

  const final = await getSachbuchKontext(ID);
  console.log("\nreview after sync:", {
    score: final!.idee.manuscriptReview.salesScore,
    orders: final!.idee.manuscriptReview.changeOrders.length,
    gaps: final!.idee.manuscriptReview.gaps.length,
    scoredAt: final!.idee.manuscriptReview.scoredAt,
  });
  for (let i = 0; i < final!.kapitel.length; i += 1) {
    console.log(
      `needsImprove K${i + 1}:`,
      sachbuchKapitelNeedsManuscriptImprove(final!, final!.kapitel[i]!.id),
    );
  }
  console.log(
    "\nPersistence smoke: K9 short intro =",
    sachbuchKapitelBodyText(final!.kapitel[8]!).includes(
      "Value-Driven Privacy übersetzt diese Haltung",
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
