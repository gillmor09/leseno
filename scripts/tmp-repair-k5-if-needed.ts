import {
  getSachbuchKontext,
  patchSachbuchKapitel,
} from "../src/lib/sachbuch/repository";
import { sachbuchKapitelBodyText, countSachbuchWords } from "../src/lib/sachbuch/parse";

const ID = "1640c419-5f83-4c62-a25b-d57190727fa4";

async function main() {
  const book = await getSachbuchKontext(ID);
  if (!book) throw new Error("missing");
  let t = sachbuchKapitelBodyText(book.kapitel[4]!);

  for (const n of [
    "Zustandsübergang",
    "Bereinigungsdefizit",
    "Ungesteuerte Akkumulation",
    "unmittelbaren Hebel",
    "Vierstufige",
    "Reifegrad",
    "Kanarien",
  ]) {
    console.log(n, (t.match(new RegExp(n, "gi")) ?? []).length);
  }

  // Soften remaining K7 600k
  let t7 = sachbuchKapitelBodyText(book.kapitel[6]!);
  if (t7.includes("die rund 600.000 Privatkundenkonten sowie die angeschlossenen B2B-Portale")) {
    t7 = t7.replace(
      "die rund 600.000 Privatkundenkonten sowie die angeschlossenen B2B-Portale des Bestandsportfolios",
      "Privatkundenkonten sowie die angeschlossenen B2B-Portale des Bestandsportfolios",
    );
    const k = book.kapitel[6]!;
    const now = new Date().toISOString();
    await patchSachbuchKapitel(ID, k.id, {
      manuscript: {
        ...k.manuscript,
        improvedText: t7,
        improvedAt: now,
        changeOrders: [],
        gaps: [],
      },
      finalText: t7,
      updatedAt: now,
    });
    console.log("K7 600k softened");
  }

  // If K5 lost overview box headings, restore clean captions (content still in chapter flow)
  const inserts: Array<{ after: string; insert: string }> = [];
  if (!t.includes("drei Zustandsübergänge") && t.includes("Lifecycle-Matrix")) {
    // insert caption before first operational transition discussion
    const anchor = t.indexOf("Fachlicher Prozess-Trigger");
    if (anchor < 0) {
      const a2 = t.indexOf("Sobald ein Datensatz seine Löschreife erreicht");
      console.log("no Prozess-Trigger; alt", a2);
    } else {
      inserts.push({
        after: "",
        insert: "",
      });
      console.log("has Prozess-Trigger — content OK, only caption title missing");
    }
  }

  if (!t.includes("Management-Takeaway") && t.includes("Bereinigungsdefizit")) {
    console.log("Takeaway title gone but Bereinigungsdefizit content present — OK");
  }

  console.log("K5 words", countSachbuchWords(t));

  // Final order status
  const v = (await getSachbuchKontext(ID))!;
  console.log({
    orders: v.idee.manuscriptReview?.changeOrders?.length ?? 0,
    gaps: v.idee.manuscriptReview?.gaps?.length ?? 0,
    score: v.idee.manuscriptReview?.salesScore,
  });
}

main().catch(console.error);
