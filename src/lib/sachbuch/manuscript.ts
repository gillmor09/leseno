/**
 * Phase 7 — Manuskript-Lektorat: freeze Schreiben, score sales readiness, improve chapters.
 * Model: Gemini 4 Argon (`SACHBUCH_MODEL_MANUSCRIPT`).
 */

import {
  GEMINI_4_ARGON_TIMEOUT_MS,
  isRetryableAiNetworkError,
  sleepMs,
} from "@/lib/ai/fetch-timeout";
import { generateText } from "@/lib/ai/provider";
import { SACHBUCH_MODEL_MANUSCRIPT } from "@/lib/sachbuch/agent-defaults";
import { hasConfirmedSachbuchBookType } from "@/lib/sachbuch/book-types";
import {
  assertSachbuchGuideAllows,
  isSachbuchIdeaApproved,
  isSachbuchWriteApproved,
  sachbuchSchreibenReadyToFreeze,
} from "@/lib/sachbuch/guide";
import {
  concatAbschnitteText,
  countSachbuchWords,
  emptySachbuchKapitelManuscript,
  emptySachbuchManuscriptBookReview,
  sachbuchBookCritiqueForChapter,
  sachbuchKapitelBodyText,
  sachbuchKapitelNeedsManuscriptImprove,
  sanitizeSachbuchBookProse,
} from "@/lib/sachbuch/parse";
import {
  getSachbuchKontext,
  patchSachbuchBook,
  patchSachbuchKapitel,
} from "@/lib/sachbuch/repository";
import type {
  SachbuchKapitel,
  SachbuchKapitelManuscript,
  SachbuchKontext,
} from "@/lib/sachbuch/types";
import { resolveRomanSchreibModel } from "@/lib/roman/model";

/** Per-chapter attempts when improve-all hits transient network drops. */
const IMPROVE_CHAPTER_ATTEMPTS = 3;

const SCORE_SYSTEM = `Du bist Lektor und Produktmanager für deutschsprachige Business-Sachbücher.
Bewerte ein Kapitel auf VERKAUFSREIFE (Amazon/Fachbuch-Markt), nicht nur auf Grammatik.

Rubrik (1–10 Gesamtscore, ganzzahlig):
- These/Nutzenversprechen klar und kaufrelevant
- Argumentation + Belege glaubwürdig
- Lesbarkeit / Rhythmus (kein KI-Matsch, keine Wiederholungsschleifen)
- Buchformatierung: druckreif — KEINE Markdown-Artefakte (# ## ###, **, \`\`\`, - Listen als Markdown)
- Leseversprechen eingehalten (bei Privacy/DSGVO: KEINE Artikelnummern 1:1 / keine Artikel-Schlacht)
- Praxisnähe (Frameworks, Cases, Handlungsaufforderung)
- Marktfähigkeit (Titelwirkung des Kapitels, Differenzierung)

Antworte NUR als JSON ohne Markdown-Fence:
{
  "salesScore": 1-10,
  "scoreSummary": "2–4 Sätze Gesamturteil",
  "strengths": ["…"],
  "gaps": ["…"],
  "changeOrders": ["konkrete Verbesserungsaufträge, max 8"]
}`;

const BOOK_SCORE_SYSTEM = `Du bist Lektor und Produktmanager für deutschsprachige Business-Sachbücher.
Bewerte das GESAMTE BUCH als ein verkaufsfähiges Produkt (Amazon/Fachbuch), nicht als Mittelwert einzelner Kapitel.

Rubrik (1–10 Gesamtscore, ganzzahlig) — Buch als Ganzes:
- Roter Faden / Dramaturgie über alle Kapitel (Aufbau, Wiederholungen zwischen Kapiteln, Escalation)
- UVP und Leseversprechen werden über das Werk eingelöst
- Kohärenz der Cases, Begriffe und Handlungsstränge (kein Kapitel widerspricht dem anderen)
- Marktfähigkeit des Gesamtwerks (Kaufgrund, Differenzierung, Abschluss/CTA des Buchs)
- Druckreife über alle Kapitel (kein Markdown-Matsch, keine Artikel-Schlacht wo versprochen)
- Kapitel-Einzelscores sind nur Kontext — der Buch-Score darf darunter oder darüber liegen, wenn das Gesamtwerk schwächer/stärker wirkt

Antworte NUR als JSON ohne Markdown-Fence:
{
  "salesScore": 1-10,
  "scoreSummary": "2–5 Sätze Gesamturteil zum BUCH",
  "strengths": ["…"],
  "gaps": ["…"],
  "changeOrders": ["buchweite Verbesserungsaufträge, max 8"]
}`;

