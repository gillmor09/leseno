/**
 * Age-appropriate knowledge guidance for facts research and Warum?/Hintergrund.
 * Injected as `{{age_guidance_block}}` — stage bands, not story mood/genre.
 */

import type { StorySchoolStageId } from "@/lib/stories/options";

export type KnowledgePromptMode = "facts" | "explain" | "explain_more";

type KnowledgeBand = "early" | "mid" | "late";

function knowledgeBandForSchoolStage(stage: StorySchoolStageId): KnowledgeBand {
  if (
    stage === "vorschule" ||
    stage === "klasse_1" ||
    stage === "klasse_2"
  ) {
    return "early";
  }
  if (stage === "klasse_3" || stage === "klasse_4") {
    return "mid";
  }
  return "late";
}

/** Precise age hint for prompts (finer than the 5–7 / 8–10 length groups). */
export function preciseAgeLabelForSchoolStage(
  stage: StorySchoolStageId,
): string {
  switch (stage) {
    case "vorschule":
      return "ca. 5–6 Jahre";
    case "klasse_1":
      return "ca. 6–7 Jahre";
    case "klasse_2":
      return "ca. 7–8 Jahre";
    case "klasse_3":
      return "ca. 8–9 Jahre";
    case "klasse_4":
      return "ca. 9–10 Jahre";
    case "hoeher":
      return "ca. 10–12 Jahre";
    default:
      return "Grundschulalter";
  }
}

function factsRules(band: KnowledgeBand): string[] {
  if (band === "early") {
    return [
      "[ALTERSGERECHTE FAKTEN — VORSCHULE BIS 2. KLASSE (VERBINDLICH)]",
      "Zielgruppe: Kinder ca. 5–8 Jahre. Ein Fakt = eine klare Beobachtung, die man sich vorstellen kann.",
      "1. SPRACHE: kurze Sätze, Alltagsdeutsch. Keine Fachwörter (außer ganz einfache wie „Mond“, „Vulkan“).",
      "2. KONKRET: lieber Größe, Farbe, Verhalten, Vergleich („so groß wie …“, „so warm wie …“) als abstrakte Zahlenketten.",
      "3. ZAHLEN: nur grob und kindlich („etwa“, „oft“, „viele“) — keine Formeln, keine Laborwerte, keine Prozentketten.",
      "4. URSACHE: höchstens ein ganz einfacher „weil …“-Gedanke. Keine Ketten aus Physik/Chemie.",
      "5. VERBOTEN: Angstmachen (Katastrophen, Verletzungen, Tod), Erwachsenensarkasmus, Lexikon-Stil, Wikipedia-Dichte.",
      "6. LÄNGE: 1 kurzer Satz pro Fakt (max. ca. 18 Wörter).",
    ];
  }
  if (band === "mid") {
    return [
      "[ALTERSGERECHTE FAKTEN — 3./4. KLASSE (VERBINDLICH)]",
      "Zielgruppe: Kinder ca. 8–10 Jahre. Fakten dürfen etwas genauer sein, bleiben aber kindgerecht.",
      "1. SPRACHE: klare deutsche Sätze. Fachwörter nur, wenn du sie im selben Satz mit Alltagsbild erklärst.",
      "2. KONKRET + URSACHE: ein Fakt darf eine einfache Ursache nennen („weil …“), aber keine Vorlesungs-Erklärung.",
      "3. ZAHLEN: eine verständliche Zahl ist ok (z. B. Temperatur, Größe) — keine Formeln und keine Messreihen.",
      "4. VERBOTEN: Angstmachen, reiner Lexikon-Ton, Erwachsenen-Jargon ohne Erklärung.",
      "5. LÄNGE: 1–2 kurze Sätze pro Fakt.",
    ];
  }
  return [
    "[ALTERSGERECHTE FAKTEN — AB 5. KLASSE / HÖHER (VERBINDLICH)]",
    "Zielgruppe: ca. 10–12 Jahre. Mehr Präzision erlaubt — aber immer verständlich und neugierig, nie akademisch.",
    "1. SPRACHE: klar und lebendig. Fachbegriff nur mit kurzer Alltags-Erklärung im selben Fakt.",
    "2. ZUSAMMENHANG: einfache Mechanismen ok (Druck, Wärme, Anpassung) — keine Uni-Modelle und keine Formelwände.",
    "3. ZAHLEN: präzisere Angaben ok, wenn sie greifbar bleiben.",
    "4. VERBOTEN: Angstmachen, Paper-Stil, unnötige Fremdwörter.",
    "5. LÄNGE: 1–2 Sätze, informativ aber nicht dicht wie ein Lexikon-Eintrag.",
  ];
}

