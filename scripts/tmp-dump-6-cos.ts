import { getSachbuchKontext } from "../src/lib/sachbuch/repository";
import { sachbuchKapitelBodyText } from "../src/lib/sachbuch/parse";

const ID = "1640c419-5f83-4c62-a25b-d57190727fa4";

const NEEDLES: Array<{ kap: number; needle: string }> = [
  { kap: 2, needle: "Qualitäts-Pyramide" },
  { kap: 2, needle: "VDP-Pyramide" },
  { kap: 3, needle: "vierstufigen Transformationspfad" },
  { kap: 3, needle: "Vorbereitungszeit sank dadurch" },
  { kap: 5, needle: "dreistufige Architektur-Bereinigung" },
  { kap: 5, needle: "Etappe 1 (Tage 1 bis 30)" },
  { kap: 5, needle: "zweiten Jahr nach dem erfolgreichen" },
  { kap: 8, needle: "personenbezogen" },
  { kap: 6, needle: "Fehlzustellung" },
  { kap: 9, needle: "Halbierung" },
  { kap: 9, needle: "54 Prozent" },
  { kap: 9, needle: "wenige Stunden" },
  { kap: 4, needle: "5S-Systematik aus der schlanken" },
  { kap: 5, needle: "aus der schlanken Produktion bekannte 5S" },
  { kap: 7, needle: "tatslichen" },
  { kap: 9, needle: "konsequenzten" },
  { kap: 9, needle: "unzurenden" },
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
    console.log(t.slice(Math.max(0, i - 100), i + Math.min(500, a.needle.length + 400)).replace(/\s+/g, " "));
  }
}

main();
