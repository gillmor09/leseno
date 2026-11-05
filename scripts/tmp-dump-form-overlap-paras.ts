import { getSachbuchKontext } from "../src/lib/sachbuch/repository";
import { sachbuchKapitelBodyText } from "../src/lib/sachbuch/parse";

const ID = "1640c419-5f83-4c62-a25b-d57190727fa4";

const NEEDLES: Array<{ kap: number; needle: string }> = [
  { kap: 4, needle: "aus verständlichem Misstrauen weichen viele auf fingierte Angaben" },
  { kap: 4, needle: "Überladene Formulare führen nicht nur zum Kaufabbruch" },
  { kap: 4, needle: "mit erfundenen Dummy-Angaben vergiften" },
  { kap: 6, needle: "Auflösung des Conversion-Mythos" },
  { kap: 6, needle: "jede formale Hürde im Erfassungsformular drücke automatisch die Conversion-Rate" },
  { kap: 6, needle: "provisorische Dummy-Telefonnummern" },
  { kap: 6, needle: "Luke Wroblewski" },
  { kap: 8, needle: "temporäre Wegwerf-E-Mail-Adressen" },
  { kap: 8, needle: "schutz die Konversionsrate des eigentlichen Verkaufsprozesses" },
  { kap: 8, needle: "Formular-Entschlackung gelernt hatte" },
  { kap: 8, needle: "Schein-Konversionen, vergiften die Datenqualität" },
];

async function main() {
  const book = await getSachbuchKontext(ID);
  for (const a of NEEDLES) {
    const t = sachbuchKapitelBodyText(book!.kapitel[a.kap - 1]!);
    const i = t.indexOf(a.needle);
    console.log(`\n======== K${a.kap} :: ${a.needle.slice(0, 55)} ========`);
    if (i < 0) {
      console.log("NOT FOUND");
      continue;
    }
    let start = t.lastIndexOf("\n\n", i);
    if (start < 0 || i - start > 600) start = Math.max(0, i - 80);
    else start += 2;
    let end = t.indexOf("\n\n", i + a.needle.length);
    if (end < 0 || end - i > 1200) end = Math.min(t.length, i + 900);
    console.log(t.slice(start, end));
  }
}

main();
