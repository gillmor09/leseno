import { scoreSachbuchBookManuscript } from "../src/lib/sachbuch/manuscript";
import {
  getSachbuchKontext,
  patchSachbuchKapitel,
} from "../src/lib/sachbuch/repository";

const ID = "1640c419-5f83-4c62-a25b-d57190727fa4";

async function main() {
  const book = await getSachbuchKontext(ID);
  if (!book) throw new Error("missing");
  const k = book.kapitel[4]!;
  const old =
    "Der A3-Report daneben – als Einseiter-Kasten setzen: Prozessname, Zweck, Datenfelder, Löschfrist, Risiko und die Verknüpfung zu den drei KI-Kennzahlen.";
  const neu =
    "Der A3-Report daneben: Prozessname, Zweck, Datenfelder, Löschfrist, Risiko und die Verknüpfung zu den drei KI-Kennzahlen.";
  let t = k.manuscript.improvedText;
  if (!t.includes(old)) throw new Error("cue not found");
  t = t.replace(old, neu);
  if (t.includes("Einseiter-Kasten") || t.includes("als Schaubild setzen")) {
    throw new Error("still has layout cues");
  }
  const now = new Date().toISOString();
  await patchSachbuchKapitel(ID, k.id, {
    finalText: t,
    manuscript: { ...k.manuscript, improvedText: t, improvedAt: now },
    updatedAt: now,
  });
  console.log("cue removed");

  const scored = await scoreSachbuchBookManuscript(ID);
  const r = scored.idee.manuscriptReview;
  console.log(
    JSON.stringify(
      {
        score: r.salesScore,
        summary: r.scoreSummary,
        gaps: r.gaps,
        orders: r.changeOrders,
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
