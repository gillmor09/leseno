/**
 * Anti-KI prose rules for greenfield Roman.
 *
 * Author-facing text is POSITIVE ONLY (no banned-phrase examples).
 * Naming forbidden templates in prompts primes Luna to produce them.
 * Detection / rejection lives in {@link detectNovelProseTics}.
 */

/** Short label for UI / logs. */
export const NOVEL_PROSE_GUARDRAILS_VERSION = "2026-10-probe-v5";

/**
 * Mandatory Do's — merged into Styleguide; also the production target for Luna.
 */
export const NOVEL_MANDATORY_PROSE_DOS: string[] = [
  "Kapitel und Szenen enden in der laufenden Situation: Handlung, offener Faden, Körper/Sinnesdetail oder ruhiger Weiterlauf — ohne Bedeutungs-Resume am Schluss.",
  "Jedes Kapitelende anders gestalten als die vorherigen (andere Geste, anderer Fokus).",
  "Satzlängen und Absatzenden bewusst ungleich halten (kurz neben lang); längere Sätze sind willkommen — Kurzprosa nicht erzwingen.",
  "Konkrete Verben, Orte, Zeitdruck, Gesten; lieber eine präzise Wahrnehmung als Bilderreigen.",
  "Leitmotive und Rituale nur an Wendepunkten — nicht als Kapitel-Routine.",
  "Mittelteil: jedes Kapitel bringt eine neue Eskalation (Zeitdruck, Ort, Info, Konflikt), keine reine Wiederholung derselben Arbeit.",
  "Vollständige Szenen schreiben; keine Auslassungen oder Platzhalter.",
  "Nach einem starken Moment weitergehen, ohne die Bedeutung noch einmal auszusprechen.",
  "Figurenstimmen hörbar unterscheiden: mindestens eine Figur spricht in längeren, charakteristischen Sätzen.",
  "Neue Information aus Dokumenten/Bildschirmen einmal zeigen und sofort in Handlung oder Entscheidung übersetzen.",
  "Ursache vor Wirkung: Befund/Prüfergebnis vor Vergleich; Anordnung vor Ergebnis.",
  "Schlussphase als Konflikt-Szene tragen — nicht als Protokollkette.",
];

/**
 * Short Dont's without syntactic templates (no quote-examples that prime the tic).
 */
export const NOVEL_MANDATORY_PROSE_DONTS: string[] = [
  "Kein Motto-/Pointen-Schluss am Kapitelende.",
  "Kein Verneinungs-Staccato als Dauer-Rhythmus.",
  "Keine serielle Vermenschlichung von Objekten und Abstrakta.",
  "Keine gleichförmigen Vergleichsketten als Absatz-Takt.",
  "Keine Nachsätze, die eine bereits gesetzte Wirkung noch erklären.",
  "Keine eckigen Auslassungen oder TODO-Lücken im Manuskript.",
  "Keine Kapitel, die nur denselben Verfahrens-/Notiz-Takt wiederholen.",
  "Keine Kapitelenden, die nur aus Blick, Schweigen oder Stillstand bestehen.",
  "Keine Dialogszenen, in denen alle Figuren im gleichen Kurzstil antworten.",
  "Kein serielle „Das ist …“-Antworttakt über mehrere Figuren.",
  "Keine Kapitel, die nur Dokumentations- und Protokollgesten aneinanderreihen.",
];

/**
 * Short craft reminder for draft user prompts (voice card carries the style).
 */
export const NOVEL_AUTHOR_CHAPTER_END_REMINDER = `Schlusscheck: Ende in Handlung, Dialogfaden oder sinnlichem Detail (laut Stimmkarte), anders als frühere Kapitel — nicht nur Blick/Schweigen/Stillstand; Text vollständig ohne Platzhalter.`

/**
 * Positive craft block injected into each draft hop (no banned-phrase examples).
 */
export const NOVEL_AUTHOR_DRAFT_CRAFT = `Craft:
- Figurenstimmen unterscheiden (Satzlänge/Haltung); mindestens eine längere, charakteristische Antwort pro Dialogszene.
- Erwachsen schreiben: längere, verschachtelte Sätze und Absätze erlaubt — kein Jugendbuch-Kurzstil und keine Pflichtrunde aus Ein-Satz-Absätzen.
- Neue Info aus Texten einmal zeigen und in Handlung/Entscheidung überführen.
- Komik und Konflikt aus Verhalten und Zielkonflikt, nicht nur aus Konstatierung.
- Kein „Das ist …“-Antworttakt; kein reiner Protokoll-/Dokumentationsrhythmus in der Schlussphase.`;

/**
 * Lektor: categories only (no vivid bad templates). Enforcement is also code-side.
 */
export const NOVEL_EDITOR_ANTI_AI_CHECKLIST = `## Menschlichkeit / Schablonen-Prüfung (Pflicht)

Lehne ab (approved=false), wenn der Text schablonenhaft regelmäßig wirkt:
1. Kapitel-/Szenen-Schlüsse als Motto oder Bedeutungs-Resume
2. Dichte Verneinungs-Staccatos (auch Keine-X-keine-Y-Ketten)
3. Objekte/Abstrakta mit Körper/Absicht als Dauer-Metapher
4. Gleichförmige Vergleichsketten als Takt
5. Wirkung, die danach noch erklärt wird
6. Synonyme Steigerungs- und Emotionsketten
7. Gleichförmige Kurzrepliken aller Figuren
8. Wiederholte Lese-/Blick-/Schweige-Rituale statt neuer Handlung
9. Kapitelenden, die nur Stillstand setzen
10. Serielle „Das ist …“-Antworten und Protokoll-/Dokumentations-Gleichschritt
11. Vergleich/Abschluss ohne vorherigen Befund; Zeitsprünge gegen Ledger

Einzeln und verdient = ok. Mehrfach / regelmäßig = Ablehnung.`;

/** Merge mandatory dos/donts into a Styleguide styleRules object. */
export function mergeMandatoryProseRules(styleRules: {
  dos?: string[];
  donts?: string[];
  notes?: string;
  [key: string]: unknown;
}): {
  dos: string[];
  donts: string[];
  notes: string;
  [key: string]: unknown;
} {
  const existingDos = Array.isArray(styleRules.dos)
    ? styleRules.dos.map((x) => String(x).trim()).filter(Boolean)
    : [];
  const existingDonts = Array.isArray(styleRules.donts)
    ? styleRules.donts.map((x) => String(x).trim()).filter(Boolean)
    : [];

  const dos = [
    ...NOVEL_MANDATORY_PROSE_DOS,
    ...existingDos.filter(
      (d) =>
        !NOVEL_MANDATORY_PROSE_DOS.some(
          (m) => m.toLowerCase() === d.toLowerCase(),
        ),
    ),
  ];
  const donts = [
    ...NOVEL_MANDATORY_PROSE_DONTS,
    ...existingDonts.filter(
      (d) =>
        !NOVEL_MANDATORY_PROSE_DONTS.some(
          (m) => m.toLowerCase() === d.toLowerCase(),
        ),
    ),
  ];

  const stamp = `Anti-KI-Guardrails ${NOVEL_PROSE_GUARDRAILS_VERSION} (positiv + Code-Gate).`;
  const notes = [String(styleRules.notes ?? "").trim(), stamp]
    .filter(Boolean)
    .join("\n");

  return {
    ...styleRules,
    dos,
    donts,
    notes,
  };
}
