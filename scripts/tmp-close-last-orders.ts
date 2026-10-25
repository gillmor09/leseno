/**
 * Close remaining manuscript orders: tighten Kap4/5 re-defs + ConnectTel Copilot arc.
 * Layout/Satz orders stay production-side.
 */
import { scoreSachbuchBookManuscript } from "../src/lib/sachbuch/manuscript";
import { countSachbuchWords } from "../src/lib/sachbuch/parse";
import {
  getSachbuchKontext,
  patchSachbuchKapitel,
} from "../src/lib/sachbuch/repository";

const ID = "1640c419-5f83-4c62-a25b-d57190727fa4";

function mustReplace(
  text: string,
  old: string,
  neu: string,
  label: string,
): string {
  if (!text.includes(old)) throw new Error(`${label}: nicht gefunden`);
  if (text.split(old).length - 1 !== 1) {
    throw new Error(`${label}: ${text.split(old).length - 1}×`);
  }
  return text.replace(old, neu);
}

async function patch(i: number, text: string) {
  const book = await getSachbuchKontext(ID);
  if (!book) throw new Error("missing");
  const k = book.kapitel[i]!;
  const now = new Date().toISOString();
  await patchSachbuchKapitel(ID, k.id, {
    finalText: text,
    manuscript: { ...k.manuscript, improvedText: text, improvedAt: now },
    updatedAt: now,
  });
  console.log(`Kap${i + 1} words`, countSachbuchWords(text));
}

async function main() {
  let book = await getSachbuchKontext(ID);
  if (!book) throw new Error("missing");

  // --- Kap 4: tighten ROT + Muda re-gloss ---
  let t4 = book.kapitel[3]!.manuscript.improvedText;
  t4 = mustReplace(
    t4,
    "den sogenannten ROT-Daten. Was redundant, obsolet oder trivial ist und keinerlei gesetzlichen Aufbewahrungsfristen unterliegt, fliegt vom Server.",
    "den ROT-Daten: Was keinerlei gesetzlichen Aufbewahrungsfristen unterliegt, fliegt vom Server.",
    "K4 ROT",
  );
  t4 = mustReplace(
    t4,
    "als massive operative Verschwendung, in der Lean-Lehre als Muda der Überbearbeitung bekannt.",
    "als massive operative Verschwendung – klassisches Muda der Überbearbeitung.",
    "K4 Muda",
  );
  await patch(3, t4);

  // --- Kap 5: tighten Muda/Poka/Databerg + ConnectTel Copilot arc ---
  book = (await getSachbuchKontext(ID))!;
  let t5 = book.kapitel[4]!.manuscript.improvedText;

  t5 = mustReplace(
    t5,
    "das unklassifizierte, überflüssige personenbezogene Datum – Prozessverschwendung, im Lean Management als Muda bezeichnet, in Reinform –, das durch nachlässiges Prozessdesign",
    "das unklassifizierte, überflüssige personenbezogene Datum – Muda in Reinform –, das durch nachlässiges Prozessdesign",
    "K5 Muda",
  );
  t5 = mustReplace(
    t5,
    "fungiert hier als Poka Yoke der modernen Informationsverarbeitung, also als technische und organisatorische Fehlersicherung:",
    "fungiert hier als Poka Yoke der modernen Informationsverarbeitung:",
    "K5 Poka Datenminimierung",
  );
  t5 = mustReplace(
    t5,
    "Wie wir in Kapitel 1 anhand des Databerg-Reports gesehen haben, ist der Großteil typischer Unternehmensbestände operativ nutzloser Ballast.",
    "Wie in Kapitel 1 gezeigt, ist der Großteil typischer Unternehmensbestände operativ nutzloser Ballast.",
    "K5 Databerg",
  );
  t5 = mustReplace(
    t5,
    "Im industriellen Qualitätsmanagement verhindert das Prinzip des Poka Yoke menschliche Fehlbedienungen durch konstruktive Zwangsläufigkeit – etwa durch asymmetrische Stecker, die sich schlichtweg nicht verkehrt herum in eine Buchse pressen lassen. In einer modernen IT-Architektur für künstliche Intelligenz übernimmt ein zentrales internes KI-Gateway exakt diese unbestechliche Wächterfunktion.",
    "Ein zentrales internes KI-Gateway übernimmt genau diese Poka-Yoke-Wächterfunktion für künstliche Intelligenz.",
    "K5 Poka Gateway",
  );

  t5 = mustReplace(
    t5,
    "Aus dem einstigen Deal-Killer Datenschutz war ein schlagkräftiges Verkaufsargument im Wettbewerb geworden.\n\nWie überlebenswichtig diese tiefe Prozesshygiene war, zeigte sich in der dritten Ausbaustufe, als ConnectTel",
    "Aus dem einstigen Deal-Killer Datenschutz war ein schlagkräftiges Verkaufsargument im Wettbewerb geworden.\n\nZuerst schaltete ConnectTel auf genau diesem Fundament den Kundenservice-Copiloten live: SharePoint, Tickets und Wissensartikel waren nach den Sprints aus den Kapiteln 1 bis 4 bereinigt und zweckgebunden – ohne Schatten-Uploads, ohne Trainingsabfluss und ohne das Augenrollen aus den Konferenzräumen vom Buchanfang. Erst als dieser Assistenzbetrieb messbar sicher lief, wagte das Unternehmen den nächsten Schritt.\n\nWie überlebenswichtig diese tiefe Prozesshygiene war, zeigte sich in der dritten Ausbaustufe, als ConnectTel",
    "K5 ConnectTel Copilot-Bogen",
  );

  await patch(4, t5);

  console.log("=== Book score ===");
  book = await scoreSachbuchBookManuscript(ID);
  const r = book.idee.manuscriptReview;
  console.log(
    JSON.stringify(
      {
        score: r.salesScore,
        summary: r.scoreSummary,
        gaps: r.gaps,
        orders: r.changeOrders,
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
