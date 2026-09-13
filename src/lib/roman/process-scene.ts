/**
 * Phase 1–3 for one scene, one LLM phase per HTTP call.
 * Client chains draft → review → revise so each request stays under ~2 min
 * (avoids browser "Failed to fetch" on ~3 min monolith actions).
 */

import { generateText } from "@/lib/ai/provider";
import {
  buildRomanPromptContext,
  resolveFanPersona,
} from "@/lib/roman/fundament";
import { resolveRomanSchreibModel } from "@/lib/roman/model";
import {
  appendRomanZusammenfassung,
  claimNextSzene,
  getRomanKontext,
  listSzenen,
  recoverStuckRomanSzenen,
  updateSzene,
} from "@/lib/roman/repository";
import {
  buildStyleContinuityPackage,
  priorRevisedBefore,
} from "@/lib/roman/style-continuity";
import type { AiModelConfig } from "@/lib/prompts/catalog";
import type { ClaimedSzene, Szene } from "@/lib/roman/types";

const AUTHOR_SYSTEM = `Du bist Bestseller-Autor:in — aber für DIESE Szene schreibst du in der bereits etablierten Stimme DIESES Romans.
Tonalität, Stilmittel, Satzrhythmus, Bildsprache, Humor/Ernst und Wortwahl müssen ÜBERALL gleich sein wie in Stil-Pflicht und Stil-Anker.
Perspektive und Zeitform strikt einhalten. Figuren sprechen nur in ihrem festgelegten Register.
Show, don't tell. Volle literarische Länge. Glaubwürdige Dialoge, klare Motivation.
Kein Meta-Kommentar, keine Regel-Aufzählung im Fließtext, kein generischer KI-Ton, kein Stilbruch.`;

const LEKTOR_SYSTEM = `Du bist Cheflektor:in eines renommierten Belletristik-Verlags.
Prüfe die Szene knallhart auf:
1) Orthografie, Grammatik, Zeichensetzung, Tippfehler, doppelte Wörter, holprige Satzbauten
2) Dramaturgie, Pacing/Tempo, Klischees
3) Figurenmotivation und Dialog-Authentizität (Register laut Steckbrief)
4) Stilkonsistenz: Tonalität, Stilmittel und Wortwahl MÜSSEN zu Stil-Pflicht und Stil-Anker passen.
   Markiere jeden Stilbruch (Ton wechselt, andere Stimme, generischer KI-Stil, Perspektiv-/Zeitform-Fehler).
Nenne konkrete Stellen (kurzes Zitat) und Verbesserungsvorschläge. Orthografie und Stilbrüche zuerst. Keine Höflichkeitsfloskeln.`;

const REVISION_SYSTEM = `Du bist dieselbe Autorstimme wie in den Stil-Ankern und überarbeitest deine Szene.
Arbeite Lektor- und Fan-Feedback ein, ABER: Tonalität, Stilmittel und Wortwahl bleiben verbindlich wie Stil-Pflicht/Stil-Anker.
Bei Konflikt: Stilkonsistenz vor Fan-Wünschen, die den Ton brechen würden.
Korrigiere Orthografie/Grammatik/Zeichensetzung. Gib nur die finale Szene als Fließtext aus.`;

const SUMMARY_SYSTEM = `Du fasst Szenen für eine laufende Manuskript-Zusammenfassung zusammen.
Genau drei kurze Sätze auf Deutsch. Keine Spoiler-Warnung, kein Meta.`;

export type RomanSzeneStepPhase = "draft" | "review" | "revise" | "idle";

/** Slim scene handle for Server Actions — avoids shipping full drafts over the wire. */
export type RomanSzeneProgress = {
  id: string;
  kapitelNr: number;
  szenenNr: number;
  status: Szene["status"];
};

export type RomanSzeneStepResult = {
  /** No READY and no in-progress scene left. */
  done: boolean;
  /** This scene just reached COMPLETED. */
  sceneDone: boolean;
  phase: RomanSzeneStepPhase;
  szene: RomanSzeneProgress | null;
  message: string;
};

function toProgress(szene: Szene): RomanSzeneProgress {
  return {
    id: szene.id,
    kapitelNr: szene.kapitelNr,
    szenenNr: szene.szenenNr,
    status: szene.status,
  };
}

function sceneBible(scene: ClaimedSzene): string {
  return buildRomanPromptContext(scene, { includeManuskript: false });
}

async function loadStylePackage(scene: ClaimedSzene): Promise<string> {
  const [allScenes, roman] = await Promise.all([
    listSzenen(scene.romanId),
    getRomanKontext(scene.romanId),
  ]);
  const prior = priorRevisedBefore(allScenes, scene);
  return buildStyleContinuityPackage({
    scene,
    priorRevised: prior,
    manuskriptRaw: roman?.manuskriptRaw,
  });
}

