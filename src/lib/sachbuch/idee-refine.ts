/**
 * Agentic Idee-Verfeinerung: Gemini 4 Argon verdichtet und kritisiert (2–3 Runden).
 * HITL freigibt danach — siehe approveSachbuchIdeeRefine.
 * Log roles remain `haiku`/`luna` for stored refineLog compatibility.
 */

import { generateText } from "@/lib/ai/provider";
import {
  SACHBUCH_IDEE_REFINE_MAX_ROUNDS,
  SACHBUCH_IDEE_REFINE_PASS_SCORE,
  SACHBUCH_MODEL_IDEE_CRITIC,
  SACHBUCH_MODEL_IDEE_DRAFTER,
} from "@/lib/sachbuch/agent-defaults";
import { assertSachbuchGuideAllows } from "@/lib/sachbuch/guide";
import {
  emptySachbuchEvidenz,
  emptySachbuchMakro,
} from "@/lib/sachbuch/parse";
import { resolveRomanSchreibModel } from "@/lib/roman/model";
import {
  getSachbuchKontext,
  patchSachbuchBook,
} from "@/lib/sachbuch/repository";
import type {
  SachbuchIdeeRefineRound,
  SachbuchKontext,
} from "@/lib/sachbuch/types";

const DRAFTER_SYSTEM = `Du bist Konzept-Architekt für deutschsprachige Sachbücher (Gemini 4 Argon).
Ziel: Das Dossier messbar besser machen (These schärfen, Versprechen, Abgrenzung, Cases).
Kein Motivations-Fluff. Kernthese aus dem Material schärfen — keine fremde Parallel-These.
Wenn Change-Orders vorliegen: JEDEN Punkt konkret umsetzen (nicht nur umformulieren).

Antworte NUR als JSON ohne Markdown-Fence:
{
  "unpopularOpinion": "eine klare These / UVP (1–3 Sätze)",
  "briefing": "Markdown: Blickwinkel, Leserversprechen, Abgrenzung, Ton, Kapitel-Hinweise",
  "caseStudies": ["kurze Fall-/Belegskizze", "..."],
  "openRisks": ["offenes Risiko oder Lücke", "..."],
  "addressedOrders": ["welche Change-Order du wie gelöst hast", "..."]
}`;

const CRITIC_SYSTEM = `Du bist strenger, aber fairer Sachbuch-Lektor (Gemini 4 Argon).
Bewerte das Dossier mit einer festen Rubrik (Score 1–10):

1–3: These unklar / austauschbar; kein Leserversprechen; viel Fluff.
4–5: Richtung erkennbar, aber Abgrenzung oder Cases dünn; Widersprüche möglich.
6–7: Brauchbar; These und Versprechen ok, noch Lücken bei Schärfe/Belegen/Abgrenzung.
8–9: Veröffentlichungsreif als Konzept: klare Anti-Konsens-These, Versprechen, Abgrenzung, greifbare Cases.
10: Exzellent — nichts Wesentliches offen.

Regeln:
- score muss zur Rubrik passen (nicht pauschal niedrig halten).
- Wenn eine Vor-Runde mit score vorliegt: scoreImproved=true nur bei echter Verbesserung; score darf dann nicht sinken, außer das Dossier wurde klar schlechter.
- pass=true NUR bei score >= ${SACHBUCH_IDEE_REFINE_PASS_SCORE}.
- Bei pass=false: 2–5 konkrete changeOrders (umsetzbar, priorisiert).

Antworte NUR als JSON ohne Markdown-Fence:
{
  "pass": false,
  "score": 6,
  "scoreImproved": true,
  "critique": "kurze Gesamtbewertung auf Deutsch inkl. Vergleich zur Vor-Runde falls vorhanden",
  "changeOrders": ["konkrete Änderungsanweisung 1", "..."]
}`;

function transcript(book: SachbuchKontext): string {
  return book.idee.interviewMessages
    .map((m) =>
      m.role === "assistant"
        ? `Interviewer: ${m.content.trim()}`
        : `Autor: ${m.content.trim()}`,
    )
    .join("\n\n");
}

