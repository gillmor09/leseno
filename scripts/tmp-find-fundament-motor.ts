import { getSachbuchKontext } from "../src/lib/sachbuch/repository";
import { sachbuchKapitelBodyText } from "../src/lib/sachbuch/parse";

const ID = "1640c419-5f83-4c62-a25b-d57190727fa4";

async function main() {
  const book = await getSachbuchKontext(ID);
  if (!book) throw new Error("missing");

  // Kap 1: architecture announcement
  {
    const body = sachbuchKapitelBodyText(book.kapitel[0]!);
    for (const n of [
      "methodischen Motor",
      "Kapitel 2",
      "Kapitel 2 bis",
      "Kapiteln 2",
      "mittlere Ebene",
      "Fundament der",
      "Pyramide",
      "Teil B",
      "operativen Motor",
    ]) {
      let from = 0;
      let c = 0;
      while (c < 5) {
        const idx = body.indexOf(n, from);
        if (idx < 0) break;
        console.log(`K1 [${n}]`, body.slice(Math.max(0, idx - 100), idx + 220).replace(/\s+/g, " "));
        console.log("---");
        from = idx + n.length;
        c += 1;
      }
    }
  }

  for (const kap of [2, 3, 4]) {
    const body = sachbuchKapitelBodyText(book.kapitel[kap - 1]!);
    console.log(`\n======== K${kap} ARCH HITS ========`);
    for (const n of [
      "Fundament",
      "methodischen Motor",
      "operativen Motor",
      "Motor der Pyramide",
      "nächsten Kapitel",
      "Werkshalle",
      "erste Ebene",
      "mittlere Ebene",
      "Verschlankung",
      "Qualitäts-Pyramide",
    ]) {
      let from = 0;
      let c = 0;
      while (c < 4) {
        const idx = body.indexOf(n, from);
        if (idx < 0) break;
        console.log(`[${n}]`, body.slice(Math.max(0, idx - 90), idx + 200).replace(/\s+/g, " "));
        console.log("---");
        from = idx + n.length;
        c += 1;
      }
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