function explainRules(band: KnowledgeBand, deeper: boolean): string[] {
  const title = deeper
    ? "[ALTERSGERECHTES HINTERGRUNDWISSEN — VERTIEFUNG (VERBINDLICH)]"
    : "[ALTERSGERECHTES WARUM? — ERKLÄRUNG (VERBINDLICH)]";

  if (band === "early") {
    return [
      title,
      "Erkläre so, dass ein Kind aus Vorschule–2. Klasse wirklich versteht — nicht wie für Eltern.",
      "1. EINE HAUPTURSACHE: Nur den wichtigsten Grund. Keine zweite Wissenschaftsebene.",
      "2. ALLTAGSVERGLEICH: Mindestens ein Bild aus dem Alltag (Körper, Spielplatz, Küche, Tiere, Wetter).",
      "3. SPRACHE: kurze Sätze, bekannte Wörter. Fachwort höchstens einmal — und sofort kindlich erklären.",
      "4. TIEFE: " +
        (deeper
          ? "Ein kleiner Schritt weiter als der erste Hintergrund — immer noch sehr konkret, keine neuen Fachketten."
          : "Bleib nah am Fakt. Keine Extra-Themen, die das Kind überfordern."),
      "5. TON: ruhig, klar, freundlich-sachlich. Keine Witze-Pflicht, keine Quizfragen, kein „Du solltest …“.",
      "6. LÄNGE: " +
        (deeper ? "2–3 sehr kurze Absätze." : "2 kurze Absätze."),
      "7. VERBOTEN: Formeln, Prozentketten, Katastrophen-Details, Moralpredigt.",
    ];
  }
  if (band === "mid") {
    return [
      title,
      "Erkläre für 3./4. Klasse: neugierig und klar, ohne Schulbuch-Dichte.",
      "1. URSACHE + ZUSAMMENHANG: Eine nachvollziehbare Kette (Ursache → Wirkung), maximal zwei Schritte.",
      "2. BILDHAFT: Ein greifbarer Vergleich hilft — aber nicht kindisch übertreiben.",
      "3. SPRACHE: Fachwörter nur mit kurzer Erklärung. Keine Schachtelsätze.",
      "4. TIEFE: " +
        (deeper
          ? "Zusätzliche Details und ein weiterer Zusammenhang — aber altersgerecht, kein Lexikon-Dump."
          : "Genug, um „Warum?“ zu beantworten — nicht alles, was es zum Thema gibt."),
      "5. TON: neutral-sachlich, ohne Genre/Stimmung der Geschichte.",
      "6. LÄNGE: " +
        (deeper ? "2–4 kurze Absätze." : "2–3 kurze Absätze."),
      "7. VERBOTEN: Angstmachen, Formeln, unnötige Fremdwörter, Belehrungston.",
    ];
  }
  return [
    title,
    "Erkläre für ca. 10–12 Jahre: präziser, aber weiterhin kindgerecht und greifbar.",
    "1. MECHANISMUS: Du darfst den Kernmechanismus nennen — klar und schrittweise, nicht als Vorlesung.",
    "2. SPRACHE: Fachbegriff ok, wenn sofort verständlich gemacht. Kein Paper-Ton.",
    "3. TIEFE: " +
      (deeper
        ? "Vertiefe mit Kontext, Grenzen oder typischen Missverständnissen — ohne Überforderung."
        : "Beantworte „Warum?“ gründlich, aber fokussiert."),
    "4. TON: ruhig, klar, neugierig-sachlich — unabhängig von Geschichtsgenre.",
    "5. LÄNGE: " +
      (deeper ? "3–5 kurze Absätze." : "2–4 kurze Absätze."),
    "6. VERBOTEN: Angstmachen, Formelwände, akademischer Jargon ohne Erklärung.",
  ];
}

/**
 * Prompt block for facts research / Warum? / Mehr wissen.
 * Always non-empty — these stages must stay age-capped.
 */
export function buildAgeAppropriateKnowledgeBlock(
  schoolStage: StorySchoolStageId,
  mode: KnowledgePromptMode,
): string {
  const band = knowledgeBandForSchoolStage(schoolStage);
  const lines =
    mode === "facts"
      ? factsRules(band)
      : explainRules(band, mode === "explain_more");
  return lines.join("\n");
}
