import { getSachbuchKontext } from "../src/lib/sachbuch/repository";
import { sachbuchKapitelBodyText } from "../src/lib/sachbuch/parse";

const ID = "1640c419-5f83-4c62-a25b-d57190727fa4";

const NEEDLES: Array<{ kap: number; needle: string }> = [
  { kap: 2, needle: "Die technische Fehlervorsorge nach dem Poka-Yoke-Prinzip" },
  { kap: 2, needle: "Poka-Yoke-Methodik unmittelbar in ausführbare" },
  { kap: 3, needle: "nach dem aus Kapitel eins bekannten Poka-Yoke-Prinzip" },
  { kap: 3, needle: "Jidoka-Prinzip, bei dem die Fertigungsstraße" },
  { kap: 4, needle: "nach dem im Fundament eingeführten Poka-Yoke-Prinzip" },
  { kap: 4, needle: "Im Lean Management existiert dafür der Gemba Walk" },
  { kap: 5, needle: "aus der schlanken Produktion bekannte 5S-Methode" },
  { kap: 5, needle: "Der fünfte Schritt der 5S-Methode" },
  { kap: 6, needle: "bereits eingeführten Poka-Yoke-Prinzips" },
  { kap: 6, needle: "bereits eingeführten 5S-Systematik" },
  { kap: 6, needle: "durch das Jidoka-Prinzip beherrschbar" },
  { kap: 6, needle: "Validierungsgate nach dem Jidoka-Prinzip" },
  { kap: 7, needle: "bekannten 5S-Ordnungsschema" },
  { kap: 7, needle: "Jidoka-Prinzips sofort die Reißleine" },
  { kap: 9, needle: "ordnet den Wissensspeicher nach den 5S-Prinzipien" },
  { kap: 9, needle: "aus Kapitel 5 bekannten 5S-Kriterien" },
];

async function main() {
  const book = await getSachbuchKontext(ID);
  for (const a of NEEDLES) {
    const t = sachbuchKapitelBodyText(book!.kapitel[a.kap - 1]!);
    const i = t.indexOf(a.needle);
    console.log(`\n======== K${a.kap} ${a.needle.slice(0, 50)} ========`);
    if (i < 0) {
      console.log("NOT FOUND");
      continue;
    }
    let start = t.lastIndexOf("\n\n", i);
    if (start < 0 || i - start > 500) start = Math.max(0, i - 100);
    else start += 2;
    let end = t.indexOf("\n\n", i + a.needle.length);
    if (end < 0 || end - i > 900) end = Math.min(t.length, i + 700);
    console.log(t.slice(start, end));
  }
}

main();
