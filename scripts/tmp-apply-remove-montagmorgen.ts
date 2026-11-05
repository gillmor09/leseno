/**
 * Remove Monday-morning / advisor action-plan closings from Kap 2–9.
 * Keep conceptual bridges; drop "tun Sie am Montag"-Ratgeber.
 *
 * Usage: npx tsx --env-file=.env.local scripts/tmp-apply-remove-montagmorgen.ts
 */
import { getSachbuchKontext, patchSachbuchKapitel } from "../src/lib/sachbuch/repository";
import {
  countSachbuchWords,
  sachbuchKapitelBodyText,
} from "../src/lib/sachbuch/parse";

const ID = "1640c419-5f83-4c62-a25b-d57190727fa4";

type Cut = {
  /** Start of block to remove (inclusive). */
  from: string;
  /**
   * If set: keep everything from this marker onward (inside the old tail).
   * If unset: drop everything from `from` to end, then append `closing`.
   */
  keepFrom?: string;
  /** Optional natural closing when the cut goes to EOF. */
  closing?: string;
};

const CUTS: Record<number, Cut> = {
  2: {
    from: "Drei Schritte für den Montagmorgen",
    keepFrom: "Mit dieser nahtlosen Verzahnung von menschlichem Schutzbedarf",
  },
  3: {
    from: "Wo Sie am Montag beginnen: Der Drei-Schritte-Quick-Start",
    closing:
      "Mit Audit by Design, klarer RACI-Verantwortung und technischen Gates ruht das Fundament der Qualitäts-Pyramide nicht mehr auf geduldigem Papier, sondern auf beherrschten Nachweisketten. Auf dieser Basis kann die methodische Verschlankung der Datenbestände ihre Kraft entfalten: durch 5S-Hygiene, Datenminimierung und automatisierte Speicherbegrenzung im laufenden Arbeitsfluss.",
  },
  4: {
    from: "Warten Sie nicht auf das nächste große Umstrukturierungsprojekt oder die nächste Prüfung, um diesen Hebel in Ihrer Organisation umzulegen.",
    keepFrom:
      "Privacy Value Thinking liefert das strategische Fundament für diesen unternehmerischen Kulturwandel",
  },
  5: {
    from: "Praxis-Checkliste: Operative Löschfähigkeit in 90 Tagen verankern",
    // before already ends with bridge to next chapter
  },
  6: {
    from: "Was am Montagmorgen zählt: Der operative Startpunkt für fehlerfreie Datenströme",
    keepFrom:
      "Hier schließt sich der Kreis zum übergeordneten Mindset des Privacy Value Thinking:",
    // After keepFrom para, drop the "Wenn Sie diese Transformation..." advisor — handled via endAfter
  },
  7: {
    from: "Was Sie am nächsten Montagmorgen konkret tun können",
    // before already has strong close
  },
  8: {
    from: "Um diesen Anspruch ohne juristischen Ballast direkt in Ihre eigene Organisation zu tragen, können Sie bereits in der kommenden Arbeitswoche mit vier konkreten, operativen Schritten beginnen.",
    closing:
      "Wer dieses Werkzeugsystem an den Schnittstellen verankert, schützt Margen und Ertragsbasis nachhaltig: symmetrisches Design, valide Einwilligungen und verzögerungsfreie Widerrufe werden vom Bremsklotz zum Motor für Produktqualität, niedrigere Servicekosten und profitables Wachstum.",
  },
  9: {
    from: "Warten Sie nicht auf das nächste externe Audit, die nächste Kundenprüfung im Vertrieb oder den nächsten Beinahe-Vorfall in Ihren KI-Systemen.",
    // chapter already has substance; no extra CTA
  },
};

function applyCut(body: string, cut: Cut): { text: string; ok: boolean; note: string } {
  const start = body.indexOf(cut.from);
  if (start < 0) return { text: body, ok: false, note: `missing from: ${cut.from.slice(0, 60)}` };

  if (cut.keepFrom) {
    const keepIdx = body.indexOf(cut.keepFrom, start);
    if (keepIdx < 0) {
      return { text: body, ok: false, note: `missing keepFrom: ${cut.keepFrom.slice(0, 60)}` };
    }
    let kept = body.slice(keepIdx);
    // Kap 6: keep only the first conceptual paragraph, drop advisor that follows
    if (cut.from.includes("Montagmorgen zählt")) {
      const endPara = kept.indexOf("\n\n");
      if (endPara >= 0) {
        const afterFirst = kept.slice(endPara + 2);
        if (afterFirst.startsWith("Wenn Sie diese Transformation")) {
          kept = kept.slice(0, endPara);
        }
      }
    }
    const head = body.slice(0, start).replace(/\n{3,}$/g, "\n\n");
    return { text: `${head}${kept}`.replace(/\n{3,}/g, "\n\n").trimEnd() + "\n", ok: true, note: "kept bridge" };
  }

  const head = body.slice(0, start).replace(/\s+$/g, "");
  const closing = cut.closing?.trim() ?? "";
  const text = closing
    ? `${head}\n\n${closing}\n`
    : `${head}\n`;
  return { text: text.replace(/\n{3,}/g, "\n\n"), ok: true, note: closing ? "cut+closing" : "cut-to-eof" };
}

async function main() {
  const book = await getSachbuchKontext(ID);
  if (!book) throw new Error("missing");
  const results: Array<{
    kap: number;
    title: string;
    ok: boolean;
    note: string;
    wordsBefore: number;
    wordsAfter: number;
  }> = [];

  for (let i = 0; i < book.kapitel.length; i += 1) {
    const cut = CUTS[i + 1];
    if (!cut) continue;
    const k = book.kapitel[i]!;
    const before = sachbuchKapitelBodyText(k);
    const { text, ok, note } = applyCut(before, cut);
    if (ok && text !== before) {
      const now = new Date().toISOString();
      await patchSachbuchKapitel(ID, k.id, {
        manuscript: {
          ...k.manuscript,
          improvedText: text,
          improvedAt: now,
        },
        finalText: text,
        updatedAt: now,
      });
    }
    results.push({
      kap: i + 1,
      title: k.title,
      ok,
      note,
      wordsBefore: countSachbuchWords(before),
      wordsAfter: countSachbuchWords(ok ? text : before),
    });
  }

  console.log(JSON.stringify(results, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