/** Soft cap per chapter excerpt so a 5×8k book still fits one score call. */
const BOOK_SCORE_EXCERPT_WORDS = 2_200;

function excerptForBookScore(text: string, maxWords: number): string {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return text.trim();
  const head = Math.floor(maxWords * 0.7);
  const tail = maxWords - head;
  return `${words.slice(0, head).join(" ")}\n\n[…]\n\n${words.slice(-tail).join(" ")}`;
}

const IMPROVE_SYSTEM = `Du bist strenger Manuskript-Lektor für deutschsprachige Business-Sachbücher.
Du überarbeitest EIN Kapitel vollständig und lieferst verkaufsbereite BUCHPROSA (Druck/ePub), keine Markdown-Datei.

Pflichtregeln:
- Sprache: Deutsch, klar, argumentativ, keine Meta-Kommentare.
- Länge: mindestens 90 % der Vorlage in Wörtern (kein starkes Kürzen). Ziel: gleiche Substanz, klarer Rhythmus — lieber knapp unter 110 % als unter 90 %.
- KEINE Gesetzes-Artikelnummern 1:1 (nicht „Art. 5 DSGVO“, „Art. 32“, „Artikel 15“ usw.).
  Stattdessen Prinzipien in Alltagssprache (Zweckbindung, Speicherbegrenzung, Sicherheit der Verarbeitung, …).
- Wiederholungen und KI-Glätte reduzieren; Absätze mit klarer Pointe.
- Zahlen/Studien nur behalten, wenn sie im Text schon stehen — nichts erfinden; unsichere Behauptungen weicher formulieren („Branche berichtet…“) statt Pseudo-Präzision.
- FORMAT (hart): Nur saubere Absätze, getrennt durch Leerzeilen.
  VERBOTEN im Ausgabetext: Markdown-Überschriften (# ## ###), **Fettdruck**, _Kursiv-Marker_, Backticks/\`\`\`-Fences,
  Markdown-Listen (- Item / * Item / 1. Item), [Links](url), HTML-Tags, Emoji-Zwischenüberschriften à la „### 🔍 …“.
  Zwischenüberschriften — wenn nötig — als eigene kurze Zeile in Normalschrift OHNE #-Zeichen (Titelfall), danach Absatz.
  Aufzählungen als fließende Sätze oder nummerierte Sätze im Fließtext, nicht als Markdown-Bullets.
- Kein JSON, kein Vorspann („Hier das Kapitel:“) — nur der fertige Kapiteltext.`;

function draftFromKapitel(k: SachbuchKapitel): string {
  return (
    concatAbschnitteText(k.abschnitte).trim() ||
    k.finalText.trim() ||
    k.manuscript.draftText.trim()
  );
}

function parseScoreJson(raw: string): Partial<SachbuchKapitelManuscript> {
  const cleaned = raw.replace(/^```json?\s*|\s*```$/g, "").trim();
  const parsed = JSON.parse(cleaned) as Record<string, unknown>;
  const score =
    typeof parsed.salesScore === "number" && Number.isFinite(parsed.salesScore)
      ? Math.max(1, Math.min(10, Math.round(parsed.salesScore)))
      : null;
  const list = (v: unknown) =>
    Array.isArray(v)
      ? v.map((x) => String(x).trim()).filter(Boolean).slice(0, 12)
      : [];
  return {
    salesScore: score,
    scoreSummary: String(parsed.scoreSummary ?? "").trim(),
    strengths: list(parsed.strengths),
    gaps: list(parsed.gaps),
    changeOrders: list(parsed.changeOrders),
  };
}

/**
 * Freeze Phase 5: snapshot Abschnitte → manuscript.draftText, set writeApprovedAt.
 */
