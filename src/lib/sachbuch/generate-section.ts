/**
 * 3-pass Sachbuch chapter generation (Writer → Critic → Stylist).
 * Progress is persisted on the kapitel row so the UI can poll via RPC.
 */

import { generateWithGemini } from "@/lib/ai/gemini";
import { generateText } from "@/lib/ai/provider";
import {
  SACHBUCH_TARGET_WORDS_MAX,
  SACHBUCH_TARGET_WORDS_MIN,
} from "@/lib/sachbuch/agent-defaults";
import {
  getSachbuchKontext,
  patchSachbuchKapitel,
  upsertSachbuchKontext,
} from "@/lib/sachbuch/repository";
import { resolveSachbuchAgentModel } from "@/lib/sachbuch/resolve-agent";
import type {
  SachbuchGroundingSource,
  SachbuchKapitel,
  SachbuchKontext,
} from "@/lib/sachbuch/types";

export type SachbuchGenerateFromPass = "1" | "2" | "3";

async function setProgress(
  sachbuchId: string,
  kapitelId: string,
  patch: Partial<SachbuchKapitel>,
): Promise<void> {
  await patchSachbuchKapitel(sachbuchId, kapitelId, patch);
}

/**
 * Runs the 3-pass pipeline (or from Pass 2/3 if drafts exist).
 */
