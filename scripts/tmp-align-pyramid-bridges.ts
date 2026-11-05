/**
 * Align Kap.2/3 closings with Kap.1 architecture:
 * Fundament = Kap.1 · methodischer Motor = Kap.2–6 · Kundenergebnis = Kap.7–8.
 * Also strip restored Monday-morning advisor tails.
 *
 * Usage: npx tsx --env-file=.env.local scripts/tmp-align-pyramid-bridges.ts
 */
import { getSachbuchKontext, patchSachbuchKapitel } from "../src/lib/sachbuch/repository";
import {
  countSachbuchWords,
  sachbuchKapitelBodyText,
} from "../src/lib/sachbuch/parse";

const ID = "1640c419-5f83-4c62-a25b-d57190727fa4";

const K2_FROM = "Mit dieser nahtlosen Verzahnung von menschlichem Schutzbedarf";
const K2_CLOSING = `Mit dieser nahtlosen Verzahnung von menschlichem Schutzbedarf und betrieblicher Ausfallsicherheit ist die erste Station des methodischen Motors justiert: Risiken für Menschen werden nicht mehr als abzeichenbares Restrisiko behandelt, sondern als Qualitätsfehler im Datenfluss. Die drei tragenden Grundpfeiler greifen dabei in etablierte Managementsysteme: Das Prinzip der Rechtmäßigkeit fungiert als robuster Filter und klare Eintrittsbedingung im Enterprise Risk Management; die Rechenschaftspflicht verankert Qualitätslenkung über Frühwarnindikatoren und den PDCA-Zyklus; Integrität und Vertraulichkeit setzen bauliche Vorgaben über gestaffelte Architekturen und automatisierte Kontrollpunkte direkt in den Arbeitsabläufen.

Wer den Schutz des Individuums als primäres Qualitätskriterium für den unternehmensweiten Datenfluss verankert, schützt den Betrieb dauerhaft vor Stillständen, Reputationsverlusten und toxischen Datenschulden. Doch Risikosteuerung allein füllt den Motor noch nicht: Ohne klare Verantwortung, schlanke Nachweiswege und technische Gates bleibt die Ampel Theorie. Genau dort setzt das nächste Kapitel an – weiterhin im methodischen Motor der VDP-Pyramide: Verantwortung organisieren, ohne ein Bürokratie-Monster zu bauen.`;

const K3_FROM =
  "Mit diesem ersten geschlossenen Regelkreis aus klarer Linienverantwortung";
/** Also catch older closing variants / advisor intros. */
const K3_FROM_ALTS = [
  "Mit diesem ersten geschlossenen Regelkreis aus klarer Linienverantwortung",
  "Mit Audit by Design, klarer RACI-Verantwortung und technischen Gates ruht das Fundament",
  "Wo Sie am Montag beginnen",
  "Erstens, am Montag",
  "Drittens, am Freitag:",
];

const K3_CLOSING = `Mit diesem geschlossenen Regelkreis aus klarer Linienverantwortung, schlanker Triage und technischer Verriegelung läuft der methodische Motor nicht mehr auf Papier, sondern auf beherrschten Nachweisketten. Audit by Design, RACI und harte Gates machen Rechenschaft zur Betriebsfähigkeit – mitten in der Motor-Ebene der VDP-Pyramide, die die Kapitel zwei bis sechs tragen.

Auf dieser Basis kann die nächste Station des Motors ihre kaufmännische Kraft entfalten: die methodische Verschlankung der Datenbestände durch konsequente Datenminimierung und automatisierte Speicherbegrenzung direkt im laufenden Arbeitsfluss.`;

function earliestIndex(body: string, markers: string[]): number {
  let best = -1;
  for (const m of markers) {
    const i = body.indexOf(m);
    if (i < 0) continue;
    if (best < 0 || i < best) best = i;
  }
  return best;
}

