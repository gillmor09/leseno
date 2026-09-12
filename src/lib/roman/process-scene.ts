/**
 * Phase 1–3 for one scene: author → lektor∥fan → revision → summary.
 * Enforces tonality / stylistic devices via Stil-Pflicht + prose Stil-Anker.
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

async function writeAuthorDraft(
  scene: ClaimedSzene,
  stylePackage: string,
  model: AiModelConfig,
): Promise<string> {
  const bible = sceneBible(scene);
  return generateText({
    model,
    systemInstruction: AUTHOR_SYSTEM,
    userText: `Schreibe diese Szene in voller Länge aus (Ziel ca. 1.800–2.500 Wörter).
Dieselbe Stimme wie Stil-Anker — Tonalität und Stilmittel überall gleich.

Kapitel ${scene.kapitelNr}, Szene ${scene.szenenNr}

${stylePackage}

Buch-Fundament / Welt / Figuren / weiteres Regelwerk:
---
${bible || scene.stilbibel.trim() || "(kein extra Kontext)"}
---

Was bisher geschah (nur Inhalt, kein Freibrief für Stilwechsel):
---
${scene.aktuelleZusammenfassung.trim() || "(Anfang des Romans)"}
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
    userText: `${stylePackage}

Weiterer Kontext:
---
${bible || "(kein extra Kontext)"}
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
    userText: `${input.stylePackage}

Weiteres Fundament (einhalten):
---
${bible || "(kein extra Kontext)"}
---

Ursprünglicher Entwurf:
---
${input.entwurf}
---

Feedback Verlagslektor:
---
${input.lektor}
---

Feedback Fan-Persona:
---
${input.fan}
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
    userText: `Finale Szene:\n\n${finalText}`,
  });
}

/**
 * Processes the next READY scene for a roman (one scene per call).
 * Uses one shared text LLM for author, reviews, revision, and summary.
 * Returns null when nothing is left to write.
 */
export async function processNextRomanSzene(
  romanId: string,
  modelId?: string | null,
): Promise<{ szene: Szene; summaryAppended: string } | null> {
  const claimed = await claimNextSzene(romanId);
  if (!claimed) return null;

  const model = await resolveRomanSchreibModel(modelId);

  try {
    const stylePackage = await loadStylePackage(claimed);

    const entwurf = (
      await writeAuthorDraft(claimed, stylePackage, model)
    ).trim();
    if (!entwurf) throw new Error("Autor lieferte leeren Entwurf.");

    await updateSzene({
      id: claimed.id,
      entwurfRaw: entwurf,
      status: "REVIEWING",
    });

    const [lektor, fan] = await Promise.all([
      writeLektorFeedback(entwurf, claimed, stylePackage, model),
      writeFanFeedback(entwurf, claimed, model),
    ]);

    await updateSzene({
      id: claimed.id,
      feedbackLektor: lektor.trim(),
      feedbackFan: fan.trim(),
      status: "REVISING",
    });

    const revised = (
      await writeRevision({
        entwurf,
        lektor: lektor.trim(),
        fan: fan.trim(),
        scene: claimed,
        stylePackage,
        model,
      })
    ).trim();
    if (!revised) throw new Error("Revision lieferte leeren Text.");

    const summary = (await writeSceneSummary(revised, model)).trim();
    const summaryAppended = await appendRomanZusammenfassung(
      romanId,
      `Kap. ${claimed.kapitelNr} / Szene ${claimed.szenenNr}: ${summary}`,
    );

    const szene = await updateSzene({
      id: claimed.id,
      entwurfRevidiert: revised,
      status: "COMPLETED",
    });

    return { szene, summaryAppended };
  } catch (error) {
    // Leave scene in a recoverable non-READY state; admin can reset.
    await updateSzene({
      id: claimed.id,
      status: "DRAFTING",
    }).catch(() => undefined);
    throw error;
  }
}
