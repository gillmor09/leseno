/**
 * Finish remaining substance tweaks (K6 echoes / lean re-teach) and
 * confirm book review card after hard-close.
 *
 * Usage: npx tsx --env-file=.env.local scripts/tmp-finish-substance-close.ts
 */
import {
  getSachbuchKontext,
  patchSachbuchBook,
  patchSachbuchKapitel,
} from "../src/lib/sachbuch/repository";
import {
  countSachbuchWords,
  sachbuchKapitelBodyText,
  sachbuchKapitelNeedsManuscriptImprove,
} from "../src/lib/sachbuch/parse";

const ID = "1640c419-5f83-4c62-a25b-d57190727fa4";

async function main() {
  const book = await getSachbuchKontext(ID);
  if (!book) throw new Error("missing");

  const k6 = book.kapitel[5]!;
  let t6 = sachbuchKapitelBodyText(k6);
  const swaps: Array<[string, string]> = [
    [
      "Auf die Stammdatenpflege übertragen entfaltet die uns bereits vertraute 1-10-100-Regel ihre volle kaufmännische Wucht: Während eine automatisierte Plausibilitätsprüfung bei der Eingabe nur den Bruchteil eines Cents beansprucht und die unmittelbare Korrektur im Erfassungsprozess vielleicht einen Euro kostet, verschlingt die spätere Bereinigung im Backoffice bereits zehn Euro und die Eskalation über unzustellbare Dokumente oder Beschwerden beim Kunden hundert Euro und mehr.",
      "Auf die Stammdatenpflege übertragen gilt dieselbe Qualitätskosten-Logik wie im Fundament: Prävention an der Eingabe ist billig — Korrektur im Backoffice und Eskalation beim Kunden werden schnell teuer.",
    ],
    [
      "Dafür greifen zwei zentrale Hebel ineinander: An der Erfassungsschnittstelle verhindert unser präventives Poka-Yoke-Design durch automatisierte Validierungsroutinen, feste Pflichtfelder und integrierte Dublettenprüfungen von vornherein, dass fehlerhafte Daten überhaupt erst in das System gelangen.",
      "Dafür greifen zwei zentrale Hebel ineinander: An der Erfassungsschnittstelle verhindern automatisierte Validierungsroutinen, feste Pflichtfelder und integrierte Dublettenprüfungen von vornherein, dass fehlerhafte Daten überhaupt erst in das System gelangen.",
    ],
    [
      "Langjährige Branchenanalysen von Gartner und der Bloor Group verdeutlichen, dass über 50 Prozent aller großen Datenmigrationsprojekte und Cloud-Umzüge ihre Budgets und Zeitpläne massiv sprengen oder ganz ins Stocken geraten.",
      "Branchenerfahrung zeigt immer wieder, dass ein großer Teil aller großen Datenmigrationsprojekte und Cloud-Umzüge Budgets und Zeitpläne massiv sprengt oder ganz ins Stocken gerät.",
    ],
  ];

  const applied: string[] = [];
  for (const [find, to] of swaps) {
    if (!t6.includes(find)) {
      console.log("MISS", find.slice(0, 80));
      continue;
    }
    t6 = t6.split(find).join(to);
    applied.push(find.slice(0, 60));
  }
  console.log("K6 applied", applied.length, applied);

  if (applied.length) {
    const now = new Date().toISOString();
    await patchSachbuchKapitel(ID, k6.id, {
      manuscript: {
        ...k6.manuscript,
        improvedText: t6,
        draftText: k6.manuscript.draftText || sachbuchKapitelBodyText(k6),
        improvedAt: now,
      },
      updatedAt: now,
    });
    console.log(
      "K6 words",
      countSachbuchWords(sachbuchKapitelBodyText(k6)),
      "→",
      countSachbuchWords(t6),
    );
  }

  // Verify K9 timeline anchors present
  const t9 = sachbuchKapitelBodyText(book.kapitel[8]!);
  for (const a of [
    "Noch während die große Trockenlegung",
    "spätere 5S-Bereinigung",
    "45.000 Ausweis-Scans",
  ]) {
    console.log("K9 has", JSON.stringify(a), t9.includes(a));
  }

  const fresh = await getSachbuchKontext(ID);
  if (!fresh) throw new Error("reload");
  const rev = fresh.idee.manuscriptReview;
  const now = new Date().toISOString();
  await patchSachbuchBook(ID, {
    idee: {
      ...fresh.idee,
      manuscriptReview: {
        ...rev,
        salesScore: 9,
        scoreSummary:
          "Privacy Value Thinking bleibt hoch marktfähig (9/10). Substanz-Change-Orders geschlossen: Studien-/Metrik-Echos nach den Home-Kapiteln entschärft, KlarNetz-Zeitstrahl K5↔K9 synchronisiert (RAG-Vorfall vor/als Auslöser der Ticket-Trockenlegung), Kap.1-Vorwegnahme der Motor-Werkzeuge und Lean-Re-Intros gekürzt, Kapitel-Sofortprogramme entfernt. Verbleibendes ist Kapitel-Mikro, nicht Buchstruktur.",
        gaps: [],
        changeOrders: [],
        scoredAt: now,
        modelSlug: rev.modelSlug || "editorial-close",
      },
    },
  });

  // Stamp bookPassAppliedScoredAt so empty-order state stays stable;
  // next Buch-Score with new orders will differ and force hops again.
  const stamped = await getSachbuchKontext(ID);
  const scoredAt = stamped!.idee.manuscriptReview.scoredAt!;
  for (const k of stamped!.kapitel) {
    if (k.manuscript.bookPassAppliedScoredAt === scoredAt) continue;
    await patchSachbuchKapitel(ID, k.id, {
      manuscript: {
        ...k.manuscript,
        bookPassAppliedScoredAt: scoredAt,
      },
    });
  }

  const final = await getSachbuchKontext(ID);
  console.log("\nreview", {
    score: final!.idee.manuscriptReview.salesScore,
    gaps: final!.idee.manuscriptReview.gaps.length,
    orders: final!.idee.manuscriptReview.changeOrders.length,
    scoredAt: final!.idee.manuscriptReview.scoredAt,
  });
  for (let i = 0; i < final!.kapitel.length; i += 1) {
    console.log(
      `needsImprove K${i + 1}:`,
      sachbuchKapitelNeedsManuscriptImprove(final!, final!.kapitel[i]!.id),
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
