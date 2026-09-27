/**
 * Phase 5 â€” iterative section writing (300â€“500 words).
 * Auto pipeline: draft â†’ checkpoint + web research â†’ Critic â†’ Style.
 */

import { generateWithGemini } from "@/lib/ai/gemini";
import { generateText } from "@/lib/ai/provider";
import {
  SACHBUCH_ABSCHNITT_WORDS_MAX,
  SACHBUCH_ABSCHNITT_WORDS_MIN,
} from "@/lib/sachbuch/agent-defaults";
import { concatAbschnitteText } from "@/lib/sachbuch/parse";
import { resolveSachbuchAgentModel } from "@/lib/sachbuch/resolve-agent";
import {
  getSachbuchKontext,
  patchSachbuchKapitel,
} from "@/lib/sachbuch/repository";
import type {
  SachbuchAbschnitt,
  SachbuchAbschnittRevision,
  SachbuchAbschnittRevisionKind,
  SachbuchKontext,
} from "@/lib/sachbuch/types";
import { SACHBUCH_ABSCHNITT_REVISION_KIND_LABELS } from "@/lib/sachbuch/types";
import type { AiModelConfig } from "@/lib/prompts/catalog";

/**
 * Ensure a section is self-contained at the boundaries:
 * no mid-sentence openers (", und â€¦") and a finished closer (. ! ?).
 */