function asClaimed(scene: Szene, roman: NonNullable<Awaited<ReturnType<typeof getRomanKontext>>>): ClaimedSzene {
  return {
    ...scene,
    stilbibel: roman.stilbibel,
    aktuelleZusammenfassung: roman.aktuelleZusammenfassung,
    genre: roman.genre,
    praemisse: roman.praemisse,
    perspektive: roman.perspektive,
    zeitform: roman.zeitform,
    tonalitaet: roman.tonalitaet,
    charaktere: roman.charaktere,
    weltSchauplaetze: roman.weltSchauplaetze,
    weltRegeln: roman.weltRegeln,
    szenenRaster: roman.szenenRaster,
    kiRegelwerk: roman.kiRegelwerk,
    fanPersonaName: roman.fanPersonaName,
    fanPersonaProfil: roman.fanPersonaProfil,
    editorial: roman.editorial,
  };
}

/**
 * Pick the earliest in-progress scene, or claim the next READY one.
 */
async function pickWorkScene(
  romanId: string,
): Promise<ClaimedSzene | null> {
  await recoverStuckRomanSzenen(romanId);

  const [roman, scenes] = await Promise.all([
    getRomanKontext(romanId),
    listSzenen(romanId),
  ]);
  if (!roman) throw new Error("Roman nicht gefunden.");

  const inProgress = [...scenes]
    .filter((s) =>
      ["DRAFTING", "REVIEWING", "REVISING"].includes(s.status),
    )
    .sort(
      (a, b) =>
        a.kapitelNr - b.kapitelNr || a.szenenNr - b.szenenNr,
    )[0];

  if (inProgress) return asClaimed(inProgress, roman);

  return claimNextSzene(romanId);
}

function clipText(text: string, maxChars: number): string {
  const clean = text.trim();
  if (clean.length <= maxChars) return clean;
  return `${clean.slice(0, maxChars)}\n\n[… gekürzt …]`;
}

async function writeAuthorDraft(
  scene: ClaimedSzene,
  stylePackage: string,
  model: AiModelConfig,
): Promise<string> {
  const bible = sceneBible(scene);
  const minW = scene.editorial.zielWortzahlSzeneMin ?? 1800;
  const maxW = scene.editorial.zielWortzahlSzeneMax ?? 2500;
  return generateText({
    model,
    systemInstruction: AUTHOR_SYSTEM,
    maxTokens: 8192,
    userText: `Schreibe diese Szene in voller Länge aus (Ziel ca. ${minW}–${maxW} Wörter).
Dieselbe Stimme wie Stil-Anker — Tonalität und Stilmittel überall gleich.

Kapitel ${scene.kapitelNr}, Szene ${scene.szenenNr}

${stylePackage}

Buch-Fundament / Welt / Figuren / weiteres Regelwerk:
---
${clipText(bible || scene.stilbibel.trim() || "(kein extra Kontext)", 40_000)}
---

Was bisher geschah (nur Inhalt, kein Freibrief für Stilwechsel):
---
${clipText(scene.aktuelleZusammenfassung.trim() || "(Anfang des Romans)", 8_000)}
---

Szenen-Briefing:
---
${scene.briefing}
---`,
  });
}

async function writeLektorFeedback(
  entwurf: string,
  scene: ClaimedSzene,
  stylePackage: string,
  model: AiModelConfig,
): Promise<string> {
  const bible = sceneBible(scene);
  return generateText({
    model,
    systemInstruction: LEKTOR_SYSTEM,
    maxTokens: 2500,
    userText: `${stylePackage}

Weiterer Kontext:
---
${clipText(bible || "(kein extra Kontext)", 20_000)}
---

Szenen-Entwurf zur Prüfung:
---
${entwurf}
---`,
  });
}

async function writeFanFeedback(
  entwurf: string,
  scene: ClaimedSzene,
  model: AiModelConfig,
): Promise<string> {
  const fan = resolveFanPersona(scene);
  const ton = scene.tonalitaet.trim();
  const systemInstruction = `Du bist die Fan-Persona „${fan.name}“ und Testleser:in.

${fan.profil}

${ton ? `Erwartete Buch-Tonalität: ${ton}. Wenn die Szene anders klingt als der Rest des Romans, sag das klar.` : ""}

Prüfe die Szene auf: Emotionen, Spannung, Lesefluss, Identifikation mit den Hauptfiguren, stilistische Stimmigkeit zur bekannten Tonalität.
Sage klar, wo du gelangweilt warst und wo du mitgefiebert hast. Konkrete Wünsche für die Überarbeitung.
Du bist keine Lektor:in — dich interessiert, ob du weiterlesen würdest.`;

  return generateText({
    model,
    systemInstruction,
    maxTokens: 2000,
    userText: `Szenen-Entwurf als Testleser:\n\n${entwurf}`,
  });
}

