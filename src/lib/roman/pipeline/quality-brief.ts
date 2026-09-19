/**
 * Quality bar + generous context clips for the Buch pipeline.
 * Prefer consistency and depth over token thrift.
 */

/** Hard cap for critique / dimension / Leser-Feedback action items. */
export const ROMAN_CRITIQUE_FOCUS_MAX = 3;

/**
 * Shared focus rules for Gegenlesen, Dimensions-Analyse, Leser-Feedback.
 * Prevents laundry lists and nice-to-have noise.
 */
export const ROMAN_CRITIQUE_FOCUS_MANDATE = `Fokus (verbindlich — gegen Verwässerung):
- Maximal ${ROMAN_CRITIQUE_FOCUS_MAX} Kritik-/Änderungspunkte. Weniger ist besser, wenn weniger wirklich zählt.
- Nur Substanz: Logik, Motivation, Spannungsbogen, Versprechen, Regelverstöße, dramaturgische Löcher — kein Nice-to-have, kein Feinschliff-Geschmack, keine kosmetischen Stilwünsche.
- Jeder Punkt braucht eine Wichtigkeit: „kritisch“ (bricht Lesen/Logik/Versprechen), „wichtig“ (spürbarer Qualitätsmangel), „nice_to_have“ (optionaler Schliff).
- „nice_to_have“ NUR wenn es KEINE kritischen und KEINE wichtigen Punkte mehr gibt — dann klar so kennzeichnen, nicht als Pflicht verkaufen.
- Reihenfolge streng: kritisch zuerst, dann wichtig, zuletzt ggf. nice_to_have.
- Lieber 1–2 harte Punkte als ${ROMAN_CRITIQUE_FOCUS_MAX} weiche.`;

/**
 * Calmer bar for Fanbase / Testleser Leser-Feedback (not Lektor-Gegenlesen).
 * Prefer selective praise + only changes that really hurt reading — avoid
 * endless revise loops.
 */
export const ROMAN_LESERS_FEEDBACK_MANDATE = `Leser-Feedback (selektiv — gegen Endlosschleifen):
- Du bist Stammleser:in, kein Lektor: Änderungswünsche nur, wenn etwas das Weiterlesen spürbar stört (Logikbruch, Motivationsloch, Versprechen gebrochen, Spannung tot).
- Maximal 2 Änderungsaufträge. 0 ist erlaubt und erwünscht, wenn das Stück insgesamt trägt.
- Kein „immer noch besser machen“, kein Feinschliff, kein Stil-Nörgeln, keine Geschmacksfragen.
- Nice-to-have nur, wenn es wirklich gar nichts Härteres gibt — und klar als optional kennzeichnen.
- Wenn du weiterlesen würdest: sag das klar; erfinde keine Pflicht-Nacharbeit nur um „kritisch“ zu wirken.
- Innere Logik und Kontinuität zählen — aber kleine Unebenheiten, die den Lesefluss nicht brechen, ignorieren.`;

/** Shared excellence mandate appended to draft/critique system prompts. */
export const ROMAN_EXCELLENCE_MANDATE = `Qualitätsanspruch (verbindlich):
- Das Ergebnis muss über der üblichen KI-„Mitte“ liegen: kein austauschbares Genre-Mittelmaß.
- Prüfe und schreibe auf Logiklöcher, Motivationsschwächen, Spannungshänger, Klischees und vorhersehbare Wendungen.
- Bevorzuge konkrete, eigenständige Entscheidungen (Figuren, Weltregeln, Plot-Beats), die zu Genre UND Zielgruppe passen, aber aus der Masse herausragen.
- Innere Logik und Kontinuität haben Vorrang vor stilistischem Feinschliff.
- Vermeide die in der Marktanalyse genannten häufigsten Konkurrenz-Schwächen (ohne separate Bedürfnis-MUSS-Pflicht).
- Wenn Richtungen/Leserversprechen gesetzt sind (z. B. spannend, lustig, motivierend): diese sind verbindlich für Ton, Pacing und Belohnung — nicht verwässern.
- Jede Figur braucht erkennbare Eigenwilligkeit; jede Weltregel muss dramaturgisch genutzt werden.
- Keine leeren Superlative („fesselnd“, „einzigartig“) ohne Beleg im Material.
- Bei Widersprüchen zwischen Artefakten: früheste Ursache benennen und beheben, nicht übergehen.`;

