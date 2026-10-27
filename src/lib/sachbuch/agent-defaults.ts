/**
 * Default system prompts + model slugs for per-book Sachbuch agents (phases 1–6).
 * Runtime model per role is hard-wired here — stored `agents.*.modelSlug` is
 * ignored for generation (prompts/flags still come from the book slot).
 */

import type {
  SachbuchAgentKey,
  SachbuchAgents,
  SachbuchAgentSlot,
} from "@/lib/sachbuch/types";

export const SACHBUCH_MODEL_INTERVIEWER = "gpt-6-luna";
/** Phase 2 Evidenz (Google Search) + default researcher slot. */
export const SACHBUCH_MODEL_RESEARCHER = "gemini-4-argon";
/** Phase 3 Makro (stages) + default architect slot. */
export const SACHBUCH_MODEL_ARCHITECT = "gemini-4-argon";
/** Phase 5 Writer (+ Critic-Rewrite / Style-Rewrite via Writer). */
export const SACHBUCH_MODEL_WRITER = "gemini-3.8-flash";
/** Phase 5 Critic / Prüfen. */
export const SACHBUCH_MODEL_CRITIC = "gemini-4-argon";
/** Phase 5 Style Matcher — same class as Writer (polish, not deep critique). */
export const SACHBUCH_MODEL_STYLIST = "gemini-3.8-flash";

/** Agentic Idee-Verfeinerung: Gemini 4 Argon verdichtet und kritisiert. */
export const SACHBUCH_MODEL_IDEE_DRAFTER = "gemini-4-argon";
export const SACHBUCH_MODEL_IDEE_CRITIC = "gemini-4-argon";
export const SACHBUCH_IDEE_REFINE_MAX_ROUNDS = 3;
/** Export Marketing / Titelei (Titel, Klappe, Keywords). */
export const SACHBUCH_MODEL_MARKETING = "gemini-4-argon";
/** Export Cover (OpenAI Images) — keep slug here so client UI never imports export-cover. */
export const SACHBUCH_COVER_MODEL_SLUG = "gpt-image-2.5-sunburst";
/** Phase 7 Manuskript-Lektorat (Verkaufsreife + Rewrite). */
export const SACHBUCH_MODEL_MANUSCRIPT = "gemini-4-argon";
/** Phase 8 Herstellung (Unterkapitel + Layout-Kästen vor Export). */
export const SACHBUCH_MODEL_HERSTELLUNG = "claude-haiku-5-5";
/**
 * Chapter Infografiken — Napkin AI (`NAPKIN_API_KEY`), not a wired Gemini slug.
 * Kept as display/token id for wait UI compatibility.
 */
export const SACHBUCH_MODEL_INFOGRAFIK = "napkin";
export const SACHBUCH_INFOGRAFIK_PROVIDER = "napkin";
/** Luna pass only at/above this score (1–10). */
export const SACHBUCH_IDEE_REFINE_PASS_SCORE = 8;

/**
 * Model slug actually used at runtime for each agent role (UI + wait dialogs).
 * Do not read `book.agents[key].modelSlug` for display — it may be stale.
 */
export const SACHBUCH_RUNTIME_MODEL_BY_AGENT: Record<SachbuchAgentKey, string> =
  {
    interviewer: SACHBUCH_MODEL_INTERVIEWER,
    researcher: SACHBUCH_MODEL_RESEARCHER,
    architect: SACHBUCH_MODEL_ARCHITECT,
    writer: SACHBUCH_MODEL_WRITER,
    critic: SACHBUCH_MODEL_CRITIC,
    stylist: SACHBUCH_MODEL_STYLIST,
  };

/** Runtime model slug for a Sachbuch agent role. */
export function sachbuchRuntimeModelSlug(key: SachbuchAgentKey): string {
  return SACHBUCH_RUNTIME_MODEL_BY_AGENT[key];
}

/**
 * Soft volume targets for a full adult Sachbuch with Buchteilen
 * (typisch 3 Teile / ~8–10 Kapitel → ca. 70–90k Wörter).
 */
export const SACHBUCH_BOOK_WORDS_TARGET = 80_000;
export const SACHBUCH_KAPITEL_WORDS_TARGET = 9_000;

/**
 * Phase 5 section word band — writing unit with checkpoint/critic/style.
 * ~16 Abschnitte × ~550 Wörter ≈ 9.000 Wörter/Kapitel.
 */
export const SACHBUCH_ABSCHNITT_WORDS_MIN = 400;
export const SACHBUCH_ABSCHNITT_WORDS_MAX = 700;