export async function approveSachbuchSchreiben(
  sachbuchId: string,
): Promise<SachbuchKontext> {
  const book = await getSachbuchKontext(sachbuchId);
  if (!book) throw new Error("Sachbuch nicht gefunden.");
  if (!isSachbuchIdeaApproved(book)) {
    throw new Error("Idee noch nicht freigegeben.");
  }
  if (!hasConfirmedSachbuchBookType(book.makro.bookTypeId)) {
    throw new Error("Zuerst Sachbuchtyp übernehmen.");
  }
  if (isSachbuchWriteApproved(book)) {
    throw new Error("Schreiben ist bereits freigegeben/fixiert.");
  }
  const ready = sachbuchSchreibenReadyToFreeze(book);
  if (!ready.ok) {
    throw new Error(ready.reason ?? "Schreiben noch nicht bereit zum Fixieren.");
  }

  const now = new Date().toISOString();
  const kapitel = book.kapitel.map((k) => {
    const draft = sanitizeSachbuchBookProse(draftFromKapitel(k));
    return {
      ...k,
      finalText: draft,
      manuscript: {
        ...emptySachbuchKapitelManuscript(),
        ...k.manuscript,
        draftText: draft,
        improvedText: "",
        salesScore: null,
        scoreSummary: "",
        strengths: [],
        gaps: [],
        changeOrders: [],
        scoredAt: null,
        improvedAt: null,
        modelSlug: "",
      },
      updatedAt: now,
    };
  });

  return patchSachbuchBook(sachbuchId, {
    kapitel,
    idee: {
      ...book.idee,
      manuscriptReview: emptySachbuchManuscriptBookReview(),
      guide: {
        ...book.idee.guide,
        currentStep: "manuscript",
        writeApprovedAt: now,
      },
    },
  });
}

/**
 * Throw away frozen Manuskript AND Abschnitt prose, reopen Schreiben.
 * Idea / Typ / Evidenz / Makro / Context Graphs stay. Next: generate Abschnitte again.
 */
export async function resetSachbuchSchreibenProse(
  sachbuchId: string,
): Promise<SachbuchKontext> {
  const book = await getSachbuchKontext(sachbuchId);
  if (!book) throw new Error("Sachbuch nicht gefunden.");
  if (!isSachbuchIdeaApproved(book)) {
    throw new Error("Idee noch nicht freigegeben.");
  }
  if (!hasConfirmedSachbuchBookType(book.makro.bookTypeId)) {
    throw new Error("Zuerst Sachbuchtyp übernehmen.");
  }

  const now = new Date().toISOString();
  const kapitel = book.kapitel.map((k) => ({
    ...k,
    abschnitte: [],
    finalText: "",
    draftPass1: "",
    critiquePass2: "",
    manuscript: emptySachbuchKapitelManuscript(),
    status: "draft" as const,
    generationJobId: null,
    generationProgress: null,
    generationError: null,
    updatedAt: now,
  }));

  return patchSachbuchBook(sachbuchId, {
    kapitel,
    idee: {
      ...book.idee,
      manuscriptReview: emptySachbuchManuscriptBookReview(),
      guide: {
        ...book.idee.guide,
        currentStep: "write",
        writeApprovedAt: null,
      },
    },
  });
}

/** Re-open Schreiben (clears freeze; keeps Abschnitte; clears manuscript scores). */
export async function reopenSachbuchSchreiben(
  sachbuchId: string,
): Promise<SachbuchKontext> {
  const book = await getSachbuchKontext(sachbuchId);
  if (!book) throw new Error("Sachbuch nicht gefunden.");
  if (!isSachbuchWriteApproved(book)) {
    throw new Error("Schreiben ist nicht freigegeben.");
  }

  const now = new Date().toISOString();
  const kapitel = book.kapitel.map((k) => ({
    ...k,
    manuscript: emptySachbuchKapitelManuscript(),
    updatedAt: now,
  }));

  return patchSachbuchBook(sachbuchId, {
    kapitel,
    idee: {
      ...book.idee,
      manuscriptReview: emptySachbuchManuscriptBookReview(),
      guide: {
        ...book.idee.guide,
        currentStep: "write",
        writeApprovedAt: null,
      },
    },
  });
}