/**
 * Knallharte Pflicht für jedes Gegenlesen / jede Kritik / jeden Vorschlags-Lauf.
 * Append after ROMAN_EXCELLENCE_MANDATE on critique system prompts.
 */
export const ROMAN_CRITIQUE_HARD_CHECK = `Knallharte Pflichtprüfung (Gegenlesen / Kritik / Vorschläge) — nicht optional:
1. Regeln: Prüfe EXPLIZIT, ob das Geprüfte Basis-Regeln, harte Verlagsregeln, Richtungen/Leserversprechen und Zielgruppe/Buchtyp einhält. Verstöße = kritischer Mangel.
2. Logik & Kontinuität: Keine Plotlöcher, Widersprüche zu Figuren/Ort/Fakten oder unglaubwürdige Motivation — Lücken benennen.
3. Antwort-Pflicht: eigener Abschnitt „Regel- & Logik-Check“ mit je klarer Bewertung erfüllt / teilweise / fehlt für (a) Regeln, (b) Logik — plus ein Satz Beleg oder Lücke.
4. Wenn (1) oder (2) fehlt: KEINE Freigabe / kein „reicht so“; Nacharbeit muss diese Lücken schließen.
5. Vorschläge priorisieren: zuerst Regel-/Logik-Lücken, dann übrige Dramaturgie — und strikt nach Fokus-Mandat (max. ${ROMAN_CRITIQUE_FOCUS_MAX} Punkte, kein Nice-to-have solange Härteres existiert).`;

/** Excellence + hard compliance + focus — use on all critique / Gegenlesen / Vorschläge system prompts. */
export const ROMAN_CRITIQUE_MANDATE = `${ROMAN_EXCELLENCE_MANDATE}

${ROMAN_CRITIQUE_HARD_CHECK}

${ROMAN_CRITIQUE_FOCUS_MANDATE}`;

/** Critique form: structured findings (diagnosis only — no auto-upstream patch). */
export const ROMAN_CRITIQUE_FINDINGS_HINT = `Zusätzlich (wenn JSON verlangt): findings müssen actionable sein; severityHint „lokal“ (dieser Schritt) oder „upstream“ (nur Diagnose — es wird nicht automatisch früher gepatcht).
Maximal ${ROMAN_CRITIQUE_FOCUS_MAX} Findings (weniger ok). severity: kritisch | wichtig | optional (= Nice to have).
Kein Nice-to-have / optional, solange kritische oder wichtige Punkte existieren.
Findings zu Regel- oder Logik-Verstößen haben Vorrang.`;

/**
 * Soft ceiling for prompt bodies (~200k tokens). Below this, full stage
 * texts are sent for Erzeugen / Verbessern / Gegenlesen / Reifegrad.
 * Only an emergency guard against accidental mega-pastes / API failures.
 */
export const PROMPT_SOFT_CAP_CHARS = 800_000;

/**
 * Prompt size budgets. Stage artifacts use {@link PROMPT_SOFT_CAP_CHARS}
 * so the Lektor/Co-Autor see the full document in normal books.
 */
export const CLIP = {
  idee: PROMPT_SOFT_CAP_CHARS,
  grob: PROMPT_SOFT_CAP_CHARS,
  charaktere: PROMPT_SOFT_CAP_CHARS,
  weltSchau: PROMPT_SOFT_CAP_CHARS,
  weltRegeln: PROMPT_SOFT_CAP_CHARS,
  weltCombined: PROMPT_SOFT_CAP_CHARS,
  expose: PROMPT_SOFT_CAP_CHARS,
  szenenplot: PROMPT_SOFT_CAP_CHARS,
  manuskript: PROMPT_SOFT_CAP_CHARS,
  lektorBrief: PROMPT_SOFT_CAP_CHARS,
  critique: PROMPT_SOFT_CAP_CHARS,
  sharedContext: PROMPT_SOFT_CAP_CHARS,
  chapterBody: PROMPT_SOFT_CAP_CHARS,
  routerContext: PROMPT_SOFT_CAP_CHARS,
} as const;

/** Slice only at the soft cap (no-op for normal book-sized texts). */
export function clipPrompt(
  text: string,
  budget: number = PROMPT_SOFT_CAP_CHARS,
): string {
  if (!text) return text;
  if (text.length <= budget) return text;
  return text.slice(0, budget);
}

/** Higher output budgets for thorough critiques / drafts. */
export const ROMAN_CRITIQUE_MAX_TOKENS = 6_000;
export const ROMAN_DRAFT_MAX_TOKENS = 12_000;
