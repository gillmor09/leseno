/**
 * Quality bar + prompt size budgets for the Buch pipeline.
 * Manuskript prose (Sonnet) stays lean via slim canon + chapter packet;
 * assist calls (Gemini Flash) still use CLIP caps — no uncapped bible dumps.
 */

import type { PipelineStage } from "@/lib/roman/pipeline/stages";

/** Hard cap for critique / dimension / Leser-Feedback action items. */
export const ROMAN_CRITIQUE_FOCUS_MAX = 3;

/**
 * Scope precision for aenderungsPrompts — prevents one Prop fix from rewriting
 * every manuscript chapter via `buchweit`.
 */
export const ROMAN_CRITIQUE_SCOPE_MANDATE = `Scope (verbindlich — gegen unnötige Buchweit-Rewrites):
- Default: scope „lokal“ mit vollständiger kapitel-Liste aller Belegstellen (Kap. N in kritik und anweisung nennen).
- Prop / Fakt / Timeline / Raum / Titel / einzelne Widersprüche: IMMER lokal + alle Kapitel, in denen der Fehler vorkommt — nie buchweit, auch wenn Canon „überall“ gelten soll.
- „buchweit“ NUR wenn die Änderung in JEDEM Kapitel greifen muss (Stimme, Register, Erzählhaltung) UND keine begrenzte Kapitelmenge genügt. Dann kapitel [] — und nicht „gesamter Text“ schreiben, wenn nur 2–3 Belege existieren.
- „über mehrere Kapitel“ ≠ buchweit: die konkreten Nummern listen.`;

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
- Lieber 1–2 harte Punkte als ${ROMAN_CRITIQUE_FOCUS_MAX} weiche.
- Zitate nur wörtlich aus dem Artefakt; keine erfundenen Textstellen oder abgebrochenen Sätze.

${ROMAN_CRITIQUE_SCOPE_MANDATE}`;

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
- Innere Logik und Kontinuität zählen — aber kleine Unebenheiten, die den Lesefluss nicht brechen, ignorieren.
- BELEG-PFLICHT: Zitate in Anführungszeichen müssen WÖRTLICH im Artefakt stehen. Keine erfundenen abgebrochenen Sätze, keine „…“-Stümpfe, die im Text vollständig weiterlaufen. Wenn unsicher: keinen Auftrag dazu.

${ROMAN_CRITIQUE_SCOPE_MANDATE}`;

/** Shared anti-hallucination rule for Lektor/Testleser that cite the text. */
export const ROMAN_CRITIQUE_QUOTE_GROUNDING = `Zitat-Grounding (verbindlich):
- Wenn du Textstelle zitierst: nur wörtliche Ausschnitte aus dem gelieferten Artefakt (auch »«).
- Erfinde keine abgebrochenen Dialoge/Sätze („Sie sind seit se…“, »Entschuldigung. Fami«), wenn der Satz/die Replik im Text vollständig weiterläuft.
- Kein Auftrag „Satz/Replik zu Ende führen / Szene runden“, ohne dass der Text im Artefakt wirklich mittendrin endet (nicht nur ein Wortanfang zitieren).
- Lieber 0 Aufträge als einen erfundenen Beleg.`;

/**
 * Lektor policy for structured Gerüst/Plot analyze (Verbessern + Dimensions-Analyse).
 * Keeps prompts on JSON fields — blocks Manuskript-style “finish the sentence”.
 */
export function structureStageAnalyzePolicy(stage: PipelineStage): string {
  if (
    stage === "szenenplot" ||
    stage === "grobplot" ||
    stage === "feinplot"
  ) {
    return `
STUFEN-POLITIK: Artefakt = STRUCTURED Szenenplot. aenderungsPrompts müssen scene_id und/oder Kapitel+Feld nennen (dramaturgy.*, information_flow.*, continuity.*, schreibPrompt, props/events/arcBeats, centralArcs).
Plot-Fixes hier — nicht im Manuskript. Keine Prosa schreiben. Manuskript wird invalidiert.
VERBOTEN: „Dialog/Replik/Satz zu Ende führen“ oder „Kapitel formal abrunden“ — das ist Manuskript-Arbeit. Wenn schreibPrompt unklar ist: Vertrag schärfen (MUSS/DARF-NICHT/Hook), nicht Prosa fertigschreiben.
ABDECKUNG: Prüfe ALLE Kapitel im Artefakt — nicht nur Kap. 1–3. Wenn der härteste Mangel hinten liegt, muss der Auftrag hinten liegen.
Verbessern nur bei klaren Pflichtlücken — kein Feinschliff-Loop.`;
  }
  if (
    stage === "kapitelgeruest" ||
    stage === "grobgeruest" ||
    stage === "feingeruest"
  ) {
    return `
STUFEN-POLITIK: Bewerte die STRUCTURED-Felder: centralArcs (Setup/Peak/Payoff), je Kapitel kernsatz/inhaltKurz/props/events/openThreads/mustNotRepeat/introduces/resolves/arcBeats. Keine Einzelszenen erfinden. aenderungsPrompts müssen diese Felder nennen (WO + WAS). Downstream (Plot/Manuskript) wird invalidiert.
Gerüst = arbeitende SKIZZE mit Ecken und Kanten. Offene Threads, knappe inhaltKurz und Raum für den Plot sind KEIN Mangel.
Pflicht nur bei Tragfähigkeit: fehlender Peak/Payoff, funktionsloses Kapitel, harter Lifecycle-Widerspruch, Exposé-Versprechen ohne Kapitel-Anker.
VERBOTEN: „Dialog/Replik/Satz zu Ende führen“, „Kapitel abrunden“, Mini-Manuskript in inhaltKurz, jedes Motiv ausbuchstabieren, Glattbügeln „fürs Buch“.
ABDECKUNG: Prüfe ALLE Kapitel — Härteste tragfähige Lücke zuerst (auch hinten). Nicht jedes Kapitel „vollschreiben“.
Verbessern nur bei klaren Pflichtlücken — kein Feinschliff-Loop.`;
  }
  return "";
}