/** Score one chapter for sales readiness (Argon). */
export async function scoreSachbuchKapitelManuscript(input: {
  sachbuchId: string;
  kapitelId: string;
}): Promise<SachbuchKontext> {
  const book = await getSachbuchKontext(input.sachbuchId);
  if (!book) throw new Error("Sachbuch nicht gefunden.");
  assertSachbuchGuideAllows(book, "manuscript");
  const kapitel = book.kapitel.find((k) => k.id === input.kapitelId);
  if (!kapitel) throw new Error("Kapitel nicht gefunden.");

  const body =
    kapitel.manuscript.draftText.trim() || draftFromKapitel(kapitel);
  if (countSachbuchWords(body) < 400) {
    throw new Error("Kapiteltext zu kurz für Bewertung.");
  }

  const model = await resolveRomanSchreibModel(SACHBUCH_MODEL_MANUSCRIPT);
  const raw = await generateText({
    model,
    systemInstruction: SCORE_SYSTEM,
    userText: `Buch: ${book.title}
UVP: ${book.idee.unpopularOpinion}
Zielgruppe: ${book.zielgruppe || "—"}
Kapitel: ${kapitel.title}

Kapiteltext:
${body}`,
    preferJson: true,
    maxTokens: 4000,
    timeoutMs: 180_000,
  });

  let scored: Partial<SachbuchKapitelManuscript>;
  try {
    scored = parseScoreJson(raw);
  } catch {
    throw new Error("Score-JSON ungültig — bitte erneut versuchen.");
  }
  if (scored.salesScore == null) {
    throw new Error("Kein salesScore in der Bewertung.");
  }

  const now = new Date().toISOString();
  return patchSachbuchKapitel(input.sachbuchId, input.kapitelId, {
    manuscript: {
      ...kapitel.manuscript,
      draftText: body,
      salesScore: scored.salesScore,
      scoreSummary: scored.scoreSummary ?? "",
      strengths: scored.strengths ?? [],
      gaps: scored.gaps ?? [],
      changeOrders: scored.changeOrders ?? [],
      scoredAt: now,
      modelSlug: SACHBUCH_MODEL_MANUSCRIPT,
    },
    updatedAt: now,
  });
}

/**
 * Score the whole manuscript as one product (Argon).
 * Uses chapter bodies (improved preferred) + chapter scores as context — not a mean.
 */
export async function scoreSachbuchBookManuscript(
  sachbuchId: string,
): Promise<SachbuchKontext> {
  const book = await getSachbuchKontext(sachbuchId);
  if (!book) throw new Error("Sachbuch nicht gefunden.");
  assertSachbuchGuideAllows(book, "manuscript");
  if (book.kapitel.length === 0) {
    throw new Error("Keine Kapitel zum Bewerten.");
  }

  const chapterBlocks = book.kapitel.map((k, i) => {
    const body =
      k.manuscript.improvedText.trim() ||
      k.manuscript.draftText.trim() ||
      draftFromKapitel(k);
    const words = countSachbuchWords(body);
    if (words < 200) {
      throw new Error(
        `Kapitel ${i + 1} („${k.title}“) ist zu kurz für die Buch-Bewertung.`,
      );
    }
    const excerpt = excerptForBookScore(body, BOOK_SCORE_EXCERPT_WORDS);
    const chScore =
      k.manuscript.salesScore != null ? `${k.manuscript.salesScore}/10` : "—";
    const summary = k.manuscript.scoreSummary.trim() || "—";
    return `### Kapitel ${i + 1}: ${k.title}
Kapitel-Score (nur Kontext): ${chScore}
Kapitel-Kurzurteil: ${summary}
Wörter gesamt: ${words} (Auszug unten)

${excerpt}`;
  });

  const model = await resolveRomanSchreibModel(SACHBUCH_MODEL_MANUSCRIPT);
  const raw = await generateText({
    model,
    systemInstruction: BOOK_SCORE_SYSTEM,
    userText: `Buch: ${book.title}
UVP: ${book.idee.unpopularOpinion}
Zielgruppe: ${book.zielgruppe || "—"}
Kapitelanzahl: ${book.kapitel.length}

Bewerte das GESAMTWERK (nicht den Mittelwert der Kapitel-Scores).

${chapterBlocks.join("\n\n---\n\n")}`,
    preferJson: true,
    maxTokens: 4000,
    timeoutMs: GEMINI_4_ARGON_TIMEOUT_MS,
  });

  let scored: Partial<SachbuchKapitelManuscript>;
  try {
    scored = parseScoreJson(raw);
  } catch {
    throw new Error("Buch-Score-JSON ungültig — bitte erneut versuchen.");
  }
  if (scored.salesScore == null) {
    throw new Error("Kein salesScore in der Buch-Bewertung.");
  }

  const now = new Date().toISOString();
  return patchSachbuchBook(sachbuchId, {
    idee: {
      ...book.idee,
      manuscriptReview: {
        salesScore: scored.salesScore,
        scoreSummary: scored.scoreSummary ?? "",
        strengths: scored.strengths ?? [],
        gaps: scored.gaps ?? [],
        changeOrders: scored.changeOrders ?? [],
        scoredAt: now,
        modelSlug: SACHBUCH_MODEL_MANUSCRIPT,
      },
    },
  });
}

