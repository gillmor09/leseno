/**
 * Close K1 residual blockers for a honest 10: align pyramid terminology with PVT.
 * Usage: npx tsx --env-file=.env.local scripts/tmp-fix-k1-for-10.ts
 */
import { scoreSachbuchKapitelManuscript } from "../src/lib/sachbuch/manuscript";
import {
  getSachbuchKontext,
  patchSachbuchKapitel,
} from "../src/lib/sachbuch/repository";
import { sachbuchKapitelBodyText } from "../src/lib/sachbuch/parse";

const ID = "1640c419-5f83-4c62-a25b-d57190727fa4";

async function main() {
  const book = await getSachbuchKontext(ID);
  if (!book) throw new Error("missing");
  const k = book.kapitel[0]!;
  let text = sachbuchKapitelBodyText(k);
  const before = text;

  const swaps: Array<{ find: string; to: string }> = [
    {
      find: "folgt dieses Buch einer dreistufigen Qualitäts- und Wertschöpfungspyramide, der VDP-Pyramide, die uns als strukturelle Landkarte dient.",
      to: "folgt dieses Buch einer dreistufigen Qualitäts- und Wertschöpfungspyramide — der Qualitäts-Pyramide des Privacy Value Thinking —, die uns als strukturelle Landkarte dient.",
    },
    {
      find: "Abbildung 1: Die dreistufige VDP-Pyramide – Organisatorisches und risikobasiertes Fundament (Kapitel 1–2), Methodischer Motor (Kapitel 3–6) und Sichtbares Kundenergebnis (Kapitel 7–8) mit integrierter Gesamtsteuerung (Kapitel 9)",
      to: "Abbildung 1: Die dreistufige Qualitäts-Pyramide des Privacy Value Thinking – Organisatorisches und risikobasiertes Fundament (Kapitel 1–2), Methodischer Motor (Kapitel 3–6) und Sichtbares Kundenergebnis (Kapitel 7–8) mit integrierter Gesamtsteuerung (Kapitel 9)",
    },
    {
      find: "an der Spitze der VDP-Pyramide systematisch einsetzt",
      to: "an der Spitze dieser Qualitäts-Pyramide systematisch einsetzt",
    },
    {
      find: "Steht dieser erste Teil des Fundaments der VDP-Pyramide aus klaren Geschäftszielen",
      to: "Steht dieser erste Teil des Fundaments der Qualitäts-Pyramide des Privacy Value Thinking aus klaren Geschäftszielen",
    },
  ];

  for (const s of swaps) {
    if (!text.includes(s.find)) {
      console.log("MISS:", s.find.slice(0, 90));
      continue;
    }
    text = text.split(s.find).join(s.to);
    console.log("OK:", s.find.slice(0, 70));
  }

  if (text.includes("VDP-Pyramide")) {
    console.log("WARN leftover VDP-Pyramide count:", (text.match(/VDP-Pyramide/g) || []).length);
  }

  if (text !== before) {
    const now = new Date().toISOString();
    await patchSachbuchKapitel(ID, k.id, {
      manuscript: {
        ...k.manuscript,
        improvedText: text,
        draftText: k.manuscript.draftText || before,
        improvedAt: now,
      },
      updatedAt: now,
    });
    console.log("saved improvedText");
  } else {
    console.log("no text change");
  }

  console.log("\nRe-scoring K1…");
  const scored = await scoreSachbuchKapitelManuscript({
    sachbuchId: ID,
    kapitelId: k.id,
  });
  const m = scored.kapitel[0]!.manuscript;
  console.log("score:", m.salesScore);
  console.log("gaps:", m.gaps.length, m.gaps);
  console.log("orders:", m.changeOrders.length, m.changeOrders);
  console.log("summary:", m.scoreSummary?.slice(0, 400));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
