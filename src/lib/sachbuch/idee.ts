/**
 * Phase 1 — Mind-Extraction / Erklär-Interview + UVP/Kernaussage.
 * Interview style follows book.makro.typ (journey | erklaerung | erzaehlung).
 */

import { generateText } from "@/lib/ai/provider";
import { resolveSachbuchAgentModel } from "@/lib/sachbuch/resolve-agent";
import {
  getSachbuchKontext,
  patchSachbuchBook,
} from "@/lib/sachbuch/repository";
import type {
  SachbuchInterviewMessage,
  SachbuchKontext,
  SachbuchMakroTyp,
} from "@/lib/sachbuch/types";
import { SACHBUCH_MAKRO_TYP_LABELS } from "@/lib/sachbuch/types";

function bookArt(book: SachbuchKontext): SachbuchMakroTyp {
  return book.makro.typ ?? "journey";
}

function transcriptBlock(messages: SachbuchInterviewMessage[]): string {
  return messages
    .map((m) =>
      m.role === "assistant"
        ? `Interviewer: ${m.content.trim()}`
        : `Autor: ${m.content.trim()}`,
    )
    .join("\n\n");
}

function ideeOpener(typ: SachbuchMakroTyp): string {
  if (typ === "erklaerung") {
    return "Was soll der Leser nach dem Buch wirklich verstanden haben — und welche Fehlvorstellung oder Verwechslung steht dem heute am meisten im Weg?";
  }
  if (typ === "erzaehlung") {
    return "Welche konkrete Geschichte oder welcher Fall soll das Buch tragen — und welche eine Szene oder Person bleibt dir am stärksten im Kopf?";
  }
  return "Was ist deine ungewöhnlichste Meinung zu dem Thema — etwas, dem die meisten Experten widersprechen würden? Und welche eigene Erfahrung steckt dahinter?";
}

function ideeTurnBrief(typ: SachbuchMakroTyp): string {
  if (typ === "erklaerung") {
    return `Stelle die nächste sokratische Nachfrage für ein Erklär-Sachbuch:
- Was genau unklar ist / welche Missverständnisse
- Alltagsbeispiele, Analogien, Gegenbeispiele
- Was der Leser danach erklären können soll
Keine Transformations-/Umsetzungs-Agenda.`;
  }
  if (typ === "erzaehlung") {
    return `Stelle die nächste sokratische Nachfrage für ein erzählendes Sachbuch / eine Fallgeschichte:
- Szenen, Personen, Orte, Zeitablauf
- Was auf dem Spiel stand / welche Spannung
- Welche Wendung die Erkenntnis auslöst
- Was der Leser daraus für sich mitnehmen soll
Keine reine Methodenschulung, keine Definitionskette.`;
  }
  return `Stelle die nächste sokratische Nachfrage (Erfahrungen, Anti-Konsens, Case Studies).`;
}

function ideeSharpenSystem(typ: SachbuchMakroTyp): string {
  if (typ === "erklaerung") {
    return `Du verdichtest ein Erklär-Interview zu einem Kernaussage-Dossier.
Antworte NUR als JSON-Objekt:
{
  "unpopularOpinion": "eine klare Kernaussage / Erklärthese (was der Leser verstehen soll)",
  "briefing": "Markdown-Briefing: Blickwinkel, Leserversprechen (Verständnis), Abgrenzung von oberflächlichen Erklärungen",
  "caseStudies": ["kurzes Anschauungsbeispiel 1", "..."]
}
Kein Markdown-Fence.`;
  }
  if (typ === "erzaehlung") {
    return `Du verdichtest ein Erzähl-/Fall-Interview zu einem Story-Dossier.
Antworte NUR als JSON-Objekt:
{
  "unpopularOpinion": "die zentrale Erkenntnis / These, die die Geschichte trägt",
  "briefing": "Markdown-Briefing: Protagonist/Fall, Spannungsbogen, Leserversprechen (Mitfiebern + Einsicht), Abgrenzung von reiner Reportage ohne Aussage",
  "caseStudies": ["Schlüsselszene 1", "Schlüsselszene 2", "..."]
}
Kein Markdown-Fence.`;
  }
  return `Du verdichtest ein Mind-Extraction-Interview zu einem UVP-Dossier.
Antworte NUR als JSON-Objekt:
{
  "unpopularOpinion": "eine klare Anti-Konsens-These",
  "briefing": "Markdown-Briefing: Blickwinkel, Leserversprechen, Abgrenzung vom Einheitsbrei",
  "caseStudies": ["kurze Anekdote/Case 1", "..."]
}
Kein Markdown-Fence.`;
}

/** Seed opener if Idee interview is empty. */
export async function startSachbuchIdeeInterview(
  sachbuchId: string,
): Promise<SachbuchKontext> {
  const book = await getSachbuchKontext(sachbuchId);
  if (!book) throw new Error("Sachbuch nicht gefunden.");
  if (book.idee.interviewMessages.length > 0) return book;

  const opener: SachbuchInterviewMessage = {
    id: crypto.randomUUID(),
    role: "assistant",
    content: ideeOpener(bookArt(book)),
    createdAt: new Date().toISOString(),
  };

  return patchSachbuchBook(sachbuchId, {
    idee: {
      ...book.idee,
      interviewMessages: [opener],
      status: "in_progress",
    },
  });
}