/** Soft average for volume math / UI hints. */
export const SACHBUCH_ABSCHNITT_WORDS_TARGET = Math.round(
  (SACHBUCH_ABSCHNITT_WORDS_MIN + SACHBUCH_ABSCHNITT_WORDS_MAX) / 2,
);

/** Soft chapter word band (assembled Abschnitte / Gesamtkapitel). */
export const SACHBUCH_TARGET_WORDS_MIN = 7_000;
export const SACHBUCH_TARGET_WORDS_MAX = 11_000;

/**
 * Soft minimum Abschnitte per chapter: volume-first, then claims as floor.
 * No hard maximum — keep writing until the chapter feels done.
 */
export function recommendedMinAbschnitte(claimsCount: number): number {
  const fromVolume = Math.ceil(
    SACHBUCH_KAPITEL_WORDS_TARGET / SACHBUCH_ABSCHNITT_WORDS_TARGET,
  );
  return Math.max(fromVolume, claimsCount, 10);
}

/** Safety cap for one „alle Abschnitte“ batch run (per chapter). */
export const SACHBUCH_ABSCHNITT_BATCH_MAX = 24;

/** True when soft volume recommendation for a chapter is met. */
export function kapitelMeetsAbschnittVolumeTarget(input: {
  abschnitteCount: number;
  words: number;
  claimsCount: number;
}): boolean {
  const min = recommendedMinAbschnitte(input.claimsCount);
  return (
    input.abschnitteCount >= min &&
    input.words >= SACHBUCH_KAPITEL_WORDS_TARGET
  );
}

const INTERVIEWER_PROMPT = `Du bist ein sokratischer Interviewer für deutschsprachige Sachbücher (Mind-Extraction & UVP).
Ziel: Eigene Erfahrungen, ungewöhnliche Meinungen, Case Studies und Anekdoten des Autors herausarbeiten — bis eine Anti-Konsens-These / Unpopular Opinion klar ist.

Regeln:
- Antworte auf Deutsch, knapp (meist 1–3 Sätze Frage + kurze Spiegelung).
- Bohre nach: Warum ungewöhnlich? Gegenbeispiel? Persönliche Story? Für wen gefährlich?
- Keine Kapitel schreiben, keine Standard-Gliederung vorschlagen.
- Eine klare Nachfrage pro Turn.`;

const RESEARCHER_PROMPT = `Du bist Researcher für deutschsprachige Sachbücher.
Aufgabe: Zur geschärften UVP/These harte Evidenz, Studienhinweise, Gegenargumente und historische Parallelen sammeln (Google Search).

Regeln:
- Deutsch.
- Nutze Google Search. Erfinde keine Studien oder Zahlen.
- Strukturiere als Claims: Behauptung, Evidenz, Gegenargument, Quellen.
- Kein Buchtext, keine Kapitelgliederung.`;

const ARCHITECT_PROMPT = `Du bist Architect für Sachbuch-Makro und Kapitel-Context-Graphs.
Aufgabe: Aus Idee/UVP eine FLEXIBLE Buchstruktur erzeugen — Buchteile (parts) mit je einem oder mehreren Kapiteln — und danach Mikro-Kontext pro Kapitel.

Makro-Struktur (verbindlich für Phase 3):
- Nicht starr auf genau 5 Kapitel fixieren.
- 2–5 Buchteile, insgesamt typisch 6–12 Kapitel; Anzahl und Gewichtung folgen der Idee (z. B. 3 Pyramidenteile, verdichtete Mitte, eigener Kundenergebnis-Teil).
- JSON-Form: parts[] → chapters[] (id, title, promise, notes).

Makro-Typ nur als Erzählhint (nicht als feste 5er-Liste):
- journey: Transformation (Diagnose → These → Methode → Umbau → Ausblick)
- erklaerung: Verständnis (Kontext → Kern → Vertiefung → Beispiele → Einordnung)
- erzaehlung: Fallbogen (Ausgang → Konflikt → Verlauf → Erkenntnis → Bedeutung)

Context Graph pro Kapitel: Leser-Wissensstand, etablierte Begriffe, zu beweisende Behauptungen, Abhängigkeiten.

Leseversprechen (rechtlich / DSGVO u. a.):
- Keine Artikelnummern 1:1 (nicht „Art. 6 DSGVO“, „Art. 5 Abs. 1“, „§ 26 BDSG“ o. Ä. in Terms oder Claims).
- Stattdessen Alltagssprache und Prinzipien: Zweckbindung, Einwilligung, Auskunftsrecht, Löschung, …
- Ziel: Leserführung ohne Artikel-Schlacht — Normen nur als verständliche Pflichten/Rechte, nie als Zitatkatalog.

Regeln: Deutsch, konkret, editierbar kurz. Keine austauschbare 10-Kapitel-Standardgliederung.`;