/**
 * Improve one chapter with Argon.
 * Honors: default/extra orders, chapter critique, and (when present) Buch-Bewertung
 * Change-Orders/Lücken that apply to this chapter. Preferiert Lektorat-Text als
 * Vorlage, damit ein zweiter Lauf die Buch-Schwachstellen nachzieht.
 */
export async function improveSachbuchKapitelManuscript(input: {
  sachbuchId: string;
  kapitelId: string;
  extraChangeOrders?: string[];
}): Promise<SachbuchKontext> {
  const book = await getSachbuchKontext(input.sachbuchId);
  if (!book) throw new Error("Sachbuch nicht gefunden.");
  assertSachbuchGuideAllows(book, "manuscript");
  const kapitel = book.kapitel.find((k) => k.id === input.kapitelId);
  if (!kapitel) throw new Error("Kapitel nicht gefunden.");

  let working = book;
  let kap = kapitel;
  if (kap.manuscript.salesScore == null || !kap.manuscript.changeOrders.length) {
    working = await scoreSachbuchKapitelManuscript(input);
    kap = working.kapitel.find((k) => k.id === input.kapitelId)!;
  }

  const frozenDraft =
    kap.manuscript.draftText.trim() ||
    draftFromKapitel(kap) ||
    sachbuchKapitelBodyText(kap);
  // Second pass (Buch-Kritik): start from current Lektorat if present.
  const body =
    kap.manuscript.improvedText.trim() ||
    frozenDraft;
  const bookCritique = sachbuchBookCritiqueForChapter(working, input.kapitelId);
  const orders = [
    ...bookCritique.orders.map(
      (o) =>
        `[Buch-weit — in DIESEM Kapitel umsetzen, soweit betroffen; sonst straffen/Querverweis statt Doppelung] ${o}`,
    ),
    ...(input.extraChangeOrders ?? []),
    ...kap.manuscript.changeOrders,
  ].filter(Boolean);
  const gaps = [
    ...bookCritique.gaps.map((g) => `[Buch] ${g}`),
    ...kap.manuscript.gaps,
  ];

  const sourceWords = countSachbuchWords(body);
  const minWords = Math.round(sourceWords * 0.9);
  const model = await resolveRomanSchreibModel(SACHBUCH_MODEL_MANUSCRIPT);
  const vorlageLabel = kap.manuscript.improvedText.trim()
    ? "Aktuelles Lektorat"
    : "Rohentwurf";

  async function rewriteOnce(userText: string): Promise<string> {
    // Argon wall-clock is floored to GEMINI_4_ARGON_TIMEOUT_MS in the client;
    // pass it explicitly so scripts/UI share the same 20‑min budget.
    const raw = (
      await generateText({
        model,
        systemInstruction: IMPROVE_SYSTEM,
        userText,
        maxTokens: 32_768,
        timeoutMs: GEMINI_4_ARGON_TIMEOUT_MS,
      })
    )
      .replace(/^```(?:markdown|md|text)?\s*|\s*```$/g, "")
      .trim();
    return sanitizeSachbuchBookProse(raw);
  }

  let improved = await rewriteOnce(`Buch: ${book.title}
Kapitel: ${kap.title}
UVP: ${book.idee.unpopularOpinion}

Vorlage: ${sourceWords} Wörter (${vorlageLabel}) — Ziel mindestens ${minWords} Wörter (kein starkes Kürzen).
Priorität: Buch-weite Change-Orders zuerst (Redundanzen zwischen Kapiteln, Framework-Konsistenz, dramaturgische Staffelung), dann Kapitel-Orders.

Kapitel-Score bisher: ${kap.manuscript.salesScore}/10
Kapitel-Kritik: ${kap.manuscript.scoreSummary || "—"}
Buch-Gesamturteil: ${bookCritique.summary || "—"}

Change-Orders (verbindlich):
${orders.map((o, i) => `${i + 1}. ${o}`).join("\n") || "—"}

Lücken:
${gaps.map((g) => `- ${g}`).join("\n") || "—"}

${vorlageLabel}:
${body}`);

  let improvedWords = countSachbuchWords(improved);
  if (improvedWords < 400) {
    throw new Error("Überarbeitung zu kurz — bitte erneut versuchen.");
  }
  // Length floor ≥90%: up to two expand retries (full rewrite, then fill from draft).
  for (let attempt = 0; attempt < 2 && improvedWords < minWords; attempt++) {
    if (attempt === 0) {
      improved = await rewriteOnce(`Buch: ${book.title}
Kapitel: ${kap.title}

Die vorherige Überarbeitung ist zu kurz (${improvedWords} Wörter, Minimum ${minWords}).
Schreibe das Kapitel erneut aus der Vorlage: setze die Change-Orders um, aber behalte
Inhalt und Länge — Ziel mindestens ${minWords} Wörter (Vorlage: ${sourceWords}).

Change-Orders:
${orders.map((o, i) => `${i + 1}. ${o}`).join("\n") || "—"}

${vorlageLabel}:
${body}`);
    } else {
      improved = await rewriteOnce(`Buch: ${book.title}
Kapitel: ${kap.title}

Expandiere die kurze Fassung auf mindestens ${minWords} Wörter.
Behalte die Lektorat-Verbesserungen; hole fehlende Abschnitte, Beispiele und Details
aus der Vorlage zurück (kein neues Erfinden). Keine Artikelnummern 1:1.

Kurze Fassung (${improvedWords} Wörter):
${improved}

Vorlage (${sourceWords} Wörter) als Füllquelle:
${body}`);
    }
    improvedWords = countSachbuchWords(improved);
    if (improvedWords < 400) {
      throw new Error("Überarbeitung zu kurz — bitte erneut versuchen.");
    }
  }
  if (improvedWords < minWords) {
    throw new Error(
      `Überarbeitung zu kurz für Längenregel (${improvedWords}/${minWords} Wörter).`,
    );
  }

  const now = new Date().toISOString();
  // Re-score after improve for updated salesScore
  const rescoreModel = await resolveRomanSchreibModel(SACHBUCH_MODEL_MANUSCRIPT);
  let newScore = kap.manuscript.salesScore;
  let newSummary = kap.manuscript.scoreSummary;
  let strengths = kap.manuscript.strengths;
  let gapsOut = kap.manuscript.gaps;
  let changeOrders = kap.manuscript.changeOrders;
  try {
    const scoreRaw = await generateText({
      model: rescoreModel,
      systemInstruction: SCORE_SYSTEM,
      userText: `Buch: ${book.title}
Kapitel: ${kap.title} (NACH Lektorat)

${improved}`,
      preferJson: true,
      maxTokens: 4000,
      timeoutMs: 180_000,
    });
    const parsed = parseScoreJson(scoreRaw);
    if (parsed.salesScore != null) {
      newScore = parsed.salesScore;
      newSummary = parsed.scoreSummary || newSummary;
      strengths = parsed.strengths?.length ? parsed.strengths : strengths;
      gapsOut = parsed.gaps ?? [];
      changeOrders = parsed.changeOrders ?? [];
    }
  } catch {
    /* keep previous score if rescore fails */
  }

  return patchSachbuchKapitel(input.sachbuchId, input.kapitelId, {
    finalText: improved,
    manuscript: {
      ...kap.manuscript,
      // Keep frozen Rohentwurf; never overwrite with Lektorat.
      draftText: frozenDraft,
      improvedText: improved,
      salesScore: newScore,
      scoreSummary: newSummary,
      strengths,
      gaps: gapsOut,
      changeOrders,
      scoredAt: kap.manuscript.scoredAt ?? now,
      improvedAt: now,
      modelSlug: SACHBUCH_MODEL_MANUSCRIPT,
    },
    updatedAt: now,
  });
}

