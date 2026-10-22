/**
 * Greenfield novel idea interview: Haiku asks open questions,
 * Luna weaves answers into high_concept_idea. Deepgram is UI-only.
 */

import {
  generateAsEditorJson,
  generateAsIdeaPartner,
} from "@/lib/novel/roles";
import {
  getNovelBundle,
  updateNovel,
} from "@/lib/novel/repository";
import type {
  NovelBundle,
  NovelIdeaInterviewMessage,
} from "@/lib/novel/types";

const IDEE_MARK_START = "===IDEE===";
const IDEE_MARK_ENDE = "===ENDE===";

const SCOPE = `High-Concept-Idee für einen Belletristik-Roman (deutscher Markt).
Erlaubt: Prämisse, Konflikt, Figurenkerne, Setting, Ton, Leserversprechen, offene Spannungen.
Ton/Genre ausdrücklich benennen (z. B. humorvolle Satire, Thriller, Familiendrama) — das steuert die spätere Pipeline hart.
VERBOTEN: Kapitelgliederung, Beat-Sheets, Szenenfolgen, Akt-für-Akt-Pläne, fertige Prosa-Kapitel.`;

const OPENER =
  "Womit soll die Idee starten — Kernkonflikt, zentrale Figur oder Setting? Erzähle frei, ohne Kapitelplan und ohne feste Eigennamen, falls du sie noch nicht brauchst.";

function newMsg(
  role: "assistant" | "user",
  content: string,
): NovelIdeaInterviewMessage {
  return {
    id: crypto.randomUUID(),
    role,
    content: content.trim(),
    createdAt: new Date().toISOString(),
  };
}

function transcript(messages: NovelIdeaInterviewMessage[]): string {
  return messages
    .map((m) =>
      m.role === "assistant"
        ? `Lektor (Frage):\n${m.content}`
        : `Autor:\n${m.content}`,
    )
    .join("\n\n");
}

function parseIdeeMarkers(raw: string): string {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json|markdown|text)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  const mark = cleaned.match(
    /===IDEE(?:KURZ)?===\s*([\s\S]*?)(?:\s*===ENDE===|$)/i,
  );
  if (mark?.[1]?.trim()) return mark[1].trim();
  if (cleaned.length >= 40) return cleaned;
  throw new Error("Luna lieferte keine brauchbare Ideendokumentation.");
}

/** Seed first Haiku question when interview is empty. */
export async function startNovelIdeaInterview(
  novelId: string,
): Promise<NovelBundle> {
  const bundle = await getNovelBundle(novelId);
  if (!bundle) throw new Error("Roman nicht gefunden.");
  if (bundle.novel.ideaInterview.length > 0) return bundle;

  const opener = newMsg("assistant", OPENER);
  await updateNovel({
    id: novelId,
    ideaStatus: "interview",
    ideaInterview: [opener],
  });
  const next = await getNovelBundle(novelId);
  if (!next) throw new Error("Roman nach Interview-Start nicht gefunden.");
  return next;
}

/**
 * One turn: store user answer → Luna weaves idea → Haiku next question.
 */
export async function runNovelIdeaInterviewTurn(input: {
  novelId: string;
  userMessage: string;
}): Promise<NovelBundle> {
  const bundle = await getNovelBundle(input.novelId);
  if (!bundle) throw new Error("Roman nicht gefunden.");

  const userText = input.userMessage.trim();
  if (userText.length < 2) {
    throw new Error("Bitte eine Antwort eingeben.");
  }

  let messages = [...bundle.novel.ideaInterview];
  if (messages.length === 0) {
    messages = [newMsg("assistant", OPENER)];
  }

  const userMsg = newMsg("user", userText);
  messages = [...messages, userMsg];

  const priorIdea = bundle.novel.highConceptIdea.trim();

  const weaveRaw = await generateAsIdeaPartner({
    userText: `${SCOPE}

Du bist Ideen-Redakteur. Arbeite die neue Autor-Antwort in die High-Concept-Idee ein.
Behalte starke Formulierungen, streiche Widersprüche, schärfe Prämisse und Figurenkerne.
Wenn der Autor Humor/Satire/Komödie verlangt: die Wörter „Satire“ und/oder „Humor“ müssen im Ideentext stehen bleiben (Pipeline-Ton-Vertrag).
Kein Kapitelplan.

Bisherige Ideendokumentation:
${priorIdea || "(noch leer)"}

Interview bisher:
${transcript(messages)}

Ausgabe NUR so:

${IDEE_MARK_START}
…vollständige High-Concept-Idee als Fließtext…
${IDEE_MARK_ENDE}`,
  });

  const highConceptIdea = parseIdeeMarkers(weaveRaw);

  const nextQRaw = await generateAsEditorJson({
    userText: `${SCOPE}

Du bist strenger Lektor und stellst die NÄCHSTE offene Frage zur High-Concept-Idee.
Eine Frage (oder 2 kurze zusammenhängende), sokratisch, konkret.
Keine Kapitelpläne, keine Meta-Floskeln.

Bisherige Idee:
${highConceptIdea.slice(0, 8_000)}

Interview:
${transcript(messages).slice(0, 12_000)}

Antwort NUR als JSON: {"question":"…"}`,
  });

  let nextQuestion = "";
  try {
    const cleaned = nextQRaw
      .trim()
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();
    const parsed = JSON.parse(cleaned) as { question?: unknown };
    nextQuestion = String(parsed.question ?? "").trim();
  } catch {
    nextQuestion = nextQRaw.trim().slice(0, 4_000);
  }
  if (!nextQuestion || nextQuestion.length < 8) {
    throw new Error("Lektor hat keine Folgefrage geliefert.");
  }

  const assistantMsg = newMsg("assistant", nextQuestion.slice(0, 4_000));
  messages = [...messages, assistantMsg];

  await updateNovel({
    id: input.novelId,
    highConceptIdea,
    ideaStatus: "interview",
    ideaInterview: messages,
  });

  const next = await getNovelBundle(input.novelId);
  if (!next) throw new Error("Roman nach Interview-Runde nicht gefunden.");
  return next;
}

/** Lock idea for orchestrator. */
export async function finalizeNovelIdea(
  novelId: string,
): Promise<NovelBundle> {
  const bundle = await getNovelBundle(novelId);
  if (!bundle) throw new Error("Roman nicht gefunden.");
  const idea = bundle.novel.highConceptIdea.trim();
  if (idea.length < 20) {
    throw new Error(
      "Idee noch zu kurz (mind. 20 Zeichen). Bitte weiter interviewen oder Text ergänzen.",
    );
  }
  await updateNovel({
    id: novelId,
    ideaStatus: "ready",
    highConceptIdea: idea,
  });
  const next = await getNovelBundle(novelId);
  if (!next) throw new Error("Roman nach Freigabe nicht gefunden.");
  return next;
}

/** Manual paste / edit of idea; optionally leave interview or switch to ready. */
export async function saveNovelIdeaText(input: {
  novelId: string;
  highConceptIdea: string;
  ideaStatus?: "ready" | "interview";
}): Promise<NovelBundle> {
  const idea = input.highConceptIdea.trim();
  if (idea.length > 100_000) {
    throw new Error("Idee zu lang (max. 100.000 Zeichen).");
  }
  await updateNovel({
    id: input.novelId,
    highConceptIdea: idea,
    ideaStatus: input.ideaStatus,
  });
  const next = await getNovelBundle(input.novelId);
  if (!next) throw new Error("Roman nach Speichern nicht gefunden.");
  return next;
}