/**
 * Spec (`expose`) analyze/assess: early gate — Spec must carry a full novel.
 * Gaps here are expensive to invent later in Gerüst/Plot/Manuskript.
 */
export function specStageAnalyzePolicy(
  focus: "gesamt" | "logik" | "craft" | "assess" | "dimension" = "gesamt",
): string {
  const loadBearing = `ROMAN-TRAGFÄHIGKEIT (verbindlich — Spec ist der früheste Gate):
- Frage: Reicht DIESES Spec (Figuren + Welt + Exposé) in Summe, um Gerüst → Szenenplot → ganzen Roman zu tragen — ohne dass Downstream zentrale Konflikte, Wendungen oder Motive erfinden muss?
- Zu dünn = kritisch: nur Kurzgeschichten-Beat, ein gagiger Incident, fehlende Escalation, unklarer Midpoint/Endgame-Seed, Figuren ohne Mehrakt-Antrieb, Welt ohne konfliktfähige Regeln.
- Stoffmasse: Wollen/Brauchen/Fürchten und Antagonismus müssen MEHRERE Akte speisen (Verschärfung möglich), nicht nur den Anfang.
- Exposé braucht erkennbare Bewegung: Anfang → Druck/Wende → Ziel/Payoff-Versprechen (kein flaches „und dann …“ ohne Steigerung).
- Figuren und Welt müssen zum Handlungsbogen passen und ihn tragen — nicht dekorativ parallel liegen.
- Offene Lücken, die Gerüst später füllen müsste (wer will was warum; was steht auf dem Spiel; was verschärft sich): HIER benennen und schließen — nicht „später klären“.
- Altersklasse: Tragfähigkeit und Eskalation müssen zur Zielgruppe passen (kein Adult-Plot in Kinderspec und umgekehrt).
- aenderungsPrompts: WO (Figuren / Welt / Exposé) + WAS konkret nachschärfen — keine Manuskript-Prosa, keine Kapitelnummern erfinden.`;

  if (focus === "logik") {
    return `
STUFEN-POLITIK Spec · Logik: Widersprüche zwischen Figuren, Weltregeln und Exposé; unglaubwürdige Motivation; Canon-Löcher, die einen Roman sprengen würden.
${loadBearing}
Zusatz Logik: Was im Exposé passiert, muss aus Figuren/Welt folgen — keine magischen Plot-Rettungen ohne Spec-Basis.`;
  }
  if (focus === "craft") {
    return `
STUFEN-POLITIK Spec · Craft: Figurenkraft, Weltnutzen, Handlungsbogen — Stoff und Dramaturgie für einen ganzen Roman.
${loadBearing}
Zusatz Craft: Härteste Lücke zuerst (meist fehlende Escalation / Endgame-Seed / Mehrakt-Konflikt). Keine Stilpolitur.`;
  }
  if (focus === "dimension") {
    return `
STUFEN-POLITIK Spec · Dimension: Nur diese Craft-/Logik-Achse — aber immer gegen die Frage „trägt das einen ganzen Roman?“ prüfen.
${loadBearing}`;
  }
  if (focus === "assess") {
    return `
STUFEN-POLITIK Spec · Messung: Niedrige Craft-/Logik-Scores, wenn der Spec nur eine Episode trägt oder Downstream Erfindungsarbeit erzwingt.
${loadBearing}`;
  }
  return `
STUFEN-POLITIK Spec · Gesamt: Logik + Craft gemischt; Härteste Tragfähigkeits-Lücken zuerst (max. 3).
${loadBearing}`;
}

/**
 * Gesamt (or dimension axis) at/above which Verbessern still hunts the last
 * load-bearing gaps instead of defaulting to empty prompts.
 */
