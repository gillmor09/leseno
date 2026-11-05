/**
 * Clarify Canvas = Kompass (one tool) vs Risiko-Ampel (triage),
 * rename Kap-8 fairness check, add Shift-Left Merksatz in Fast-Track-Katalog.
 *
 * Usage: npx tsx --env-file=.env.local scripts/tmp-clarify-canvas-kompass-ampel.ts
 */
import {
  getSachbuchKontext,
  patchSachbuchKapitel,
} from "../src/lib/sachbuch/repository";

const ID = "1640c419-5f83-4c62-a25b-d57190727fa4";

const MERKSATZ_SHIFT_LEFT =
  "Shift Left heißt: Datenschutz-Verantwortung gehört in den wertschöpfenden Fachbereich — Standardarbeit am Ort der Entscheidung, kein Freigabe-Pingpong mit der Rechtsabteilung.";

const MERKSATZ_BOX = `<<<BOX merksatz>>>

${MERKSATZ_SHIFT_LEFT}

<<<END BOX>>>
`;

const MERKSATZ_PLAIN = `Merksatz: ${MERKSATZ_SHIFT_LEFT}

`;

/** Shared replacements for improved / herstellung / final (Kap 1). */
const K1_SHARED: Array<[string, string]> = [
  [
    "Das Privacy Solution Canvas und der Sechs-Fragen-Kompass",
    "Privacy Solution Canvas und Sechs-Fragen-Kompass: ein Werkzeug",
  ],
  [
    "Damit das Canvas nicht zur nächsten bürokratischen Ausfüllübung verkommt, wird es in der Praxis direkt über den Sechs-Fragen-Prozesskompass befüllt. Dieser Kompass dockt unmittelbar in der frühen Konzeptphase sowie bei der Verfeinerung des Produkt-Backlogs an und koppelt jedes der sechs Felder auf dem Canvas zwingend an ein operatives Qualitätskriterium. Fachbereich, Softwareentwicklung und Datenschutzverantwortliche klären anhand dieser sechs Leitfragen gemeinsam die Architektur des Vorhabens; die nachfolgenden sechs Zwischenüberschriften bilden dabei exakt die sechs Felder der Canvas-Grafik im Detail ab.",
    "Canvas und Sechs-Fragen-Prozesskompass sind dabei kein Doppelpack zweier Systeme, sondern zwei Gesichter desselben Werkzeugs: Das Canvas ist das einseitige Arbeitsblatt mit sechs Architekturfeldern; der Kompass sind die sechs Leitfragen, mit denen genau diese Felder befüllt und im Backlog sowie in der Definition of Done geprüft werden. Dieser Kompass dockt unmittelbar in der frühen Konzeptphase sowie bei der Verfeinerung des Produkt-Backlogs an und koppelt jedes Feld zwingend an ein operatives Qualitätskriterium. Fachbereich, Softwareentwicklung und Datenschutzverantwortliche klären anhand dieser sechs Leitfragen gemeinsam die Architektur des Vorhabens; die nachfolgenden sechs Zwischenüberschriften bilden dabei exakt die sechs Felder der Canvas-Grafik im Detail ab.",
  ],
  [
    "Die wahre Durchschlagskraft entfaltet das Privacy Solution Canvas in Kombination mit einer standardisierten Risiko-Ampel.",
    "Die Risiko-Ampel ist kein drittes Architekturblatt und auch kein Alias für den Kompass, sondern die Steuerungslogik daneben: Sie entscheidet, wie tief geprüft wird. Die Durchschlagskraft entsteht erst, wenn das Privacy Solution Canvas — also die sechs Kompass-Fragen auf einem Blatt — mit dieser standardisierten Ampel gekoppelt wird.",
  ],
];