function parseDossier(raw: string): {
  unpopularOpinion: string;
  briefing: string;
  caseStudies: string[];
  openRisks: string[];
} {
  try {
    const cleaned = raw.replace(/^```json?\s*|\s*```$/g, "").trim();
    const parsed = JSON.parse(cleaned) as {
      unpopularOpinion?: string;
      briefing?: string;
      caseStudies?: unknown;
      openRisks?: unknown;
    };
    return {
      unpopularOpinion: String(parsed.unpopularOpinion ?? "").trim(),
      briefing: String(parsed.briefing ?? "").trim() || raw.trim(),
      caseStudies: Array.isArray(parsed.caseStudies)
        ? parsed.caseStudies.map((c) => String(c).trim()).filter(Boolean)
        : [],
      openRisks: Array.isArray(parsed.openRisks)
        ? parsed.openRisks.map((c) => String(c).trim()).filter(Boolean)
        : [],
    };
  } catch {
    return {
      unpopularOpinion: raw.trim().slice(0, 500),
      briefing: raw.trim(),
      caseStudies: [],
      openRisks: [],
    };
  }
}

function parseCritique(
  raw: string,
  previousScore: number | null,
): {
  pass: boolean;
  score: number;
  scoreImproved: boolean | null;
  critique: string;
  changeOrders: string[];
} {
  try {
    const cleaned = raw.replace(/^```json?\s*|\s*```$/g, "").trim();
    const parsed = JSON.parse(cleaned) as {
      pass?: boolean;
      score?: number;
      scoreImproved?: boolean;
      critique?: string;
      changeOrders?: unknown;
    };
    let score = Math.max(1, Math.min(10, Math.round(Number(parsed.score) || 5)));
    // Don't allow silent score drops vs previous round unless model insists + we clamp softly.
    if (previousScore !== null && score < previousScore) {
      // Trust model only if it explicitly marks not improved; still floor at prev-1 max drop of 1.
      score = Math.max(score, previousScore - 1);
    }
    const scoreImproved =
      previousScore === null
        ? null
        : parsed.scoreImproved === true || score > previousScore;
    return {
      pass: score >= SACHBUCH_IDEE_REFINE_PASS_SCORE,
      score,
      scoreImproved,
      critique: String(parsed.critique ?? "").trim() || raw.trim(),
      changeOrders: Array.isArray(parsed.changeOrders)
        ? parsed.changeOrders.map((c) => String(c).trim()).filter(Boolean)
        : [],
    };
  } catch {
    return {
      pass: false,
      score: previousScore ?? 4,
      scoreImproved: false,
      critique: raw.trim() || "Kritik nicht parsebar.",
      changeOrders: ["Dossier schärfen: These, Leserversprechen, Abgrenzung."],
    };
  }
}

function dossierBlock(d: {
  unpopularOpinion: string;
  briefing: string;
  caseStudies: string[];
  openRisks: string[];
}): string {
  return JSON.stringify(d, null, 2);
}

/**
 * Run up to 3 Haiku↔Luna rounds; leave idee in awaiting_approval.
 */
