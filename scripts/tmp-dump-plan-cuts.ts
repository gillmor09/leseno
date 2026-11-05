/**
 * Dump pre-context + full advisor tails for precise cuts.
 */
import { writeFileSync } from "node:fs";
import { getSachbuchKontext } from "../src/lib/sachbuch/repository";
import { sachbuchKapitelBodyText } from "../src/lib/sachbuch/parse";

const ID = "1640c419-5f83-4c62-a25b-d57190727fa4";

/** Earliest unique start marker of the advisor closing block per chapter. */
const CUT: Record<number, string> = {
  2: "Drei Schritte für den Montagmorgen",
  3: "Erstens: Starten Sie mit einer radikalen 5S-Entrümpelung",
  4: "Starten Sie noch in dieser Woche mit drei konkreten, sofort wirksamen Schritten",
  5: "Praxis-Checkliste: Operative Löschfähigkeit in 90 Tagen verankern",
  6: "Was am Montagmorgen zählt:",
  7: "Was Sie am nächsten Montagmorgen konkret tun können",
  8: "Verankern Sie den Prozesskompass",
  9: "Warten Sie nicht auf das nächste externe Audit",
};

async function main() {
  const book = await getSachbuchKontext(ID);
  if (!book) throw new Error("missing");
  const out: Record<
    string,
    { marker: string; idx: number; before: string; tail: string; wordsTail: number }
  > = {};

  for (const [kapStr, marker] of Object.entries(CUT)) {
    const kap = Number(kapStr);
    const body = sachbuchKapitelBodyText(book.kapitel[kap - 1]!);
    let idx = body.indexOf(marker);
    // Kap 3: marker may vary — search alternatives
    if (idx < 0 && kap === 3) {
      const alts = [
        "Erstens: Starten Sie mit einer radikalen 5S-Entrümpelung",
        "um unnötige Prozessverschwendung abstellen und das tragfähige Fundament",
        "Schritt 1: 5S-Entrümpelung des Dokumentationsbestands",
        "Beenden Sie noch in dieser Woche die unproduktive Praxis",
      ];
      for (const a of alts) {
        const i = body.indexOf(a);
        if (i >= 0) {
          idx = i;
          out[`K${kap}`] = {
            marker: a,
            idx: i,
            before: body.slice(Math.max(0, i - 500), i),
            tail: body.slice(i),
            wordsTail: body.slice(i).split(/\s+/).length,
          };
          break;
        }
      }
      continue;
    }
    if (idx < 0 && kap === 8) {
      // find last imperative closing
      const i = body.lastIndexOf("Verankern Sie");
      if (i >= 0) {
        out[`K${kap}`] = {
          marker: "Verankern Sie…",
          idx: i,
          before: body.slice(Math.max(0, i - 500), i),
          tail: body.slice(i),
          wordsTail: body.slice(i).split(/\s+/).length,
        };
      }
      continue;
    }
    if (idx < 0) {
      out[`K${kap}`] = {
        marker,
        idx: -1,
        before: body.slice(-400),
        tail: "",
        wordsTail: 0,
      };
      continue;
    }
    // For Kap 3/4, may need to cut earlier to include intro sentence
    let cut = idx;
    if (kap === 4) {
      const earlier = body.lastIndexOf(
        "um diesen Hebel in Ihrer Organisation umzulegen",
        idx,
      );
      if (earlier >= 0 && idx - earlier < 200) {
        // include the sentence start — find paragraph start
        const para = body.lastIndexOf("\n\n", earlier);
        cut = para >= 0 ? para + 2 : earlier;
      }
    }
    if (kap === 3) {
      const para = body.lastIndexOf("\n\n", idx);
      // look for section intro containing "Fundament für Audit"
      const intro = body.lastIndexOf("Fundament für Audit by Design", idx);
      if (intro >= 0) {
        const p = body.lastIndexOf("\n\n", intro);
        cut = p >= 0 ? p + 2 : intro;
      } else if (para >= 0 && idx - para < 800) {
        cut = para + 2;
      }
    }
    out[`K${kap}`] = {
      marker,
      idx: cut,
      before: body.slice(Math.max(0, cut - 450), cut),
      tail: body.slice(cut),
      wordsTail: body.slice(cut).split(/\s+/).length,
    };
  }

  writeFileSync("scripts/tmp-plan-cuts.json", JSON.stringify(out, null, 2), "utf8");
  for (const [k, v] of Object.entries(out)) {
    console.log(
      `${k}: idx=${v.idx} tailWords=${v.wordsTail} marker="${v.marker.slice(0, 50)}"`,
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