/** Book-level critique from editorial review (Lean Privacy first pass). */
export const SACHBUCH_MANUSCRIPT_DEFAULT_CHANGE_ORDERS = [
  "Entferne alle DSGVO-/Gesetzes-Artikelnummern 1:1 (Art. …, Artikel …) — ersetze durch Prinzipien in Alltagssprache (Zweckbindung, Speicherbegrenzung, Sicherheit der Verarbeitung, Auskunftsrechte). Leseversprechen: ganz ohne Artikel-Schlacht.",
  "Reduziere Wiederholung und KI-Glätte: gleiche Pointe nicht in mehreren Absätzen neu aufwärmen; Rhythmus variieren.",
  "Belege/Zahlen nicht erfinden und nicht präziser machen als die Quelle hergibt — bei Unsicherheit weicher formulieren statt Scheingenauigkeit.",
  "Schärfe Verkaufsreife: jedes Kapitel braucht klaren Leser-Nutzen und eine greifbare Handlungsaufforderung ohne Juristen-Jargon.",
  "Buchformatierung: keine Markdown-Syntax (# ## ###, **, Listen-Striche, Backticks). Nur saubere Absätze und ggf. Zwischenüberschriften als Normalschrift-Zeile ohne #-Zeichen.",
] as const;

/**
 * Improve every chapter once (sequential) with optional shared change orders.
 * Skips chapters that already have a fresh Lektorat — except when a newer
 * Buch-Bewertung Change-Orders hat: then re-improve from current Lektorat so
 * book-wide weaknesses (Redundanz, Framework, Staffelung) get applied.
 */