export async function runSachbuchIdeeRefine(
  sachbuchId: string,
): Promise<SachbuchKontext> {
  const book = await getSachbuchKontext(sachbuchId);
  if (!book) throw new Error("Sachbuch nicht gefunden.");
  assertSachbuchGuideAllows(book, "refine");

  await patchSachbuchBook(sachbuchId, {
    idee: {
      ...book.idee,
      refineStatus: "running",
      guide: { ...book.idee.guide, currentStep: "refine" },
    },
  });

  const drafter = await resolveRomanSchreibModel(SACHBUCH_MODEL_IDEE_DRAFTER);
  const critic = await resolveRomanSchreibModel(SACHBUCH_MODEL_IDEE_CRITIC);

  const log: SachbuchIdeeRefineRound[] = [];
  let dossier = {
    unpopularOpinion: book.idee.unpopularOpinion.trim(),
    briefing: book.idee.briefing.trim(),
    caseStudies: [...book.idee.caseStudies],
    openRisks: [] as string[],
  };

  let previousScore: number | null = null;
  let previousCritique = "";

  for (let round = 1; round <= SACHBUCH_IDEE_REFINE_MAX_ROUNDS; round += 1) {
    const lastLuna = [...log].reverse().find((r) => r.role === "luna");
    const changeHint = lastLuna?.changeOrders.length
      ? `\nChange-Orders (verbindlich umsetzen):\n${lastLuna.changeOrders.map((c, i) => `${i + 1}. ${c}`).join("\n")}\nZiel: Score klar über ${previousScore ?? "Ausgang"} Richtung ≥ ${SACHBUCH_IDEE_REFINE_PASS_SCORE}/10.`
      : `\nZiel dieser Runde: starkes Konzept-Dossier (Rubrik-Score ≥ ${SACHBUCH_IDEE_REFINE_PASS_SCORE}/10).`;

    const haikuRaw = await generateText({
      model: drafter,
      systemInstruction: DRAFTER_SYSTEM,
      userText: `Buch: ${book.title}
Zielgruppe: ${book.zielgruppe.trim() || "—"}

Bisheriges Dossier:
${dossierBlock(dossier)}

Interview (Auszug):
${transcript(book).slice(0, 8_000) || "—"}
${changeHint}

Runde ${round}/${SACHBUCH_IDEE_REFINE_MAX_ROUNDS}: liefere das verbesserte Dossier.`,
      preferJson: true,
      maxTokens: 5000,
      timeoutMs: 180_000,
    });

    dossier = parseDossier(haikuRaw);
    log.push({
      round,
      role: "haiku",
      content: dossierBlock(dossier),
      passed: null,
      changeOrders: [],
      createdAt: new Date().toISOString(),
    });

    const priorBlock =
      previousScore !== null
        ? `\nVor-Runde: Score ${previousScore}/10
Vorherige Kritik: ${previousCritique.slice(0, 800)}
Bewerte relativ dazu: Ist das Dossier besser? scoreImproved und score entsprechend setzen (nicht künstlich niedrig halten).`
        : `\nErste Bewertung — kalibriere an der Rubrik (6–7 = brauchbar, ${SACHBUCH_IDEE_REFINE_PASS_SCORE}+ = freigabefähig).`;

    const lunaRaw = await generateText({
      model: critic,
      systemInstruction: CRITIC_SYSTEM,
      userText: `Buch: ${book.title}

Dossier:
${dossierBlock(dossier)}
${priorBlock}

Runde ${round}/${SACHBUCH_IDEE_REFINE_MAX_ROUNDS}: score + Kritik + Change-Orders.
pass nur bei score ≥ ${SACHBUCH_IDEE_REFINE_PASS_SCORE}.`,
      preferJson: true,
      maxTokens: 3000,
      timeoutMs: 180_000,
    });

    const critique = parseCritique(lunaRaw, previousScore);
    // Hard gate: pass only by score threshold.
    const passedRound = critique.score >= SACHBUCH_IDEE_REFINE_PASS_SCORE;
    const improvedNote =
      critique.scoreImproved === true
        ? " · verbessert"
        : critique.scoreImproved === false
          ? " · nicht verbessert"
          : "";
    log.push({
      round,
      role: "luna",
      content: `${critique.critique}\n\nScore: ${critique.score}/10 (Pass ab ${SACHBUCH_IDEE_REFINE_PASS_SCORE})${improvedNote}`,
      passed: passedRound,
      changeOrders: passedRound ? [] : critique.changeOrders,
      createdAt: new Date().toISOString(),
    });

    previousScore = critique.score;
    previousCritique = critique.critique;

    if (passedRound) {
      break;
    }
  }

  const live = (await getSachbuchKontext(sachbuchId)) ?? book;
  return patchSachbuchBook(sachbuchId, {
    idee: {
      ...live.idee,
      refineStatus: "awaiting_approval",
      refineLog: log,
      refinedBriefing: dossier.briefing,
      refinedOpinion:
        dossier.unpopularOpinion || live.idee.unpopularOpinion,
      refinedCaseStudies:
        dossier.caseStudies.length > 0
          ? dossier.caseStudies
          : live.idee.caseStudies,
      guide: {
        ...live.idee.guide,
        currentStep: "refine",
        ideaApprovedAt: null,
        writeApprovedAt: null,
      },
      status: "ready",
    },
  });
}

