import { getSachbuchKontext } from "../src/lib/sachbuch/repository";
import { sachbuchKapitelBodyText } from "../src/lib/sachbuch/parse";
import {
  patchSachbuchKapitel,
} from "../src/lib/sachbuch/repository";

const ID = "1640c419-5f83-4c62-a25b-d57190727fa4";

async function main() {
  const book = await getSachbuchKontext(ID);
  if (!book) throw new Error("missing");

  const k5 = sachbuchKapitelBodyText(book.kapitel[4]!);
  for (const n of [
    "Lifecycle-Matrix",
    "Reifegradmodell",
    "Management-Takeaway",
    "drei Zustandsübergänge",
  ]) {
    const i = k5.indexOf(n);
    console.log(`\nK5[${n}]`, i < 0 ? "MISSING" : k5.slice(Math.max(0, i - 100), i + 200).replace(/\s+/g, " "));
  }

  const k7 = sachbuchKapitelBodyText(book.kapitel[6]!);
  let from = 0;
  while (true) {
    const i = k7.indexOf("600", from);
    if (i < 0) break;
    console.log("\nK7 600:", k7.slice(Math.max(0, i - 80), i + 100).replace(/\s+/g, " "));
    from = i + 3;
  }

  // Fix K7 remaining boilerplate if still there
  let t7 = k7;
  const finds = [
    [
      "mit ihren insgesamt rund 600.000 aktiven Kundenkonten, als sie neben ihrer etablierten B2B-Plattform den vernetzten Privatkundentarif KlarHome vorbereitete, der intelligente",
      ", als sie den vernetzten Privatkundentarif KlarHome vorbereitete, der intelligente",
    ],
    [
      "die KlarNetz AG mit ihren insgesamt rund 600.000 aktiven Kundenkonten",
      "die KlarNetz AG",
    ],
    [
      "KlarNetz AG mit ihren insgesamt rund 600.000 aktiven Kundenkonten",
      "KlarNetz AG",
    ],
  ] as const;
  let n = 0;
  for (const [a, b] of finds) {
    if (t7.includes(a)) {
      t7 = t7.replaceAll(a, b);
      n += 1;
      console.log("fixed", a.slice(0, 60));
    }
  }
  if (n) {
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
  }

  // Restore K5 captions if wiped badly — check for orphaned fragments
  if (/setzen – Spalten:|Stufen-Matrix setzen|Checkliste setzen/.test(k5)) {
    console.log("\nK5 still has setzer instructions");
  }
  // If captions were fully deleted leaving awkward joins, look for double spaces / missing intros
  const odd = [...k5.matchAll(/\]\s*[A-ZÄÖÜ]|Matrix\s+Der erste|Takeaway\s+Erstens/g)];
  console.log("odd joins", odd.length);
}

main().catch(console.error);
