import { getSachbuchKontext } from "../src/lib/sachbuch/repository";
import { sachbuchKapitelBodyText } from "../src/lib/sachbuch/parse";

const ID = "1640c419-5f83-4c62-a25b-d57190727fa4";

async function main() {
  const book = await getSachbuchKontext(ID);
  if (!book) throw new Error("missing");

  // chapter reviews / gaps mentioning typos
  for (let i = 0; i < book.kapitel.length; i++) {
    const k = book.kapitel[i]!;
    const rev = k.manuscript?.review ?? k.critique ?? null;
    const blob = JSON.stringify(rev ?? {}).toLowerCase();
    if (/tipp|typo|flüchtig|schreibfehler|tatslich|konsequenz|unschärfe|begrifflich/.test(blob)) {
      console.log(`\n===== K${i + 1} critique mentions =====`);
      console.log(JSON.stringify(rev, null, 2).slice(0, 2500));
    }
  }

  // lean re-intros K4-K9
  const leanNeedles = [
    "Muda",
    "Poka-Yoke",
    "Poka Yoke",
    "5S",
    "Gemba",
    "Verschwendung",
    "Lean",
  ];
  for (let i = 3; i < book.kapitel.length; i++) {
    const t = sachbuchKapitelBodyText(book.kapitel[i]!);
    console.log(`\n===== K${i + 1} LEAN HITS =====`);
    for (const n of leanNeedles) {
      let from = 0;
      let c = 0;
      while (c < 3) {
        const j = t.indexOf(n, from);
        if (j < 0) break;
        if (c === 0 || n === "Muda" || n === "Poka-Yoke" || n === "Gemba") {
          console.log(`${n}@${j}:`, JSON.stringify(t.slice(Math.max(0, j - 60), j + 140)));
        }
        from = j + n.length;
        c++;
      }
      if (c) console.log(`  count ${n}: ${c}${c >= 3 ? "+" : ""}`);
    }
  }

  // K2 / K8 endings
  for (const kap of [2, 8]) {
    const t = sachbuchKapitelBodyText(book.kapitel[kap - 1]!);
    console.log(`\n===== K${kap} END (800) =====`);
    console.log(JSON.stringify(t.slice(-900)));
  }

  // scan all chapters for common typos
  for (let i = 0; i < book.kapitel.length; i++) {
    const t = sachbuchKapitelBodyText(book.kapitel[i]!);
    const hits = [
      ...t.matchAll(/\b\w{0,8}(tatslich|tatsächlch|konsequenzten|unzurenden|Verarbeitung personenbezogenen|Duchsatz|Datenschuz|Privcy)\w{0,8}\b/gi),
    ].map((m) => m[0]);
    if (hits.length) console.log(`typos K${i + 1}:`, hits);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