/** HITL: promote refined dossier into briefing and unlock book_type. */
export async function approveSachbuchIdeeRefine(
  sachbuchId: string,
): Promise<SachbuchKontext> {
  const book = await getSachbuchKontext(sachbuchId);
  if (!book) throw new Error("Sachbuch nicht gefunden.");
  const briefing =
    book.idee.refinedBriefing.trim() || book.idee.briefing.trim();
  const opinion =
    book.idee.refinedOpinion.trim() || book.idee.unpopularOpinion.trim();
  if (briefing.length < 20 && opinion.length < 20) {
    throw new Error(
      "Kein verfeinertes Dossier — bitte zuerst „Idee verfeinern“ starten.",
    );
  }
  if (
    book.idee.refineStatus !== "awaiting_approval" &&
    book.idee.refineLog.length === 0 &&
    !book.idee.refinedBriefing.trim()
  ) {
    throw new Error(
      "Verfeinerung noch nicht abgeschlossen — bitte zuerst den Agenten-Lauf starten.",
    );
  }

  const now = new Date().toISOString();
  return patchSachbuchBook(sachbuchId, {
    idee: {
      ...book.idee,
      briefing,
      unpopularOpinion: opinion,
      caseStudies:
        book.idee.refinedCaseStudies.length > 0
          ? book.idee.refinedCaseStudies
          : book.idee.caseStudies,
      refineStatus: "approved",
      status: "ready",
      guide: {
        ...book.idee.guide,
        currentStep: "book_type",
        ideaApprovedAt: now,
        writeApprovedAt: null,
      },
    },
  });
}

/** Reset refine for another agentic run (keeps current briefing/These). */
export async function rejectSachbuchIdeeRefine(
  sachbuchId: string,
): Promise<SachbuchKontext> {
  const book = await getSachbuchKontext(sachbuchId);
  if (!book) throw new Error("Sachbuch nicht gefunden.");
  return patchSachbuchBook(sachbuchId, {
    idee: {
      ...book.idee,
      refineStatus: "idle",
      refineLog: [],
      refinedBriefing: "",
      refinedOpinion: "",
      refinedCaseStudies: [],
      guide: {
        ...book.idee.guide,
        currentStep: "refine",
        ideaApprovedAt: null,
        writeApprovedAt: null,
      },
    },
  });
}

/**
 * Reopen refine: keep Konzept as baseline, hard-reset everything after Idee
 * (Buchtyp, Evidenz, Makro, Kapitel). Allows reopen if approved OR if
 * downstream artefacts exist (UI/status can desync on ideaApprovedAt).
 */
export async function reopenSachbuchIdeeRefine(
  sachbuchId: string,
): Promise<SachbuchKontext> {
  const book = await getSachbuchKontext(sachbuchId);
  if (!book) throw new Error("Sachbuch nicht gefunden.");

  const wasApproved =
    Boolean(book.idee.guide.ideaApprovedAt?.trim()) ||
    book.idee.refineStatus === "approved";
  const hasDownstream =
    Boolean(book.makro.bookTypeId?.trim()) ||
    book.evidenz.claims.length > 0 ||
    book.evidenz.queries.length > 0 ||
    book.makro.status !== "empty" ||
    book.kapitel.length > 0;

  if (!wasApproved && !hasDownstream) {
    throw new Error(
      "Verfeinerung ist bereits offen — bitte „Verfeinerung starten“ nutzen.",
    );
  }

  return patchSachbuchBook(sachbuchId, {
    idee: {
      ...book.idee,
      refineStatus: "idle",
      refineLog: [],
      refinedBriefing: "",
      refinedOpinion: "",
      refinedCaseStudies: [],
      guide: {
        ...book.idee.guide,
        currentStep: "refine",
        ideaApprovedAt: null,
        writeApprovedAt: null,
      },
    },
    evidenz: emptySachbuchEvidenz(),
    makro: emptySachbuchMakro("journey", ""),
    kapitel: [],
  });
}

/** Move wizard cursor when the step is unlocked. */
export async function setSachbuchGuideStep(
  sachbuchId: string,
  step: import("@/lib/sachbuch/types").SachbuchGuideStep,
): Promise<SachbuchKontext> {
  const book = await getSachbuchKontext(sachbuchId);
  if (!book) throw new Error("Sachbuch nicht gefunden.");
  const { canOpenSachbuchGuideStep } = await import("@/lib/sachbuch/guide");
  if (!canOpenSachbuchGuideStep(book, step)) {
    throw new Error("Dieser Schritt ist noch gesperrt.");
  }
  return patchSachbuchBook(sachbuchId, {
    idee: {
      ...book.idee,
      guide: { ...book.idee.guide, currentStep: step },
    },
  });
}