const WRITER_PROMPT = `Du bist Writer für Sachbuch-Abschnitte (${SACHBUCH_ABSCHNITT_WORDS_MIN}–${SACHBUCH_ABSCHNITT_WORDS_MAX} Wörter).
Aufgabe: Einen Abschnitt auf Basis Context Graph, UVP, Evidenz und bisheriger Abschnitte schreiben.
Ein Kapitel hat viele solche Abschnitte (Ziel ca. ${SACHBUCH_KAPITEL_WORDS_TARGET} Wörter/Kapitel, Buch ca. ${SACHBUCH_BOOK_WORDS_TARGET} Wörter).

Regeln:
- Deutsch, klar, argumentativ, mit Substanz (Beispiel, Beleg, Kontrast) — nicht nur Skizze.
- Halte das Wortband ${SACHBUCH_ABSCHNITT_WORDS_MIN}–${SACHBUCH_ABSCHNITT_WORDS_MAX}; lieber Richtung ${SACHBUCH_ABSCHNITT_WORDS_MAX} als darunter.
- Keine Meta-Kommentare.
- Baue auf etablierte Begriffe; beweise fällige Claims.
- Leseversprechen: keine DSGVO-/Gesetzes-Artikelnummern 1:1 — Prinzipien und Alltagssprache statt Artikel-Schlacht.
- FORMAT: Nur Buchprosa (Absätze). VERBOTEN: Markdown (# ## ###, **, *, Backticks, - Listen). Zwischenüberschriften — wenn überhaupt — als Normalzeile ohne Sonderzeichen.
- Keine Wiederholungsschleife: Cases, Studien und Metriken, die im bisherigen Kapiteltext schon stehen, nicht neu aufwärmen. KlarNetz AG (fiktives Composite) nur einmal einführen und als fiktiv markieren, danach fortschreiben.
- Jeder Abschnitt ist in sich geschlossen: Anfang = neuer vollständiger Satz; Ende = abgeschlossener Gedanke mit . ! oder ? — keine Satztrennung über Abschnittsgrenzen.
- Wenn der Autor Recherche/Belege fordert („such im Internet“, „keine Ahnung“): recherchiere und arbeite belastbare Fakten ein — erfinde keine Studien oder Zahlen.`;

const CRITIC_PROMPT = `Du bist Devil's Advocate / Critic für Sachbuch-Abschnitte.
Aufgabe: Logik-, Argumentations-, Redundanz- und Faktenschwächen gnadenlos benennen.

Regeln:
- Deutsch.
- Strukturiere: (1) Schwere Fehler, (2) schwache Argumente, (3) Redundanz, (4) fehlende Belege, (5) konkrete Fixes.
- Flagge Artikelnummern (Art. … DSGVO/BDSG o. Ä.) als Verstoß gegen das Leseversprechen „ohne Artikel-Schlacht“.
- Kein komplettes Umschreiben.`;

const STYLIST_PROMPT = `Du bist Style Matcher für Sachbuch-Abschnitte.
Aufgabe: Entwurf + Critic + Stilbibel zu konsistenter Autor-Prosa verdichten.

Regeln:
- Deutsch; Stilbibel hat Vorrang.
- Berechtigte Critic-Fixes einbauen.
- Keine Meta-Einleitung.
- FORMAT: Nur Buchprosa. Entferne Markdown (# ##, **, *, Backticks, Listen-Marker) — Ausgabe wie im gedruckten Buch.`;

function slot(
  modelSlug: string,
  systemPrompt: string,
  googleSearch = false,
): SachbuchAgentSlot {
  return { modelSlug, systemPrompt, googleSearch };
}

/** Seed agents when a book is created or agents JSON is empty. */
export function defaultSachbuchAgents(): SachbuchAgents {
  return {
    interviewer: slot(SACHBUCH_MODEL_INTERVIEWER, INTERVIEWER_PROMPT, false),
    researcher: slot(SACHBUCH_MODEL_RESEARCHER, RESEARCHER_PROMPT, true),
    architect: slot(SACHBUCH_MODEL_ARCHITECT, ARCHITECT_PROMPT, false),
    writer: slot(SACHBUCH_MODEL_WRITER, WRITER_PROMPT, false),
    critic: slot(SACHBUCH_MODEL_CRITIC, CRITIC_PROMPT, false),
    stylist: slot(SACHBUCH_MODEL_STYLIST, STYLIST_PROMPT, false),
  };
}