export function normalizeAbschnittBoundaries(text: string): string {
  let t = text.trim();
  t = t.replace(/^[,;:\-â€“â€”.â€¦]+(\s+|$)/, "").trim();
  t = t.replace(/^(und|oder|aber|denn|sondern|sowie)\b[\s,;:]*/i, "").trim();
  if (!t) return text.trim();
  const first = t.charAt(0);
  if (first !== first.toUpperCase()) {
    t = first.toUpperCase() + t.slice(1);
  }
  t = t.replace(/[,;:\-â€“â€”]+\s*$/u, "").trim();
  if (t && !/[.!?â€¦]["Â»'\u201d\u2019]?$/u.test(t)) {
    t = `${t}.`;
  }
  return t;
}

/** @deprecated Use normalizeAbschnittBoundaries */
export function normalizeAbschnittOpening(text: string): string {
  return normalizeAbschnittBoundaries(text);
}

const ABSCHNITT_BOUNDARY_RULES = `Der Abschnitt muss in sich geschlossen sein:
- Anfang: vollstÃ¤ndiger neuer Satz (GroÃŸbuchstabe) â€” nie mit Komma/Kleinbuchstaben mitten im Satz fortsetzen.
- Ende: abgeschlossener Gedanke mit . ! oder ? â€” kein Satz, der erst im nÃ¤chsten Abschnitt weitergeht.
- Inhaltlich an den bisherigen Text anknÃ¼pfen, aber satztechnisch eigenstÃ¤ndig (keine Satztrennung Ã¼ber Abschnittsgrenzen).
Keine Meta-Einleitung.`;

const REVISION_OUTPUT_RULES = `Antworte streng in diesem Format (keine anderen Ãœberschriften):
===Ã„NDERUNGEN===
- kurzer Bullet, was du geÃ¤ndert/eingebaut hast
- weiterer Bullet (3â€“6 StÃ¼ck)
===TEXT===
(nur der vollstÃ¤ndige Ã¼berarbeitete Abschnitt, ${SACHBUCH_ABSCHNITT_WORDS_MIN}â€“${SACHBUCH_ABSCHNITT_WORDS_MAX} WÃ¶rter)`;

type ParsedRevisionBody = {
  summary: string;
  text: string;
};

function parseRevisionBody(
  raw: string,
  fallbackText: string,
): ParsedRevisionBody {
  const marker = "===TEXT===";
  const idx = raw.indexOf(marker);
  if (idx >= 0) {
    const head = raw
      .slice(0, idx)
      .replace(/^===Ã„NDERUNGEN===\s*/i, "")
      .trim();
    const text = normalizeAbschnittBoundaries(
      raw.slice(idx + marker.length).trim(),
    );
    return {
      summary: head || "Ãœberarbeitet.",
      text: text || normalizeAbschnittBoundaries(fallbackText),
    };
  }
  return {
    summary: "Ãœberarbeitet.",
    text: normalizeAbschnittBoundaries(raw.trim() || fallbackText),
  };
}

function makeRevision(input: {
  kind: SachbuchAbschnittRevisionKind;
  summary: string;
  beforeText: string;
  afterText: string;
  meta?: string;
}): SachbuchAbschnittRevision {
  return {
    id: crypto.randomUUID(),
    kind: input.kind,
    label: SACHBUCH_ABSCHNITT_REVISION_KIND_LABELS[input.kind],
    summary: input.summary.trim() || "Ãœberarbeitet.",
    beforeText: input.beforeText,
    afterText: input.afterText,
    meta: (input.meta ?? "").trim(),
    createdAt: new Date().toISOString(),
  };
}

async function writerRevise(input: {
  model: AiModelConfig;
  systemInstruction: string;
  userText: string;
  googleSearch: boolean;
}): Promise<{ text: string; sourcesNote: string }> {
  const useSearch =
    input.googleSearch &&
    input.model.provider.trim().toLowerCase() === "gemini";

  if (useSearch) {
    const result = await generateWithGemini({
      modelSlug: input.model.modelSlug,
      systemInstruction: input.systemInstruction,
      userText: input.userText,
      googleSearch: true,
      maxTokens: 3500,
      timeoutMs: 180_000,
    });
    const sources = (result.groundingSources ?? [])
      .slice(0, 6)
      .map((s) => `- ${s.title || s.uri}: ${s.uri}`)
      .join("\n");
    return {
      text: result.text.trim(),
      sourcesNote: sources ? `Quellen:\n${sources}` : "",
    };
  }

  const text = (
    await generateText({
      model: input.model,
      systemInstruction: input.systemInstruction,
      userText: input.userText,
      maxTokens: 3500,
      timeoutMs: 180_000,
    })
  ).trim();
  return { text, sourcesNote: "" };
}

/**
 * Generate next section and run the full auto pipeline:
 * draft â†’ checkpoint question + web research revise â†’ Critic revise â†’ Style polish.
 */
export async function generateNextAbschnitt(input: {
  sachbuchId: string;
  kapitelId: string;
}): Promise<SachbuchKontext> {
  const book = await getSachbuchKontext(input.sachbuchId);
  if (!book) throw new Error("Sachbuch nicht gefunden.");
  const kapitel = book.kapitel.find((k) => k.id === input.kapitelId);
  if (!kapitel) throw new Error("Kapitel nicht gefunden.");

  const pending = kapitel.abschnitte.find((a) => a.status === "checkpoint");
  if (pending) {
    throw new Error(
      "Zuerst den offenen Checkpoint beantworten (Ãœberarbeiten) â€” Legacy-Abschnitt.",
    );
  }

  const writer = book.agents.writer;
  const writerModel = await resolveSachbuchAgentModel(writer);
  const prevText = concatAbschnitteText(
    kapitel.abschnitte.filter((a) => a.status !== "draft"),
  );
  const order = kapitel.abschnitte.length;

  const baseContext = `Buch: ${book.title}
Stilbibel: ${book.stilbibel.trim() || "â€”"}
UVP: ${book.idee.unpopularOpinion}

Kapitel: ${kapitel.title}
Ziele: ${kapitel.goals}

Context Graph:
- Leserwissen: ${kapitel.contextGraph.readerKnowledge}
- Begriffe: ${kapitel.contextGraph.establishedTerms.join(", ") || "â€”"}
- Zu beweisen: ${kapitel.contextGraph.claimsToProve.join("; ") || "â€”"}`;

  const draftText = normalizeAbschnittBoundaries(
    (
      await generateText({
        model: writerModel,
        systemInstruction: writer.systemPrompt,
        userText: `${baseContext}

Bisheriger Kapiteltext (endet mit einem abgeschlossenen Abschnitt â€” setze NICHT mitten im Satz fort):
${prevText || "(Anfang)"}

Schreibe den NÃ„CHSTEN Abschnitt (${SACHBUCH_ABSCHNITT_WORDS_MIN}â€“${SACHBUCH_ABSCHNITT_WORDS_MAX} WÃ¶rter).
${ABSCHNITT_BOUNDARY_RULES}`,
        maxTokens: 3500,
        timeoutMs: 180_000,
      })
    ).trim(),
  );

  const interviewer = book.agents.interviewer;
  const interviewerModel = await resolveSachbuchAgentModel(interviewer);
  const checkpoint = (
    await generateText({
      model: interviewerModel,
      systemInstruction: interviewer.systemPrompt,
      userText: `Du prÃ¼fst einen frischen Sachbuch-Abschnitt.
Stelle EINE konkrete Checkpoint-Frage, die Recherche oder ein greifbares Beispiel braucht
(Metapher, persÃ¶nliche Geschichte, fehlendes Beispiel, Klarheit, Beleg).
Nur die Frage, kein Vorspann.

Abschnitt:
${draftText}`,
      maxTokens: 400,
      timeoutMs: 60_000,
    })
  ).trim();

  const revisions: SachbuchAbschnittRevision[] = [];
  let currentText = draftText;

  // --- Checkpoint: research on the web + build into section ---
  const researcher = book.agents.researcher;
  const researcherModel = await resolveSachbuchAgentModel(researcher);
  const useResearcherSearch =
    researcher.googleSearch &&
    researcherModel.provider.trim().toLowerCase() === "gemini";
  const checkpointModel = useResearcherSearch ? researcherModel : writerModel;
  const checkpointSystem = useResearcherSearch
    ? `${researcher.systemPrompt}

Danach schreibst du den Ã¼berarbeiteten Sachbuch-Abschnitt im Stil des Writers (deutsch, ${SACHBUCH_ABSCHNITT_WORDS_MIN}â€“${SACHBUCH_ABSCHNITT_WORDS_MAX} WÃ¶rter).`
    : writer.systemPrompt;
  const wantSearch =
    useResearcherSearch ||
    (writer.googleSearch &&
      writerModel.provider.trim().toLowerCase() === "gemini");

  const checkpointRaw = await writerRevise({
    model: checkpointModel,
    systemInstruction: checkpointSystem,
    googleSearch: wantSearch,
    userText: `${baseContext}

Checkpoint-Frage (automatisch):
${checkpoint}

Auftrag: Recherchiere die Antwort im Internet (Fakten, Beispiele, greifbare Anschauung) und arbeite sie natÃ¼rlich in den Abschnitt ein.
Keine erfundenen Studien/Zahlen. Wenn nichts Belastbares gefunden: ehrlich knapper belassen, aber die Frage so gut wie mÃ¶glich beantworten.
Behalte LÃ¤nge und Abschnittsgrenzen.

Original:
${currentText}

${REVISION_OUTPUT_RULES}
${ABSCHNITT_BOUNDARY_RULES}`,
  });
  const checkpointParsed = parseRevisionBody(checkpointRaw.text, currentText);
  const checkpointMeta = [
    `Frage: ${checkpoint}`,
    checkpointRaw.sourcesNote,
  ]
    .filter(Boolean)
    .join("\n\n");
  if (checkpointParsed.text !== currentText) {
    revisions.push(
      makeRevision({
        kind: "checkpoint",
        summary: checkpointParsed.summary,
        beforeText: currentText,
        afterText: checkpointParsed.text,
        meta: checkpointMeta,
      }),
    );
    currentText = checkpointParsed.text;
  } else {
    revisions.push(
      makeRevision({
        kind: "checkpoint",
        summary:
          checkpointParsed.summary ||
          "Recherche lief â€” Text blieb im Wesentlichen gleich.",
        beforeText: currentText,
        afterText: currentText,
        meta: checkpointMeta,
      }),
    );
  }

  // --- Critic ---
  const critic = book.agents.critic;
  const criticModel = await resolveSachbuchAgentModel(critic);
  const critique = (
    await generateText({
      model: criticModel,
      systemInstruction: critic.systemPrompt,
      userText: `PrÃ¼fe diesen Sachbuch-Abschnitt (nicht das ganze Buch).
Kapitel: ${kapitel.title}
UVP: ${book.idee.unpopularOpinion}

Abschnitt:
${currentText}

Liefere strukturierte Kritik: Logik, fehlende Belege, schwache Stellen, Klarheit.
Konkrete Ã„nderungsvorschlÃ¤ge, keine Umschreibung des ganzen Texts.`,
      maxTokens: 3500,
      timeoutMs: 180_000,
    })
  ).trim();

  const criticRaw = await writerRevise({
    model: writerModel,
    systemInstruction: writer.systemPrompt,
    googleSearch: false,
    userText: `${baseContext}

Critic-Feedback:
${critique}

Ãœberarbeite den Abschnitt und setze die Kritik um (nur sinnvolle Punkte).
Behalte Abschnittsgrenzen und Zielwortzahl.

Original:
${currentText}

${REVISION_OUTPUT_RULES}
${ABSCHNITT_BOUNDARY_RULES}`,
  });
  const criticParsed = parseRevisionBody(criticRaw.text, currentText);
  revisions.push(
    makeRevision({
      kind: "critic",
      summary: criticParsed.summary,
      beforeText: currentText,
      afterText: criticParsed.text,
      meta: critique,
    }),
  );
  currentText = criticParsed.text;

  // --- Style ---
  const stylist = book.agents.stylist;
  const stylistModel = await resolveSachbuchAgentModel(stylist);
  const styleRaw = (
    await generateText({
      model: stylistModel,
      systemInstruction: stylist.systemPrompt,
      userText: `Poliere diesen Sachbuch-Abschnitt auf die Autor-DNA / Stilbibel.
Ã„ndere Inhalt nur, wenn der Stil es zwingend verlangt â€” Fokus: Rhythmus, Klarheit, Stimme.

Stilbibel:
${book.stilbibel.trim() || "(keine Stilbibel â€” klarer, lebendiger Sachbuch-Ton)"}

Original:
${currentText}

${REVISION_OUTPUT_RULES}
${ABSCHNITT_BOUNDARY_RULES}`,
      maxTokens: 3500,
      timeoutMs: 180_000,
    })
  ).trim();
  const styleParsed = parseRevisionBody(styleRaw, currentText);
  revisions.push(
    makeRevision({
      kind: "style",
      summary: styleParsed.summary,
      beforeText: currentText,
      afterText: styleParsed.text,
      meta: "",
    }),
  );
  currentText = styleParsed.text;

  const abschnitt: SachbuchAbschnitt = {
    id: crypto.randomUUID(),
    order,
    promptBrief: `Abschnitt ${order + 1}`,
    draftText: currentText,
    authorCheckpoint: checkpoint,
    authorReply: "Automatische Checkpoint-Recherche (Internet).",
    status: "revised",
    revisions,
  };

  const abschnitte = [...kapitel.abschnitte, abschnitt];
  return patchSachbuchKapitel(input.sachbuchId, input.kapitelId, {
    abschnitte,
    finalText: concatAbschnitteText(abschnitte),
    status: "writing",
  });
}

/** Author answers checkpoint: accept or revise section (legacy open checkpoints). */
export async function replyAbschnittCheckpoint(input: {
  sachbuchId: string;
  kapitelId: string;
  abschnittId: string;
  reply: string;
  revise: boolean;
}): Promise<SachbuchKontext> {
  const book = await getSachbuchKontext(input.sachbuchId);
  if (!book) throw new Error("Sachbuch nicht gefunden.");
  const kapitel = book.kapitel.find((k) => k.id === input.kapitelId);
  if (!kapitel) throw new Error("Kapitel nicht gefunden.");
  const abschnitt = kapitel.abschnitte.find((a) => a.id === input.abschnittId);
  if (!abschnitt) throw new Error("Abschnitt nicht gefunden.");
  if (abschnitt.status !== "checkpoint") {
    throw new Error("Kein offener Checkpoint fÃ¼r diesen Abschnitt.");
  }

  let draftText = abschnitt.draftText;
  let revisions = [...(abschnitt.revisions ?? [])];
  if (input.revise) {
    const writer = book.agents.writer;
    const model = await resolveSachbuchAgentModel(writer);
    const userText = `Ãœberarbeite den Abschnitt anhand der Autor-Antwort.
Stilbibel: ${book.stilbibel.trim() || "â€”"}
Checkpoint: ${abschnitt.authorCheckpoint}
Autor: ${input.reply.trim()}

Original:
${abschnitt.draftText}

Wenn der Autor Recherche/Belege fordert (z. B. â€žkeine Ahnungâ€œ, â€žsuch im Internetâ€œ): recherchiere und arbeite passende Fakten ein â€” keine erfundenen Studien/Zahlen.
Schreibe die Ã¼berarbeitete Fassung (${SACHBUCH_ABSCHNITT_WORDS_MIN}â€“${SACHBUCH_ABSCHNITT_WORDS_MAX} WÃ¶rter).
${REVISION_OUTPUT_RULES}
${ABSCHNITT_BOUNDARY_RULES}`;

    const useSearch =
      model.provider.trim().toLowerCase() === "gemini" &&
      (writer.googleSearch || book.agents.researcher.googleSearch);

    const raw = await writerRevise({
      model,
      systemInstruction: writer.systemPrompt,
      userText,
      googleSearch: useSearch,
    });
    const parsed = parseRevisionBody(raw.text, abschnitt.draftText);
    revisions = [
      ...revisions,
      makeRevision({
        kind: "checkpoint",
        summary: parsed.summary,
        beforeText: abschnitt.draftText,
        afterText: parsed.text,
        meta: [
          `Frage: ${abschnitt.authorCheckpoint}`,
          `Autor: ${input.reply.trim()}`,
          raw.sourcesNote,
        ]
          .filter(Boolean)
          .join("\n\n"),
      }),
    ];
    draftText = parsed.text;
  }

  const abschnitte = kapitel.abschnitte.map((a) =>
    a.id === input.abschnittId
      ? {
          ...a,
          draftText,
          authorReply: input.reply.trim(),
          status: (input.revise ? "revised" : "accepted") as
            | "revised"
            | "accepted",
          revisions,
        }
      : a,
  );

  return patchSachbuchKapitel(input.sachbuchId, input.kapitelId, {
    abschnitte,
    finalText: concatAbschnitteText(abschnitte),
    status: "writing",
  });
}