export async function generateSachbuchKapitel(input: {
  sachbuchId: string;
  kapitelId: string;
  fromPass?: SachbuchGenerateFromPass;
}): Promise<SachbuchKontext> {
  const fromPass = input.fromPass ?? "2";
  const jobId = crypto.randomUUID();

  let book = await getSachbuchKontext(input.sachbuchId);
  if (!book) throw new Error("Sachbuch nicht gefunden.");
  let kapitel = book.kapitel.find((k) => k.id === input.kapitelId);
  if (!kapitel) throw new Error("Kapitel nicht gefunden.");

  if (kapitel.status === "generating" && kapitel.generationJobId) {
    throw new Error("Für dieses Kapitel läuft bereits eine Generierung.");
  }

  const briefing =
    kapitel.finalText.trim() ||
    kapitel.interviewBriefing.trim() ||
    (kapitel.interviewMessages.length > 0
      ? kapitel.interviewMessages
          .map((m) => `${m.role}: ${m.content}`)
          .join("\n")
      : "");
  if (!briefing.trim() && fromPass === "1") {
    throw new Error(
      "Kein Kapiteltext — bitte zuerst Abschnitte schreiben (Phase 5).",
    );
  }
  if (!kapitel.finalText.trim() && fromPass !== "1") {
    throw new Error(
      "Kein zusammengesetzter Kapiteltext — Phase 5 Abschnitte zuerst.",
    );
  }

  book = await patchSachbuchKapitel(input.sachbuchId, input.kapitelId, {
    status: "generating",
    generationJobId: jobId,
    generationProgress: "Starte 3-Pass-Pipeline …",
    generationError: null,
  });
  kapitel = book.kapitel.find((k) => k.id === input.kapitelId)!;

  try {
    let draftPass1 = kapitel.draftPass1.trim() || kapitel.finalText.trim();
    let critiquePass2 = kapitel.critiquePass2;
    let groundingSources: SachbuchGroundingSource[] = kapitel.groundingSources;

    if (fromPass === "1") {
      await setProgress(input.sachbuchId, input.kapitelId, {
        generationProgress: "Pass 1: Konsistenz-Rewrite …",
        generationJobId: jobId,
        status: "generating",
      });

      const writer = book.agents.writer;
      const writerModel = await resolveSachbuchAgentModel(writer);
      const userText = `Kapitel-Titel: ${kapitel.title}
UVP: ${book.idee.unpopularOpinion}
Ziele: ${kapitel.goals.trim() || "—"}
Context Graph Claims: ${kapitel.contextGraph.claimsToProve.join("; ") || "—"}

Bisheriger zusammengesetzter Text (Phase 5):
${briefing}

Schreibe einen konsistenten Erstentwurf / Rewrite (Ziel ca. ${SACHBUCH_TARGET_WORDS_MIN}–${SACHBUCH_TARGET_WORDS_MAX} Wörter).`;

      if (
        writer.googleSearch &&
        writerModel.provider.trim().toLowerCase() === "gemini"
      ) {
        const result = await generateWithGemini({
          modelSlug: writerModel.modelSlug,
          systemInstruction: writer.systemPrompt,
          userText,
          googleSearch: true,
          maxTokens: 8192,
          timeoutMs: 300_000,
        });
        draftPass1 = result.text.trim();
        groundingSources = (result.groundingSources ?? []).map((s) => ({
          title: s.title || s.uri,
          uri: s.uri,
        }));
      } else {
        draftPass1 = (
          await generateText({
            model: writerModel,
            systemInstruction: writer.systemPrompt,
            userText,
            googleSearch: false,
            maxTokens: 8192,
            timeoutMs: 300_000,
          })
        ).trim();
        groundingSources = [];
      }

      await setProgress(input.sachbuchId, input.kapitelId, {
        draftPass1,
        groundingSources,
        generationProgress: "Pass 1 fertig — Critic prüft …",
        generationJobId: jobId,
        status: "generating",
      });
    } else if (!draftPass1.trim()) {
      throw new Error("Kein Kapiteltext für Lektorat — Phase 5 zuerst.");
    }

    if (fromPass === "1" || fromPass === "2") {
      await setProgress(input.sachbuchId, input.kapitelId, {
        generationProgress: "Pass 2: Devil's Advocate prüft Logik & Fakten …",
        generationJobId: jobId,
        status: "generating",
      });
      book = (await getSachbuchKontext(input.sachbuchId))!;
      const critic = book.agents.critic;
      const criticModel = await resolveSachbuchAgentModel(critic);
      critiquePass2 = (
        await generateText({
          model: criticModel,
          systemInstruction: critic.systemPrompt,
          userText: `Kapitel: ${kapitel.title}

Entwurf (Pass 1):
${draftPass1}

Prüfe Logik, Argumente und Fakten. Liefere strukturierte Kritik.`,
          maxTokens: 6000,
          timeoutMs: 300_000,
        })
      ).trim();

      await setProgress(input.sachbuchId, input.kapitelId, {
        critiquePass2,
        generationProgress: "Pass 2 fertig — Style Matcher schreibt …",
        generationJobId: jobId,
        status: "generating",
      });
    } else if (!critiquePass2.trim()) {
      throw new Error("Keine Critic-Ausgabe — bitte ab Pass 2 starten.");
    }

    await setProgress(input.sachbuchId, input.kapitelId, {
      generationProgress: "Pass 3: Style Matcher poliert auf Autor-DNA …",
      generationJobId: jobId,
      status: "generating",
    });
    book = (await getSachbuchKontext(input.sachbuchId))!;
    const stylist = book.agents.stylist;
    const stylistModel = await resolveSachbuchAgentModel(stylist);
    const finalText = (
      await generateText({
        model: stylistModel,
        systemInstruction: stylist.systemPrompt,
        userText: `Kapitel: ${kapitel.title}

Stilbibel / Autor-DNA:
${book.stilbibel.trim() || "(keine Stilbibel — klarer Sachbuch-Ton)"}

Entwurf (Pass 1):
${draftPass1}

Kritik (Pass 2):
${critiquePass2}

Schreibe die fertige Kapitelprosa (Ziel ca. ${SACHBUCH_TARGET_WORDS_MIN}–${SACHBUCH_TARGET_WORDS_MAX} Wörter).`,
        maxTokens: 8192,
        timeoutMs: 300_000,
      })
    ).trim();

    return patchSachbuchKapitel(input.sachbuchId, input.kapitelId, {
      draftPass1,
      critiquePass2,
      finalText,
      groundingSources,
      status: "ready",
      generationJobId: null,
      generationProgress: null,
      generationError: null,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Generierung fehlgeschlagen.";
    await patchSachbuchKapitel(input.sachbuchId, input.kapitelId, {
      status: "error",
      generationJobId: null,
      generationProgress: null,
      generationError: message,
    }).catch(() => {
      /* best-effort */
    });
    throw error;
  }
}

/** Persist edited final text / meta without regenerating. */
export async function saveSachbuchKapitelFields(
  sachbuchId: string,
  kapitel: SachbuchKapitel,
): Promise<SachbuchKontext> {
  const book = await getSachbuchKontext(sachbuchId);
  if (!book) throw new Error("Sachbuch nicht gefunden.");
  const next = book.kapitel.map((k) =>
    k.id === kapitel.id
      ? { ...kapitel, updatedAt: new Date().toISOString() }
      : k,
  );
  return upsertSachbuchKontext({
    id: book.id,
    title: book.title,
    stilbibel: book.stilbibel,
    zielgruppe: book.zielgruppe,
    agents: book.agents,
    idee: book.idee,
    evidenz: book.evidenz,
    makro: book.makro,
    kapitel: next,
  });
}
