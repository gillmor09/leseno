/**
 * Encode Teil-B compression (~50%) into Idee + Makro for chapter reassignment.
 *
 * Usage: npx tsx --env-file=.env.local scripts/tmp-apply-teil-b-compress.ts
 */
import {
  getSachbuchKontext,
  patchSachbuchBook,
} from "../src/lib/sachbuch/repository";

const ID = "1640c419-5f83-4c62-a25b-d57190727fa4";

const VOLUME_SECTION = `### 9. Volumen & Kapitel-Neuvergabe (verbindlich)
Bei der Neuvergabe / Neugenerierung der Kapitel gilt:

**Teil A (Fundament) und Teil C (Kundenergebnis):** neu schreiben. Der Lean-only-Bestand deckt sie nicht ab.

**Teil B (Motor):** Kern erhalten, aber auf **etwa 50 % des heutigen Motor-Umfangs** zusammenfassen.
- Ziel: Buchlänge beherrschbar halten; die Mitte darf sich für den Leser nicht endlos ziehen.
- Behalten: These (Privacy = Prozess-/Qualitätsfehler), KlarNetz-Anker, 6-Fragen-Prozesskompass, je ein scharfes Artefakt/Sprint-Muster, Rechte als schlanker Prozess, KPI-/Hygiene-Logik, KI als Stress-Test des Motors.
- Streichen / stark kürzen: Wiederholungsfälle, doppelte Metrik-Erklärungen, mehrfache Sprint-Durchläufe mit gleichem Didaktikmuster, redundant ausformulierte Transfer-Blöcke, ausführliche KI-Technik, wo das Prinzip schon steht.
- Didaktik: lieber **weniger Kapitel / kürzere Kapitel** in Teil B als fünf volle Motor-Kapitel hintereinander. Teil B ist die Mitte der Pyramide — kompakt und greifbar, nicht das ganze Buch.
- Richtwert für die spätere Kapitelarchitektur: Teil A und Teil C bekommen spürbares Eigengewicht; Teil B ist der dichtere, kürzere Motorblock (~½ des heutigen Manuskript-Motors), nicht der dominante Bandteil.

Reihenfolge der Arbeit: Makro/Kapitelzuschnitt zuerst an dieser Volumenregel ausrichten, dann A und C neu, B gezielt verdichten (nicht 1:1 übernehmen).`;

async function main() {
  const book = await getSachbuchKontext(ID);
  if (!book) throw new Error("Buch nicht gefunden");

  let briefing = book.idee.briefing.trim();

  // Update §8 Verhältnis zum Manuskript if present
  const verhaeltnisNew = `### 8. Verhältnis zum bestehenden Manuskript
Die vorhandenen fünf Kapitel sind die Rohbasis für **Teil B (Motor)**. Bei der Neuvergabe werden sie **nicht 1:1** übernommen, sondern auf **ca. 50 % Umfang** verdichtet (Kern + schärfste Artefakte). **Teil A** und **Teil C** entstehen neu in diesem Band. Kein Folgeband.`;

  if (/### 8\. Verhältnis[\s\S]*?(?=\n### |\n## [^#]|$)/.test(briefing)) {
    briefing = briefing.replace(
      /### 8\. Verhältnis[\s\S]*?(?=\n### |\n## [^#]|$)/,
      `${verhaeltnisNew}\n\n`,
    );
  } else {
    briefing = `${briefing}\n\n${verhaeltnisNew}`;
  }

  if (/### 9\. Volumen[\s\S]*?(?=\n### |\n## [^#]|$)/.test(briefing)) {
    briefing = briefing.replace(
      /### 9\. Volumen[\s\S]*?(?=\n### |\n## [^#]|$)/,
      `${VOLUME_SECTION}\n\n`,
    );
  } else {
    briefing = `${briefing.trim()}\n\n${VOLUME_SECTION}`;
  }

  const stages = book.makro.stages.map((s) => {
    if (s.key === "implementierung") {
      return {
        ...s,
        title:
          "Teil B — Motor (kompakt, ~50 %): Zweckbindung, Minimierung, Lifecycle, Richtigkeit",
        promise:
          "Der Leser betreibt einen verdichteten Lean-Privacy-Motor: weniger Zufluss, sauberer Bestand, Poka-Yoke, Rechte und Hygiene — ohne dass die Buchmitte ausufert.",
        notes: `KERN BEHALTEN, UMFANG HALBIEREN (~50 % des heutigen Motor-Manuskripts). Bei Kapitel-Neuvergabe: weniger/kürzere Motor-Kapitel; Doppelungen und wiederholte Sprint-Didaktik streichen. Behalten: Kompass, je ein scharfes Artefakt (Zufluss/Sprint/Bestand/Rechte/KPI), KlarNetz-Anker, KI nur als Stress-Test. Labels: Muda, 5S/DLM, Zero Defects. Teil B ist dichter Mittelblock — nicht der dominante Bandteil; Raum für neu zu schreibendes Teil A und Teil C.`,
      };
    }
    if (s.key === "framework") {
      return {
        ...s,
        notes: `${s.notes.trim()} Bei Neuvergabe: volles Eigengewicht neben dem verdichteten Teil B — neu schreiben, nicht aus Lean-Kapiteln „mitlesen“.`,
      };
    }
    if (s.key === "zukunft") {
      return {
        ...s,
        notes: `${s.notes.trim()} Bei Neuvergabe: volles Eigengewicht neben dem verdichteten Teil B — neu schreiben; Gesamtschau/Matrix hier, nicht in die Motor-Mitte ziehen.`,
      };
    }
    return s;
  });

  const stilExtra =
    "Kapitel-Neuvergabe: Teil A und C neu; Teil B Kern behalten und auf ca. 50 % des bisherigen Motor-Umfangs verdichten — Mitte darf sich nicht endlos ziehen.";

  const stilbibel = book.stilbibel.includes("Teil B Kern behalten")
    ? book.stilbibel
    : [book.stilbibel.trim(), stilExtra].filter(Boolean).join("\n\n");

  await patchSachbuchBook(ID, {
    stilbibel,
    idee: { ...book.idee, briefing: briefing.trim() + "\n" },
    makro: { ...book.makro, stages },
  });

  const done = await getSachbuchKontext(ID);
  if (!done) throw new Error("reload failed");
  const bStage = done.makro.stages.find((s) => s.key === "implementierung");
  console.log(
    JSON.stringify(
      {
        hasVolumenSection: done.idee.briefing.includes("### 9. Volumen"),
        has50: done.idee.briefing.includes("50 %"),
        teilBTitle: bStage?.title,
        teilBNotesHead: bStage?.notes.slice(0, 180),
        stilbibelHas50: done.stilbibel.includes("50 %"),
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
