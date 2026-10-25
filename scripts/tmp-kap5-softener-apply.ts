/**
 * Softener before Kap-5 technical climb (Copilot/RAG/Vektor), then book rescore.
 */
import { scoreSachbuchBookManuscript } from "../src/lib/sachbuch/manuscript";
import { countSachbuchWords } from "../src/lib/sachbuch/parse";
import {
  getSachbuchKontext,
  patchSachbuchKapitel,
} from "../src/lib/sachbuch/repository";

const ID = "1640c419-5f83-4c62-a25b-d57190727fa4";

const ANCHOR =
  "Das Scheitern der schönen neuen KI-Welt beginnt fast ausnahmslos tief im Maschinenraum der betrieblichen Datenhaltung.\n\nModerne Assistenzsysteme wie Microsoft 365 Copilot";

const REPLACEMENT =
  "Das Scheitern der schönen neuen KI-Welt beginnt fast ausnahmslos tief im Maschinenraum der betrieblichen Datenhaltung.\n\nWer als Geschäftsführerin oder Geschäftsführer kein Architekturdiagramm lesen will, braucht es an dieser Stelle auch nicht. Die folgenden Seiten erklären die Technik nur so weit, wie sie Kosten, Haftung und Freigabegeschwindigkeit verändert – nicht, weil Sie Vektordatenbanken bauen sollen, sondern weil Sie entscheiden müssen, welche Daten überhaupt in die Suche und in den Chat dürfen. Die Mittelstands-Abkürzung am Kapitelende zeigt später den Weg ohne eigenes DevOps-Team; zuerst zählt das Steuerungsprinzip.\n\nModerne Assistenzsysteme wie Microsoft 365 Copilot";

async function main() {
  const book = await getSachbuchKontext(ID);
  if (!book) throw new Error("missing");
  const k = book.kapitel[4]!;
  let t = k.manuscript.improvedText;
  if (!t.includes(ANCHOR)) throw new Error("anchor not found");
  if (t.includes("kein Architekturdiagramm lesen will")) {
    console.log("softener already present");
  } else {
    t = t.replace(ANCHOR, REPLACEMENT);
    const now = new Date().toISOString();
    await patchSachbuchKapitel(ID, k.id, {
      finalText: t,
      manuscript: { ...k.manuscript, improvedText: t, improvedAt: now },
      updatedAt: now,
    });
    console.log("Kap5 words", countSachbuchWords(t));
  }

  console.log("=== Book score ===");
  const scored = await scoreSachbuchBookManuscript(ID);
  const r = scored.idee.manuscriptReview;
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
