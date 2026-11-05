import { getSachbuchKontext } from "../src/lib/sachbuch/repository";
import { sachbuchKapitelBodyText } from "../src/lib/sachbuch/parse";

const ID = "1640c419-5f83-4c62-a25b-d57190727fa4";

const NEEDLES: Array<{ kap: number; needle: string }> = [
  { kap: 3, needle: "digitales Vertrauensportal" },
  { kap: 3, needle: "neun Wochen auf zwölf Tage" },
  { kap: 3, needle: "drei Werktagen statt sechs Wochen" },
  { kap: 7, needle: "neun Wochen auf knapp zwölf Tage" },
  { kap: 8, needle: "Trust Center nützt wenig" },
  { kap: 8, needle: "Durchlaufzeiten im B2B-Verkaufszyklus" },
  { kap: 9, needle: "Self-Service Trust Center" },
  { kap: 9, needle: "5,4 auf durchschnittlich 3,4 Wochen" },
  { kap: 9, needle: "Hälfte reduzierten Bearbeitungszeit" },
  { kap: 9, needle: "28" },
];

async function main() {
  const book = await getSachbuchKontext(ID);
  for (const a of NEEDLES) {
    const t = sachbuchKapitelBodyText(book!.kapitel[a.kap - 1]!);
    const i = t.indexOf(a.needle);
    console.log(`\n======== K${a.kap} :: ${a.needle} ========`);
    if (i < 0) {
      console.log("NOT FOUND");
      continue;
    }
    let start = t.lastIndexOf("\n\n", i);
    if (start < 0 || i - start > 700) start = Math.max(0, i - 100);
    else start += 2;
    let end = t.indexOf("\n\n", i + a.needle.length);
    if (end < 0 || end - i > 1100) end = Math.min(t.length, i + 850);
    console.log(t.slice(start, end));
  }
}

main();
