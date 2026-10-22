/**
 * Agentic Idee-Verfeinerung: Haiku 5.5 verdichtet, Luna 6 kritisiert (2–3 Runden).
 * HITL freigibt danach — siehe approveSachbuchIdeeRefine.
 */

import { generateText } from "@/lib/ai/provider";
import {
  SACHBUCH_IDEE_REFINE_MAX_ROUNDS,
  SACHBUCH_MODEL_IDEE_CRITIC,
  SACHBUCH_MODEL_IDEE_DRAFTER,
} from "@/lib/sachbuch/agent-defaults";
import { assertSachbuchGuideAllows } from "@/lib/sachbuch/guide";
import { resolveRomanSchreibModel } from "@/lib/roman/model";
import {
  getSachbuchKontext,
  patchSachbuchBook,
} from "@/lib/sachbuch/repository";
import type {
  SachbuchIdeeRefineRound,
  SachbuchKontext,
} from "@/lib/sachbuch/types";

const DRAFTER_SYSTEM = `Du bist Konzept-Architekt für deutschsprachige Sachbücher (Haiku).
Verdichte Rohkonzept und Interview zu einem scharfen Dossier.
Kein Motivations-Fluff. Keine neuen Kernthesen erfinden, die nicht im Material liegen — schärfen und strukturieren.

Antworte NUR als JSON ohne Markdown-Fence:
{
  "unpopularOpinion": "eine klare These / UVP (1–3 Sätze)",
  "briefing": "Markdown: Blickwinkel, Leserversprechen, Abgrenzung, Ton, Kapitel-Hinweise",
  "caseStudies": ["kurze Fall-/Belegskizze", "..."],
  "openRisks": ["offenes Risiko oder Lücke", "..."]
}`;

const CRITIC_SYSTEM = `Du bist strenger Sachbuch-Lektor (Luna).
Prüfe das Dossier auf Schärfe, Widersprüche, Fluff, fehlende Abgrenzung und Umsetzbarkeit.
pass=true nur wenn These + Leserversprechen + Abgrenzung klar und belastbar sind.

Antworte NUR als JSON ohne Markdown-Fence:
{
  "pass": true,
  "score": 1,
  "critique": "kurze Gesamtbewertung auf Deutsch",
  "changeOrders": ["konkrete Änderungsanweisung 1", "..."]
}
score 1–10. Bei pass=false mindestens eine changeOrder.`;

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

function parseCritique(raw: string): {
  pass: boolean;
  score: number;
  critique: string;
  changeOrders: string[];
} {
  try {
    const cleaned = raw.replace(/^```json?\s*|\s*```$/g, "").trim();
    const parsed = JSON.parse(cleaned) as {
      pass?: boolean;
      score?: number;
      critique?: string;
      changeOrders?: unknown;
    };
    return {
      pass: Boolean(parsed.pass),
      score: Math.max(1, Math.min(10, Number(parsed.score) || 5)),
      critique: String(parsed.critique ?? "").trim() || raw.trim(),
      changeOrders: Array.isArray(parsed.changeOrders)
        ? parsed.changeOrders.map((c) => String(c).trim()).filter(Boolean)
        : [],
    };
  } catch {
    return {
      pass: false,
      score: 4,
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

  let passed = false;

  for (let round = 1; round <= SACHBUCH_IDEE_REFINE_MAX_ROUNDS; round += 1) {
    const changeHint =
      log.length > 0
        ? `\nLetzte Change-Orders:\n${log[log.length - 1]!.changeOrders.map((c) => `- ${c}`).join("\n")}`
        : "";

    const haikuRaw = await generateText({
      model: drafter,
      systemInstruction: DRAFTER_SYSTEM,
      userText: `Buch: ${book.title}
Zielgruppe: ${book.zielgruppe.trim() || "—"}

Rohkonzept / bisheriges Dossier:
${dossierBlock(dossier)}

Interview (Auszug):
${transcript(book).slice(0, 8_000) || "—"}
${changeHint}

Runde ${round}/${SACHBUCH_IDEE_REFINE_MAX_ROUNDS}: liefere das geschärfte Dossier.`,
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

    const lunaRaw = await generateText({
      model: critic,
      systemInstruction: CRITIC_SYSTEM,
      userText: `Buch: ${book.title}

Dossier:
${dossierBlock(dossier)}

Runde ${round}/${SACHBUCH_IDEE_REFINE_MAX_ROUNDS}: bewerte und gib Change-Orders.`,
      preferJson: true,
      maxTokens: 3000,
      timeoutMs: 180_000,
    });

    const critique = parseCritique(lunaRaw);
    log.push({
      round,
      role: "luna",
      content: `${critique.critique}\n\nScore: ${critique.score}/10`,
      passed: critique.pass,
      changeOrders: critique.changeOrders,
      createdAt: new Date().toISOString(),
    });

    if (critique.pass) {
      passed = true;
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
        currentStep: "refine",
        ideaApprovedAt: null,
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
        currentStep: "book_type",
        ideaApprovedAt: now,
      },
    },
  });
}

/** Reset refine for another agentic run (keeps Rohkonzept briefing). */
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
        currentStep: "refine",
        ideaApprovedAt: null,
      },
    },
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