async function writeRevision(input: {
  entwurf: string;
  lektor: string;
  fan: string;
  scene: ClaimedSzene;
  stylePackage: string;
  model: AiModelConfig;
}): Promise<string> {
  const bible = sceneBible(input.scene);
  return generateText({
    model: input.model,
    systemInstruction: REVISION_SYSTEM,
    maxTokens: 8192,
    userText: `${input.stylePackage}

Weiteres Fundament (einhalten):
---
${clipText(bible || "(kein extra Kontext)", 20_000)}
---

Ursprünglicher Entwurf:
---
${input.entwurf}
---

Feedback Verlagslektor:
---
${clipText(input.lektor, 6_000)}
---

Feedback Fan-Persona:
---
${clipText(input.fan, 4_000)}
---

Schreibe die überarbeitete, finale Szene — stilistisch wie die Anker, inhaltlich verbessert.`,
  });
}

async function writeSceneSummary(
  finalText: string,
  model: AiModelConfig,
): Promise<string> {
  return generateText({
    model,
    systemInstruction: SUMMARY_SYSTEM,
    maxTokens: 400,
    userText: `Finale Szene:\n\n${clipText(finalText, 12_000)}`,
  });
}

/**
 * Runs exactly one pipeline phase for the next (or in-progress) scene.
 * Call repeatedly from the client until `sceneDone` or `done`.
 */
export async function advanceRomanSzeneStep(
  romanId: string,
  modelId?: string | null,
): Promise<RomanSzeneStepResult> {
  const claimed = await pickWorkScene(romanId);
  if (!claimed) {
    return {
      done: true,
      sceneDone: false,
      phase: "idle",
      szene: null,
      message: "Keine Szene mehr offen (READY / Entwurf / Review / Revision).",
    };
  }

  const model = await resolveRomanSchreibModel(modelId);
  const label = `Kap. ${claimed.kapitelNr}.${claimed.szenenNr}`;
  const hasDraft = claimed.entwurfRaw.trim().length > 0;
  const hasFeedback =
    claimed.feedbackLektor.trim().length > 0 &&
    claimed.feedbackFan.trim().length > 0;

  try {
    // Phase A: author draft
    if (!hasDraft) {
      const stylePackage = await loadStylePackage(claimed);
      const entwurf = (await writeAuthorDraft(claimed, stylePackage, model)).trim();
      if (!entwurf) throw new Error("Autor lieferte leeren Entwurf.");
      const szene = await updateSzene({
        id: claimed.id,
        entwurfRaw: entwurf,
        status: "REVIEWING",
      });
      return {
        done: false,
        sceneDone: false,
        phase: "draft",
        szene: toProgress(szene),
        message: `${label}: Entwurf fertig — als Nächstes Lektor/Fan.`,
      };
    }

    // Phase B: lektor then fan (sequential — parallel doubles peak RAM / sockets).
    if (!hasFeedback) {
      const stylePackage = await loadStylePackage(claimed);
      const entwurf = claimed.entwurfRaw.trim();
      const lektor = await writeLektorFeedback(
        entwurf,
        claimed,
        stylePackage,
        model,
      );
      const fan = await writeFanFeedback(entwurf, claimed, model);
      const szene = await updateSzene({
        id: claimed.id,
        feedbackLektor: lektor.trim(),
        feedbackFan: fan.trim(),
        status: "REVISING",
      });
      return {
        done: false,
        sceneDone: false,
        phase: "review",
        szene: toProgress(szene),
        message: `${label}: Feedback fertig — als Nächstes Revision.`,
      };
    }

    // Phase C: revision + summary
    const stylePackage = await loadStylePackage(claimed);
    const revised = (
      await writeRevision({
        entwurf: claimed.entwurfRaw.trim(),
        lektor: claimed.feedbackLektor.trim(),
        fan: claimed.feedbackFan.trim(),
        scene: claimed,
        stylePackage,
        model,
      })
    ).trim();
    if (!revised) throw new Error("Revision lieferte leeren Text.");

    const summary = (await writeSceneSummary(revised, model)).trim();
    await appendRomanZusammenfassung(
      romanId,
      `Kap. ${claimed.kapitelNr} / Szene ${claimed.szenenNr}: ${summary}`,
    );
    const szene = await updateSzene({
      id: claimed.id,
      entwurfRevidiert: revised,
      status: "COMPLETED",
    });
    return {
      done: false,
      sceneDone: true,
      phase: "revise",
      szene: toProgress(szene),
      message: `${label}: Szene abgeschlossen.`,
    };
  } catch (error) {
    // Keep partial progress: empty draft → READY; otherwise stay for retry.
    if (!hasDraft) {
      await updateSzene({
        id: claimed.id,
        status: "READY_FOR_WRITING",
      }).catch(() => undefined);
    }
    throw error;
  }
}

/**
 * Legacy: runs all phases of one scene in a single call (prefer step API).
 */
export async function processNextRomanSzene(
  romanId: string,
  modelId?: string | null,
): Promise<{ szene: RomanSzeneProgress; summaryAppended: string } | null> {
  for (let i = 0; i < 8; i += 1) {
    const step = await advanceRomanSzeneStep(romanId, modelId);
    if (step.done) return null;
    if (step.sceneDone && step.szene) {
      return { szene: step.szene, summaryAppended: "" };
    }
  }
  throw new Error("Szenen-Pipeline: zu viele Schritte ohne Abschluss.");
}
