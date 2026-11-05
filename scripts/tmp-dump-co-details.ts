import { getSachbuchKontext } from "../src/lib/sachbuch/repository";
import { sachbuchKapitelBodyText } from "../src/lib/sachbuch/parse";

const ID = "1640c419-5f83-4c62-a25b-d57190727fa4";

async function main() {
  const book = await getSachbuchKontext(ID);
  if (!book) throw new Error("missing");

  // Kap1 pyramid assignment
  {
    const body = sachbuchKapitelBodyText(book.kapitel[0]!);
    for (const n of [
      "Kapiteln zwei bis sechs",
      "Kapitel zwei",
      "strategischen Fundament",
      "methodische Motor",
      "Kapitel 2",
      "Kapitel drei bis",
    ]) {
      let from = 0;
      let c = 0;
      while (c < 3) {
        const i = body.indexOf(n, from);
        if (i < 0) break;
        console.log(`K1[${n}]`, body.slice(Math.max(0, i - 100), i + 220).replace(/\s+/g, " "));
        console.log("---");
        from = i + n.length;
        c += 1;
      }
    }
  }

  for (const kap of [2, 5, 9]) {
    const body = sachbuchKapitelBodyText(book.kapitel[kap - 1]!);
    console.log(`\n######## K${kap} SATZ / PLACEHOLDER ########`);
    const re =
      /Für den Buchsatz[^.!?]*[.!?]|Auch hier gilt für den Buchsatz[^.!?]*[.!?]|deren Satzanfänge im Druckbild[^.!?]*[.!?]|\[Abbildung[^\]]*\]|\[Tabelle[^\]]*\]|\[Platzhalter[^\]]*\]|Werkzeugkasten|QR-Code|Montagmorgen/gi;
    let m: RegExpExecArray | null;
    const copy = new RegExp(re.source, re.flags);
    while ((m = copy.exec(body))) {
      console.log(
        "@",
        m.index,
        body.slice(Math.max(0, m.index - 40), m.index + m[0].length + 80).replace(/\s+/g, " "),
      );
    }
  }

  // KlarNetz boilerplate samples Kap3-9
  console.log("\n######## KLARNETZ BOILERPLATE ########");
  for (let i = 2; i < 9; i += 1) {
    const body = sachbuchKapitelBodyText(book.kapitel[i]!);
    const re = /KlarNetz AG[^.!?\n]{0,200}(600[.\s]?000|KlarHome|Kundenkonten)/gi;
    let m: RegExpExecArray | null;
    const copy = new RegExp(re.source, re.flags);
    let c = 0;
    while ((m = copy.exec(body)) && c < 2) {
      console.log(`K${i + 1}:`, m[0].replace(/\s+/g, " ").slice(0, 220));
      c += 1;
    }
  }
}

main().catch(console.error);