async function main() {
  const book = await getSachbuchKontext(ID);
  if (!book) throw new Error("missing");
  const results: Array<{
    kap: number;
    ok: boolean;
    note: string;
    wordsBefore: number;
    wordsAfter: number;
  }> = [];

  // --- Kap 2 ---
  {
    const k = book.kapitel[1]!;
    const before = sachbuchKapitelBodyText(k);
    const idx = before.indexOf(K2_FROM);
    // Also cut any Monday plan that might sit before the bridge
    const montag = before.indexOf("Drei Schritte für den Montagmorgen");
    let cut = idx;
    if (montag >= 0 && (idx < 0 || montag < idx)) cut = montag;
    // Prefer cutting at bridge start if present (includes removing montag after)
    if (idx >= 0) cut = idx;

    if (cut < 0) {
      results.push({
        kap: 2,
        ok: false,
        note: "bridge/montag marker missing",
        wordsBefore: countSachbuchWords(before),
        wordsAfter: countSachbuchWords(before),
      });
    } else {
      const text =
        `${before.slice(0, cut).replace(/\s+$/g, "")}\n\n${K2_CLOSING}\n`.replace(
          /\n{3,}/g,
          "\n\n",
        );
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
      results.push({
        kap: 2,
        ok: true,
        note: cut === idx ? "rewrote bridge, dropped montag tail" : "cut montag+bridge",
        wordsBefore: countSachbuchWords(before),
        wordsAfter: countSachbuchWords(text),
      });
    }
  }

  // --- Kap 3 ---
  {
    const k = book.kapitel[2]!;
    const before = sachbuchKapitelBodyText(k);
    // Prefer cutting at first advisor day-step if restored, else at fundament closing
    const dayStep = earliestIndex(before, [
      "Erstens, am Montag",
      "Wo Sie am Montag beginnen",
      "Drittens, am Freitag:",
      "Beenden Sie noch in dieser Woche",
    ]);
    const fundIdx = earliestIndex(before, [
      K3_FROM,
      "Mit Audit by Design, klarer RACI-Verantwortung und technischen Gates ruht das Fundament",
      "ruht das Fundament der Qualitäts-Pyramide",
    ]);
    let cut = -1;
    let note = "";
    if (dayStep >= 0 && (fundIdx < 0 || dayStep < fundIdx)) {
      // find paragraph start of advisor block — often intro before Erstens
      const intro = before.lastIndexOf(
        "Sie müssen am kommenden Montag",
        dayStep,
      );
      const intro2 = before.lastIndexOf("Wo Sie am Montag", dayStep);
      const intro3 = before.lastIndexOf(
        "um unnötige Prozessverschwendung abstellen",
        dayStep,
      );
      cut = [intro, intro2, intro3, dayStep]
        .filter((i) => i >= 0)
        .reduce((a, b) => Math.min(a, b));
      // snap to paragraph
      const para = before.lastIndexOf("\n\n", cut);
      if (para >= 0 && cut - para < 600) cut = para + 2;
      note = "removed advisor + rewrote motor bridge";
    } else if (fundIdx >= 0) {
      cut = fundIdx;
      note = "rewrote fundament→motor bridge";
    }

    if (cut < 0) {
      results.push({
        kap: 3,
        ok: false,
        note: "no cut marker",
        wordsBefore: countSachbuchWords(before),
        wordsAfter: countSachbuchWords(before),
      });
    } else {
      const text =
        `${before.slice(0, cut).replace(/\s+$/g, "")}\n\n${K3_CLOSING}\n`.replace(
          /\n{3,}/g,
          "\n\n",
        );
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
      results.push({
        kap: 3,
        ok: true,
        note,
        wordsBefore: countSachbuchWords(before),
        wordsAfter: countSachbuchWords(text),
      });
    }
  }

  // Soft-check Kap 1 announcement still says 2–6
  {
    const body = sachbuchKapitelBodyText(book.kapitel[0]!);
    const ok = body.includes("Kapiteln zwei bis sechs");
    results.push({
      kap: 1,
      ok,
      note: ok
        ? "announcement intact: Motor = Kap.2–6"
        : "WARNING: Kap.1 motor range missing",
      wordsBefore: countSachbuchWords(body),
      wordsAfter: countSachbuchWords(body),
    });
  }

  console.log(JSON.stringify(results, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
