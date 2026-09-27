/**
 * Phase 3 — Makro (Journey oder Erklärung) + Kapitel from stages.
 */

import { generateText } from "@/lib/ai/provider";
import { emptySachbuchKapitel } from "@/lib/sachbuch/parse";
import { resolveSachbuchAgentModel } from "@/lib/sachbuch/resolve-agent";
import {
  getSachbuchKontext,
  patchSachbuchBook,
} from "@/lib/sachbuch/repository";
import type {
  SachbuchKontext,
  SachbuchMakroStage,
  SachbuchMakroStageKey,
  SachbuchMakroTyp,
} from "@/lib/sachbuch/types";
import {
  SACHBUCH_MAKRO_STAGE_LABELS,
  SACHBUCH_MAKRO_TYP_LABELS,
  emptyMakroStages,
  makroStageKeysForTyp,
} from "@/lib/sachbuch/types";

function stagesJsonExample(typ: SachbuchMakroTyp): string {
  const keys = makroStageKeysForTyp(typ);
  const lines = keys
    .map(
      (key) =>
        `    { "key": "${key}", "title": "...", "promise": "...", "notes": "..." }`,
    )
    .join(",\n");
  return `{\n  "stages": [\n${lines}\n  ]\n}`;
}

function makroPromptBrief(typ: SachbuchMakroTyp): string {
  if (typ === "erklaerung") {
    return `Erzeuge ein Erklär-Makro (Thema verständlich machen — kein Transformations-/Umsetzungs-Buch).
Stages: Kontext → Kernidee → Vertiefung → Beispiele → Einordnung.
Kein Framework/Implementierung, keine 10-Kapitel-Standardgliederung.`;
  }
  if (typ === "erzaehlung") {
    return `Erzeuge ein Erzähl-/Fall-Makro (narratives Sachbuch — eine Geschichte/Fall trägt die Erkenntnis).
Stages: Ausgangssituation → Konflikt/Frage → Verlauf → Wendepunkt/Erkenntnis → Bedeutung für den Leser.
Kein Methoden-Framework, keine reine Definitionskette, keine 10-Kapitel-Standardgliederung.`;
  }
  return `Erzeuge die Reader-Transformation-Journey.
Stages: Status Quo → Paradigmenwechsel → Framework → Implementierung → Zukunft.
Keine 10-Kapitel-Standardgliederung.`;
}

/**
 * Generate / refresh makro stages via Architect for the book's makro.typ.
 */
export async function generateSachbuchMakro(
  sachbuchId: string,
): Promise<SachbuchKontext> {
  const book = await getSachbuchKontext(sachbuchId);
  if (!book) throw new Error("Sachbuch nicht gefunden.");
  if (!book.idee.unpopularOpinion.trim() && !book.idee.briefing.trim()) {
    throw new Error("Zuerst UVP schärfen (Phase 1).");
  }

  const typ = book.makro.typ ?? "journey";
  const keys = makroStageKeysForTyp(typ);
  const slot = book.agents.architect;
  const model = await resolveSachbuchAgentModel(slot);
  const evidenzSummary = book.evidenz.claims
    .slice(0, 12)
    .map((c) => `- ${c.claim}: ${c.evidence}`)
    .join("\n");

  const raw = await generateText({
    model,
    systemInstruction: slot.systemPrompt,
    userText: `Buch: ${book.title}
Zielgruppe: ${book.zielgruppe.trim() || "—"}
Makro-Typ: ${typ} (${SACHBUCH_MAKRO_TYP_LABELS[typ]})
UVP: ${book.idee.unpopularOpinion}
Briefing: ${book.idee.briefing}

Evidenz (Auszug):
${evidenzSummary || "—"}

${makroPromptBrief(typ)}

Antwort als JSON:
${stagesJsonExample(typ)}
Genau diese ${keys.length} Keys. Kein Markdown-Fence.`,
    preferJson: true,
    maxTokens: 6000,
    timeoutMs: 300_000,
  });

  let stages: SachbuchMakroStage[] = emptyMakroStages(typ);
  try {
    const cleaned = raw.replace(/^```json?\s*|\s*```$/g, "").trim();
    const parsed = JSON.parse(cleaned) as {
      stages?: Array<{
        key?: string;
        title?: string;
        promise?: string;
        notes?: string;
      }>;
    };
    const byKey = new Map<string, SachbuchMakroStage>();
    const keySet = new Set<string>(keys);
    for (const s of parsed.stages ?? []) {
      const key = s.key as SachbuchMakroStageKey;
      if (!keySet.has(key)) continue;
      byKey.set(key, {
        key,
        title: String(s.title ?? "").trim() || SACHBUCH_MAKRO_STAGE_LABELS[key],
        promise: String(s.promise ?? "").trim(),
        notes: String(s.notes ?? "").trim(),
      });
    }
    stages = keys.map(
      (key) =>
        byKey.get(key) ?? {
          key,
          title: SACHBUCH_MAKRO_STAGE_LABELS[key],
          promise: "",
          notes: "",
        },
    );
  } catch {
    throw new Error(
      "Makro-JSON konnte nicht gelesen werden. Bitte erneut versuchen.",
    );
  }

  return patchSachbuchBook(sachbuchId, {
    makro: {
      typ,
      stages,
      status: "ready",
      kapitelGenerated: book.makro.kapitelGenerated,
    },
  });
}

/**
 * Create/replace kapitel list from makro stages (1:1 default).
 * Preserves existing kapitel that match a stage key when possible.
 */
export async function applyMakroToKapitel(
  sachbuchId: string,
): Promise<SachbuchKontext> {
  const book = await getSachbuchKontext(sachbuchId);
  if (!book) throw new Error("Sachbuch nicht gefunden.");
  if (book.makro.status === "empty") {
    throw new Error("Zuerst Makro erzeugen.");
  }

  const existingByStage = new Map(
    book.kapitel
      .filter((k) => k.makroStageKey)
      .map((k) => [k.makroStageKey!, k]),
  );

  const kapitel = book.makro.stages.map((stage, index) => {
    const prev = existingByStage.get(stage.key);
    if (prev) {
      return {
        ...prev,
        title: stage.title || prev.title,
        goals: [stage.promise, stage.notes].filter(Boolean).join("\n\n"),
        updatedAt: new Date().toISOString(),
      };
    }
    return emptySachbuchKapitel({
      title: stage.title || `Kapitel ${index + 1}`,
      goals: [stage.promise, stage.notes].filter(Boolean).join("\n\n"),
      makroStageKey: stage.key,
    });
  });

  return patchSachbuchBook(sachbuchId, {
    kapitel,
    makro: {
      ...book.makro,
      kapitelGenerated: true,
    },
  });
}