const K1_DRAFT: Array<[string, string]> = [
  [
    "Privacy Solution Canvas. Angelehnt an bewährte Lean-Vorlagen versammelt dieser Blueprint sechs operative Felder auf einem einzigen Arbeitsblatt, noch bevor die IT die erste Zeile Code schreibt oder Datenstrukturen anlegt. Fachbereich, Softwareentwicklung und Datenschutzverantwortliche klären gemeinsam:",
    "Privacy Solution Canvas — und mit ihm der Sechs-Fragen-Prozesskompass. Beides ist ein Werkzeug, keine zwei Systeme: Das Canvas ist das einseitige Arbeitsblatt, der Kompass sind die sechs Leitfragen zu denselben Feldern. Angelehnt an bewährte Lean-Vorlagen versammelt dieser Blueprint sechs operative Felder auf einem einzigen Arbeitsblatt, noch bevor die IT die erste Zeile Code schreibt oder Datenstrukturen anlegt. Fachbereich, Softwareentwicklung und Datenschutzverantwortliche klären gemeinsam:",
  ],
  [
    "Sechs-Fragen-Prozesskompass. Er dockt direkt in der Product Discovery sowie im Backlog Refinement an und koppelt jedes Schutzprinzip an ein operatives Qualitätswerkzeug.",
    "Sechs-Fragen-Prozesskompass — denselben sechs Feldern des Canvas. Er dockt direkt in der Product Discovery sowie im Backlog Refinement an und koppelt jedes Schutzprinzip an ein operatives Qualitätswerkzeug.",
  ],
  [
    "Risiko-Ampel. Die meisten datenschutzrelevanten Vorgänge sind keine neuartigen Experimente, sondern wiederkehrende Standardmuster:",
    "Risiko-Ampel. Sie ist nicht Teil des Canvas, sondern die Triage daneben: Grün, Gelb oder Rot entscheidet, wie tief das Team die sechs Kompass-Fragen durchdeklinieren muss. Die meisten datenschutzrelevanten Vorgänge sind keine neuartigen Experimente, sondern wiederkehrende Standardmuster:",
  ],
];

const K8_RENAME: Array<[string, string]> = [
  [
    "<<<BOX onepager Sechs-Fragen-Prozesskompass>>>",
    "<<<BOX onepager Sechs-Fragen-Fairness-Check>>>",
  ],
  [
    "Infokasten: Der Sechs-Fragen-Prozesskompass für das Sprint-Review",
    "Infokasten: Der Sechs-Fragen-Fairness-Check für das Sprint-Review",
  ],
  [
    "der Sechs-Fragen-Prozesskompass als festes Akzeptanzkriterium",
    "der Sechs-Fragen-Fairness-Check als festes Akzeptanzkriterium",
  ],
  [
    "Der Sechs-Fragen-Prozesskompass für das Sprint-Review",
    "Der Sechs-Fragen-Fairness-Check für das Sprint-Review",
  ],
  // Remaining generic mentions in Kap 8 context (fairness / UI), not Kap-1 tool.
  [
    "Sechs-Fragen-Prozesskompass",
    "Sechs-Fragen-Fairness-Check",
  ],
];

function applyReps(
  input: string,
  reps: Array<[string, string]>,
): { text: string; hits: number } {
  let text = input;
  let hits = 0;
  for (const [a, b] of reps) {
    if (!text.includes(a)) continue;
    const n = text.split(a).length - 1;
    text = text.split(a).join(b);
    hits += n;
  }
  return { text, hits };
}

function insertFastTrackMerksatz(
  input: string,
  mode: "box" | "plain",
): { text: string; hits: number } {
  if (input.includes(MERKSATZ_SHIFT_LEFT)) {
    return { text: input, hits: 0 };
  }
  const anchor =
    "direkt in den ausführenden Fachbereich. Genau hier greift das Instrument standardisierter Arbeitsanweisungen";
  if (!input.includes(anchor)) {
    return { text: input, hits: 0 };
  }
  const insert =
    mode === "box"
      ? `direkt in den ausführenden Fachbereich.\n\n${MERKSATZ_BOX}\nGenau hier greift das Instrument standardisierter Arbeitsanweisungen`
      : `direkt in den ausführenden Fachbereich.\n\n${MERKSATZ_PLAIN}Genau hier greift das Instrument standardisierter Arbeitsanweisungen`;
  return {
    text: input.split(anchor).join(insert),
    hits: 1,
  };
}