/** One Idee interview turn. */
export async function runSachbuchIdeeTurn(input: {
  sachbuchId: string;
  userText: string;
}): Promise<SachbuchKontext> {
  const book = await getSachbuchKontext(input.sachbuchId);
  if (!book) throw new Error("Sachbuch nicht gefunden.");
  const typ = bookArt(book);

  const userMsg: SachbuchInterviewMessage = {
    id: crypto.randomUUID(),
    role: "user",
    content: input.userText.trim(),
    createdAt: new Date().toISOString(),
  };
  const messages = [...book.idee.interviewMessages, userMsg];

  const slot = book.agents.interviewer;
  const model = await resolveSachbuchAgentModel(slot);
  const reply = await generateText({
    model,
    systemInstruction: slot.systemPrompt,
    userText: `Buch: ${book.title}
Zielgruppe: ${book.zielgruppe.trim() || "—"}
Buchart: ${typ} (${SACHBUCH_MAKRO_TYP_LABELS[typ]})

Bisheriges Interview:
${transcriptBlock(messages)}

${ideeTurnBrief(typ)}`,
    maxTokens: 1200,
    timeoutMs: 120_000,
  });

  const assistantMsg: SachbuchInterviewMessage = {
    id: crypto.randomUUID(),
    role: "assistant",
    content: reply.trim(),
    createdAt: new Date().toISOString(),
  };

  return patchSachbuchBook(input.sachbuchId, {
    idee: {
      ...book.idee,
      interviewMessages: [...messages, assistantMsg],
      status: "in_progress",
    },
  });
}

/** Distill UVP / Kernaussage dossier from Idee interview. */
export async function sharpenSachbuchUvp(
  sachbuchId: string,
): Promise<SachbuchKontext> {
  const book = await getSachbuchKontext(sachbuchId);
  if (!book) throw new Error("Sachbuch nicht gefunden.");
  if (book.idee.interviewMessages.length < 2) {
    throw new Error("Noch zu wenig Interview — bitte weiter sprechen.");
  }
  const typ = bookArt(book);

  const slot = book.agents.interviewer;
  const model = await resolveSachbuchAgentModel(slot);
  const raw = await generateText({
    model,
    systemInstruction: ideeSharpenSystem(typ),
    userText: `Buch: ${book.title}
Zielgruppe: ${book.zielgruppe.trim() || "—"}
Buchart: ${typ}

Interview:
${transcriptBlock(book.idee.interviewMessages)}`,
    preferJson: true,
    maxTokens: 4000,
    timeoutMs: 180_000,
  });

  let unpopularOpinion = "";
  let briefing = raw.trim();
  let caseStudies: string[] = [];
  try {
    const cleaned = raw.replace(/^```json?\s*|\s*```$/g, "").trim();
    const parsed = JSON.parse(cleaned) as {
      unpopularOpinion?: string;
      briefing?: string;
      caseStudies?: string[];
    };
    unpopularOpinion = String(parsed.unpopularOpinion ?? "").trim();
    briefing = String(parsed.briefing ?? "").trim() || briefing;
    caseStudies = Array.isArray(parsed.caseStudies)
      ? parsed.caseStudies.map((c) => String(c).trim()).filter(Boolean)
      : [];
  } catch {
    unpopularOpinion = briefing.slice(0, 500);
  }

  return patchSachbuchBook(sachbuchId, {
    idee: {
      ...book.idee,
      unpopularOpinion,
      briefing,
      caseStudies,
      status: "ready",
    },
  });
}

/**
 * Remove the last interview exchange (user+assistant), or a dangling user message.
 * Keeps at least the opening assistant question when that is all that remains.
 */
export async function undoSachbuchIdeeLastTurn(
  sachbuchId: string,
): Promise<SachbuchKontext> {
  const book = await getSachbuchKontext(sachbuchId);
  if (!book) throw new Error("Sachbuch nicht gefunden.");
  const messages = book.idee.interviewMessages;
  if (messages.length === 0) {
    throw new Error("Nichts zum Löschen.");
  }
  if (messages.length === 1 && messages[0]?.role === "assistant") {
    throw new Error("Die Einstiegsfrage kann nicht gelöscht werden.");
  }

  let next = messages;
  const last = messages[messages.length - 1]!;
  if (last.role === "assistant" && messages.length >= 2) {
    const prev = messages[messages.length - 2]!;
    if (prev.role === "user") {
      next = messages.slice(0, -2);
    } else {
      next = messages.slice(0, -1);
    }
  } else {
    next = messages.slice(0, -1);
  }

  if (next.length === 0) {
    throw new Error("Die Einstiegsfrage kann nicht gelöscht werden.");
  }

  return patchSachbuchBook(sachbuchId, {
    idee: {
      ...book.idee,
      interviewMessages: next,
      status: next.length <= 1 ? "in_progress" : book.idee.status,
    },
  });
}
