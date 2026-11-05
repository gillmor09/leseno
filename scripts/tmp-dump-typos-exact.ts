import { getSachbuchKontext } from "../src/lib/sachbuch/repository";
import { sachbuchKapitelBodyText } from "../src/lib/sachbuch/parse";

const ID = "1640c419-5f83-4c62-a25b-d57190727fa4";

async function main() {
  const book = await getSachbuchKontext(ID);
  if (!book) throw new Error("missing");

  for (const kap of [2, 7, 8, 9]) {
    const k = book.kapitel[kap - 1]!;
    console.log(`\n===== K${kap} COs =====`);
    console.log(JSON.stringify(k.manuscript.changeOrders, null, 2));
    console.log(`===== K${kap} gaps =====`);
    console.log(JSON.stringify(k.manuscript.gaps, null, 2));
  }

  const searches: Array<{ kap: number; needles: string[] }> = [
    {
      kap: 7,
      needles: [
        "tatslich",
        "tatsächlch",
        "tatächlichen",
        "Flüchtigkeit",
        "Tippfehler",
      ],
    },
    {
      kap: 8,
      needles: [
        "Verarbeitung personenbezogenen Daten",
        "personenbezogenen Daten fällt",
        "Zusammenspiel aus Privacy Value Thinking",
        "Sicherheits- und Datenschutzprüfungen zur Sicherheit",
      ],
    },
    {
      kap: 9,
      needles: [
        "konsequenzten",
        "konsequenten",
        "unzurenden",
        "unzureichenden",
        "Agentic AI",
        "Zugriffsrechten",
      ],
    },
    {
      kap: 2,
      needles: ["VDP-Pyramide", "Qualitäts-Pyramide", "Privacy Value Thinking"],
    },
    {
      kap: 5,
      needles: ["5S-Methode als operatives Betriebssystem", "5S-Methode verankert"],
    },
    {
      kap: 6,
      needles: [
        "Im Lean-Kontext entspricht",
        "Poka-Yoke als Schnittstellen-Validierung",
        "Im klassischen Produktions- und Lean-Management",
      ],
    },
    {
      kap: 7,
      needles: ["klassische Prozessverschwendung (Muda)", "bekannten 5S-Disziplin"],
    },
  ];

  for (const { kap, needles } of searches) {
    const t = sachbuchKapitelBodyText(book.kapitel[kap - 1]!);
    console.log(`\n===== SEARCH K${kap} =====`);
    for (const n of needles) {
      const i = t.indexOf(n);
      if (i < 0) console.log("MISS", n);
      else console.log("OK", n, "=>", JSON.stringify(t.slice(Math.max(0, i - 50), i + n.length + 80)));
    }
  }

  // fuzzy typo hunt in K7 improvedText
  const t7 = sachbuchKapitelBodyText(book.kapitel[6]!);
  const odd = [...t7.matchAll(/\b[A-Za-zÄÖÜäöüß]{4,}\b/g)]
    .map((m) => m[0])
    .filter((w) => /tatslich|ätslich|konsequenz|unzur|duchs|schreib|fehlvers/.test(w.toLowerCase()));
  console.log("K7 odd words", [...new Set(odd)]);

  const t9 = sachbuchKapitelBodyText(book.kapitel[8]!);
  const odd9 = [...t9.matchAll(/\b\w*konsequ\w*\b/gi)].map((m) => m[0]);
  console.log("K9 konsequ*", [...new Set(odd9)]);
  const i = t9.indexOf("Skalierung auf Agentic");
  if (i >= 0) console.log("Agentic section:", JSON.stringify(t9.slice(i, i + 500)));
  const j = t9.indexOf("Privacy Champions");
  if (j >= 0) console.log("Champions section:", JSON.stringify(t9.slice(j, j + 500)));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
