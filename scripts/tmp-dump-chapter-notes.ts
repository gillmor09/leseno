import { getSachbuchKontext } from "../src/lib/sachbuch/repository";
import { sachbuchKapitelBodyText } from "../src/lib/sachbuch/parse";

const ID = "1640c419-5f83-4c62-a25b-d57190727fa4";

async function main() {
  const book = await getSachbuchKontext(ID);
  if (!book) throw new Error("missing");

  console.log("book gaps:", JSON.stringify(book.idee.manuscriptReview.gaps ?? [], null, 2).slice(0, 2000));
  console.log("scoreSummary:", book.idee.manuscriptReview.scoreSummary?.slice(0, 500));

  for (const kap of [2, 4, 5, 6, 7, 8, 9]) {
    const k = book.kapitel[kap - 1]!;
    console.log(`\n===== K${kap} manuscript keys =====`, Object.keys(k.manuscript ?? {}));
    const m = k.manuscript as Record<string, unknown>;
    for (const key of ["review", "critique", "changeOrders", "gaps", "notes", "scoreSummary", "editorial"]) {
      if (m?.[key] != null) console.log(key, JSON.stringify(m[key]).slice(0, 800));
    }
    // any string field with tipp/fehler
    for (const [key, val] of Object.entries(m ?? {})) {
      const s = typeof val === "string" ? val : JSON.stringify(val);
      if (/tippfehler|Schreibfehler|tatslich|konsequenzten|Flüchtigkeit|begriffliche/i.test(s)) {
        console.log(`HIT ${key}:`, s.slice(0, 600));
      }
    }
  }

  // lean definitional passages K5-K9
  const defs = [
    /Im Lean[^.!?\n]{10,200}/g,
    /klassische[rn]? Prozessverschwendung[^.!?\n]{0,120}/g,
    /Poka-Yoke[^.!?\n]{10,180}/g,
    /5S[^.!?\n]{10,180}/g,
    /Gemba Walk[^.!?\n]{10,180}/g,
    /Verschwendungskategorien[^.!?\n]{0,100}/g,
  ];
  for (let i = 3; i < book.kapitel.length; i++) {
    const t = sachbuchKapitelBodyText(book.kapitel[i]!);
    console.log(`\n===== K${i + 1} DEF SNIPPETS =====`);
    for (const re of defs) {
      re.lastIndex = 0;
      let m;
      let c = 0;
      while ((m = re.exec(t)) && c < 4) {
        console.log(m[0]);
        c++;
      }
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