export async function improveAllSachbuchManuscript(input: {
  sachbuchId: string;
  extraChangeOrders?: string[];
}): Promise<SachbuchKontext> {
  let book = await getSachbuchKontext(input.sachbuchId);
  if (!book) throw new Error("Sachbuch nicht gefunden.");
  assertSachbuchGuideAllows(book, "manuscript");

  const failures: string[] = [];

  for (let i = 0; i < book.kapitel.length; i += 1) {
    const kapitelId = book.kapitel[i]!.id;
    book = (await getSachbuchKontext(input.sachbuchId))!;
    const k = book.kapitel.find((c) => c.id === kapitelId);
    if (!k) continue;

    if (!sachbuchKapitelNeedsManuscriptImprove(book, kapitelId)) {
      continue;
    }

    let ok = false;
    let lastMsg = "unbekannt";
    for (
      let attempt = 1;
      attempt <= IMPROVE_CHAPTER_ATTEMPTS && !ok;
      attempt += 1
    ) {
      try {
        book = await improveSachbuchKapitelManuscript({
          sachbuchId: input.sachbuchId,
          kapitelId,
          extraChangeOrders: input.extraChangeOrders,
        });
        ok = true;
      } catch (error) {
        lastMsg = error instanceof Error ? error.message : String(error);
        const retry =
          attempt < IMPROVE_CHAPTER_ATTEMPTS &&
          (isRetryableAiNetworkError(error) ||
            /timeout|abgebrochen|fetch failed|econnreset|temporar|überlast/i.test(
              lastMsg,
            ));
        if (retry) {
          console.warn(
            `[sachbuch-manuscript] Kap ${i + 1} improve attempt ${attempt} failed, retry: ${lastMsg}`,
          );
          await sleepMs(8_000 * attempt);
          continue;
        }
        break;
      }
    }

    if (!ok) {
      failures.push(`Kapitel ${i + 1} (${k.title.slice(0, 48)}): ${lastMsg}`);
    }
  }

  book = (await getSachbuchKontext(input.sachbuchId))!;
  if (failures.length > 0) {
    throw new Error(
      `Manuskript-Improve teilweise fehlgeschlagen (${failures.length}): ${failures.join(" · ")}`,
    );
  }

  // Holistic book score after a full improve pass (best-effort).
  try {
    book = await scoreSachbuchBookManuscript(input.sachbuchId);
  } catch (error) {
    console.warn(
      "[sachbuch-manuscript] book score after improve-all failed:",
      error instanceof Error ? error.message : error,
    );
  }
  return book;
}

