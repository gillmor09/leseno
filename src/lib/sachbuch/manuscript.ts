/**
 * Phase 7 — Manuskript-Lektorat: freeze Schreiben, score sales readiness, improve chapters.
 * Model: Gemini 4 Argon (`SACHBUCH_MODEL_MANUSCRIPT`).
 */

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
  sachbuchKapitelBodyText,
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
      guide: {
        ...book.idee.guide,
        currentStep: "manuscript",
        writeApprovedAt: now,
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
 * Improve one chapter with Argon. Optional extra changeOrders (e.g. book-level critique).
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

  const body =
    kap.manuscript.draftText.trim() ||
    draftFromKapitel(kap) ||
    sachbuchKapitelBodyText(kap);
  const orders = [
    ...(input.extraChangeOrders ?? []),
    ...kap.manuscript.changeOrders,
  ].filter(Boolean);

  const sourceWords = countSachbuchWords(body);
  const minWords = Math.round(sourceWords * 0.9);
  const model = await resolveRomanSchreibModel(SACHBUCH_MODEL_MANUSCRIPT);

  async function rewriteOnce(userText: string): Promise<string> {
    const raw = (
      await generateText({
        model,
        systemInstruction: IMPROVE_SYSTEM,
        userText,
        maxTokens: 24_000,
        timeoutMs: 420_000,
      })
    )
      .replace(/^```(?:markdown|md|text)?\s*|\s*```$/g, "")
      .trim();
    return sanitizeSachbuchBookProse(raw);
  }

  let improved = await rewriteOnce(`Buch: ${book.title}
Kapitel: ${kap.title}
UVP: ${book.idee.unpopularOpinion}

Vorlage: ${sourceWords} Wörter — Ziel mindestens ${minWords} Wörter (kein starkes Kürzen).

Score bisher: ${kap.manuscript.salesScore}/10
Kritik: ${kap.manuscript.scoreSummary}

Change-Orders (verbindlich):
${orders.map((o, i) => `${i + 1}. ${o}`).join("\n") || "—"}

Lücken:
${kap.manuscript.gaps.map((g) => `- ${g}`).join("\n") || "—"}

Rohentwurf:
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
Schreibe das Kapitel erneut aus dem Rohentwurf: setze die Change-Orders um, aber behalte
Inhalt und Länge — Ziel mindestens ${minWords} Wörter (Vorlage: ${sourceWords}).

Change-Orders:
${orders.map((o, i) => `${i + 1}. ${o}`).join("\n") || "—"}

Rohentwurf:
${body}`);
    } else {
      improved = await rewriteOnce(`Buch: ${book.title}
Kapitel: ${kap.title}

Expandiere die kurze Fassung auf mindestens ${minWords} Wörter.
Behalte die Lektorat-Verbesserungen; hole fehlende Abschnitte, Beispiele und Details
aus dem Rohentwurf zurück (kein neues Erfinden). Keine Artikelnummern 1:1.

Kurze Fassung (${improvedWords} Wörter):
${improved}

Rohentwurf (${sourceWords} Wörter) als Füllquelle:
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
  let gaps = kap.manuscript.gaps;
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
      gaps = parsed.gaps ?? [];
      changeOrders = parsed.changeOrders ?? [];
    }
  } catch {
    /* keep previous score if rescore fails */
  }

  return patchSachbuchKapitel(input.sachbuchId, input.kapitelId, {
    finalText: improved,
    manuscript: {
      ...kap.manuscript,
      draftText: body,
      improvedText: improved,
      salesScore: newScore,
      scoreSummary: newSummary,
      strengths,
      gaps,
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
 */
export async function improveAllSachbuchManuscript(input: {
  sachbuchId: string;
  extraChangeOrders?: string[];
}): Promise<SachbuchKontext> {
  let book = await getSachbuchKontext(input.sachbuchId);
  if (!book) throw new Error("Sachbuch nicht gefunden.");
  assertSachbuchGuideAllows(book, "manuscript");

  for (const k of book.kapitel) {
    book = await improveSachbuchKapitelManuscript({
      sachbuchId: input.sachbuchId,
      kapitelId: k.id,
      extraChangeOrders: input.extraChangeOrders,
    });
  }
  return book;
}