export const REIFEGRAD_HIGH_BAND_PP = 95;

/**
 * Injected into Verbessern / Dimensions-Analyse when the stage already scores
 * high: keep anti-feinschliff, but do not stop looking for Tragfähigkeit gaps.
 */
export function highBandLastGapsMandate(input: {
  gesamtPct: number | null | undefined;
  /** Optional single-axis % (Dimensions-Analyse). */
  axisPct?: number | null;
  axisLabel?: string;
}): string {
  const gesamt =
    input.gesamtPct != null && Number.isFinite(input.gesamtPct)
      ? Math.round(input.gesamtPct)
      : null;
  const axis =
    input.axisPct != null && Number.isFinite(input.axisPct)
      ? Math.round(input.axisPct)
      : null;
  const scoreForBand = axis ?? gesamt;
  if (scoreForBand == null) {
    return `Reifegrad-Kontext: noch keine Messung für diese Stufe.
Härteste kritisch/wichtige Lücken zuerst. Leere aenderungsPrompts nur wenn wirklich nichts Pflichtiges fehlt.`;
  }

  const scoreLine =
    axis != null && input.axisLabel
      ? `Achse „${input.axisLabel}“ ${axis}%${gesamt != null ? ` · Stufe Gesamt ${gesamt}%` : ""}`
      : `Stufe Gesamt ${gesamt}%`;

  if (scoreForBand < REIFEGRAD_HIGH_BAND_PP) {
    return `Reifegrad-Kontext: ${scoreLine} (unter Hochband ${REIFEGRAD_HIGH_BAND_PP}%).
Fokus: härteste kritisch/wichtige Lücken. Leere aenderungsPrompts nur wenn wirklich nichts Pflichtiges fehlt — kein Pseudo-Mangel.`;
  }

  return `HOCHBAND (${scoreLine} ≥ ${REIFEGRAD_HIGH_BAND_PP}%): Die Stufe trägt schon weitgehend — trotzdem gezielt die LETZTEN wirklich tragfähigen Lücken suchen (max. 1–2 Aufträge; lieber 1 harter als 0 aus Bequemlichkeit).
Suche nur Substanz, die den Sprung über KI-Mittelmaß / freigabefähige Exzellenz noch verhindert:
- Tragfähigkeit: Escalation, Midpoint/Endgame-Seed, Payoff der zentralen Arcs, Mehrakt-Antrieb
- Eigenständigkeit: austauschbare Beats/Klischees, die den Bogen schwächen (kein Stilgeschmack)
- Last-mile Logik/Motivation: ein klarer Bruch oder Motivationsloch, das noch steht
- Spec: Stoffmasse für den ganzen Roman · Gerüst: Arc Peak/Payoff/Lifecycle (Skizze — keine Szenen vorweg) · Plot: Szenenverträge/Continuity · Manuskript: Leseschaden durch Logik/Spannung
VERBOTEN im Hochband: Nice-to-have, Feinschliff, Wortwahl, „noch etwas schöner“, Gerüst zum Mini-Buch aufblasen.
Leeres Array [] NUR wenn kritik in einem Satz begründet, warum keine tragfähige Lücke mehr bleibt — nicht weil der Score schon hoch ist.`;
}

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
 * Soft ceiling for accidental mega-pastes / API failures (~200k tokens).
 * Prefer {@link CLIP} for normal prompt budgets.
 */
export const PROMPT_SOFT_CAP_CHARS = 800_000;

/**
 * Prompt size budgets (characters ≈ tokens×3–4 for German).
 * Tight enough to cut Sonnet/assist input; large enough for normal books.
 * Emergency only: {@link PROMPT_SOFT_CAP_CHARS}.
 */
export const CLIP = {
  idee: 8_000,
  recherche: 8_000,
  grob: 4_000,
  charaktere: 12_000,
  weltSchau: 4_000,
  weltRegeln: 4_000,
  weltCombined: 8_000,
  expose: 12_000,
  /** Kapitelgerüst markdown (structure only). */
  kapitelgeruest: 24_000,
  /** Full Szenenplot markdown in critiques / lektor — not uncapped. */
  szenenplot: 40_000,
  /** Manuskript body in critique/feedback — chapter packs stay separate. */
  manuskript: 60_000,
  lektorBrief: 6_000,
  critique: 8_000,
  sharedContext: 16_000,
  chapterBody: 28_000,
  routerContext: 12_000,
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
/**
 * Long prose (Kapitel, Einarbeiten, Stage-Drafts, Weave).
 * Floor high enough that Claude is not cut mid-sentence (20k was hit in logs).
 */
export const ROMAN_PROSE_MAX_TOKENS = 30_000;
/** Alias for stage drafts (Exposé / Welt / …) — same headroom as chapter prose. */
export const ROMAN_DRAFT_MAX_TOKENS = ROMAN_PROSE_MAX_TOKENS;