/** Draft Fast-Track wording differs slightly — insert after Verantwortung sentence if present. */
function insertFastTrackMerksatzDraft(input: string): {
  text: string;
  hits: number;
} {
  if (input.includes(MERKSATZ_SHIFT_LEFT)) {
    return { text: input, hits: 0 };
  }
  // Prefer shared anchor if present.
  const shared = insertFastTrackMerksatz(input, "plain");
  if (shared.hits) return shared;

  const alt =
    "Fast-Track-Katalog übersetzt diese Erkenntnis in operative Wenn-dann-Regeln.";
  if (!input.includes(alt)) return { text: input, hits: 0 };
  return {
    text: input.split(alt).join(`${MERKSATZ_PLAIN}${alt}`),
    hits: 1,
  };
}

async function patchKapitel1() {
  const book = await getSachbuchKontext(ID);
  if (!book) throw new Error("Buch nicht gefunden");
  const kap = book.kapitel[0];
  if (!kap) throw new Error("Kapitel 1 fehlt");

  let draft = applyReps(kap.manuscript.draftText, K1_DRAFT);
  const draftMerk = insertFastTrackMerksatzDraft(draft.text);
  draft = { text: draftMerk.text, hits: draft.hits + draftMerk.hits };

  let improved = applyReps(kap.manuscript.improvedText, K1_SHARED);
  const impMerk = insertFastTrackMerksatz(improved.text, "plain");
  improved = { text: impMerk.text, hits: improved.hits + impMerk.hits };

  let herstellung = applyReps(kap.manuscript.herstellungText, K1_SHARED);
  const hMerk = insertFastTrackMerksatz(herstellung.text, "box");
  herstellung = { text: hMerk.text, hits: herstellung.hits + hMerk.hits };

  let finalText = applyReps(kap.finalText ?? "", K1_SHARED);
  const fMerk = insertFastTrackMerksatz(finalText.text, "plain");
  finalText = { text: fMerk.text, hits: finalText.hits + fMerk.hits };

  const total =
    draft.hits + improved.hits + herstellung.hits + finalText.hits;
  if (total === 0) {
    console.log("Kap 1: keine Treffer");
    return;
  }

  await patchSachbuchKapitel(ID, kap.id, {
    finalText: finalText.text,
    manuscript: {
      ...kap.manuscript,
      draftText: draft.text,
      improvedText: improved.text,
      herstellungText: herstellung.text,
    },
    updatedAt: new Date().toISOString(),
  });

  console.log(
    JSON.stringify({
      kap: 1,
      draft: draft.hits,
      improved: improved.hits,
      herstellung: herstellung.hits,
      final: finalText.hits,
      hasMerksatzH: herstellung.text.includes(MERKSATZ_SHIFT_LEFT),
      hasClarifyH: herstellung.text.includes(
        "zwei Gesichter desselben Werkzeugs",
      ),
      hasAmpelH: herstellung.text.includes("kein drittes Architekturblatt"),
    }),
  );
}

async function patchKapitel8() {
  const book = await getSachbuchKontext(ID);
  if (!book) throw new Error("Buch nicht gefunden");
  const kap = book.kapitel[7];
  if (!kap) throw new Error("Kapitel 8 fehlt");

  const draft = applyReps(kap.manuscript.draftText, K8_RENAME);
  const improved = applyReps(kap.manuscript.improvedText, K8_RENAME);
  const herstellung = applyReps(kap.manuscript.herstellungText, K8_RENAME);
  const finalText = applyReps(kap.finalText ?? "", K8_RENAME);

  const total =
    draft.hits + improved.hits + herstellung.hits + finalText.hits;
  if (total === 0) {
    console.log("Kap 8: keine Treffer (schon umbenannt?)");
    return;
  }

  await patchSachbuchKapitel(ID, kap.id, {
    finalText: finalText.text,
    manuscript: {
      ...kap.manuscript,
      draftText: draft.text,
      improvedText: improved.text,
      herstellungText: herstellung.text,
    },
    updatedAt: new Date().toISOString(),
  });

  console.log(
    JSON.stringify({
      kap: 8,
      draft: draft.hits,
      improved: improved.hits,
      herstellung: herstellung.hits,
      final: finalText.hits,
      leftoverH:
        herstellung.text.split("Sechs-Fragen-Prozesskompass").length - 1,
      fairnessH:
        herstellung.text.split("Sechs-Fragen-Fairness-Check").length - 1,
    }),
  );
}

async function main() {
  await patchKapitel1();
  await patchKapitel8();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
