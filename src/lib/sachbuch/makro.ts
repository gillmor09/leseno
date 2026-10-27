/**
 * Phase 3 — Makro: flexible Buchteile + Kapitel (idea-fit), legacy 5-stage fallback.
 */

import { generateText } from "@/lib/ai/provider";
import {
  SACHBUCH_MODEL_ARCHITECT,
  defaultSachbuchAgents,
} from "@/lib/sachbuch/agent-defaults";
import { assertSachbuchGuideAllows } from "@/lib/sachbuch/guide";
import { emptySachbuchKapitel } from "@/lib/sachbuch/parse";
import { resolveSachbuchAgentModel } from "@/lib/sachbuch/resolve-agent";
import {
  getSachbuchKontext,
  patchSachbuchBook,
} from "@/lib/sachbuch/repository";
import type {
  SachbuchKontext,
  SachbuchMakroChapterPlan,
  SachbuchMakroPart,
  SachbuchMakroTyp,
} from "@/lib/sachbuch/types";
import {
  SACHBUCH_MAKRO_TYP_LABELS,
  emptyMakroStages,
  flattenMakroChapterPlans,
} from "@/lib/sachbuch/types";

const PARTS_JSON_EXAMPLE = `{
  "parts": [
    {
      "id": "teil_a",
      "title": "Teil A — …",
      "promise": "Was dieser Teil für den Leser leistet",
      "chapters": [
        {
          "id": "ch_01",
          "title": "Kapitel-Titel",
          "promise": "Leserversprechen dieses Kapitels",
          "notes": "Argumentkerne, Cases, Artefakte"
        }
      ]
    }
  ]
}`;

function makroPromptBrief(typ: SachbuchMakroTyp): string {
  const flexRules = `Strukturiere das Buch FLEXIBEL nach der Idee — nicht starr in genau 5 Kapitel.
Regeln:
- 2–5 Buchteile (parts), jeder Teil mit 1–4 Kapiteln.
- Gesamt typisch 6–12 Kapitel (weniger bei sehr schlankem Konzept, mehr nur wenn die Idee es trägt).
- Teil-Titel und Kapitel-Anzahl an UVP/Briefing anpassen (z. B. Qualitäts-Pyramide → 3 Teile; kompakte Mitte wenn Briefing „~50 %“ / Motor-Verdichtung verlangt).
- ids: kurze ascii-slugs (teil_a, ch_01). Keine Artikelnummern.
- Jedes Kapitel braucht title + promise; notes für Argumentkerne/Cases.
- Keine 10-Kapitel-Standardgliederung aus dem Lehrbuch — Idee und Leserversprechen entscheiden.`;

  if (typ === "erklaerung") {
    return `${flexRules}
Erzählhint (Erklärung): Verständnisbogen — Teile können Kontext/Kern/Vertiefung/Beispiele/Einordnung abbilden, müssen aber nicht 1:1 fünf Stages sein.`;
  }
  if (typ === "erzaehlung") {
    return `${flexRules}
Erzählhint (Erzählung): Dramaturgiebogen — Teile können Ausgang/Konflikt/Verlauf/Erkenntnis/Bedeutung tragen, Kapitelzahl folgt der Fallgeschichte.`;
  }
  return `${flexRules}
Erzählhint (Journey): Transformation — Teile können Status Quo → These → Methode → Umbau → Ausblick spiegeln; Kapitelzahl und Gewichtung folgen der Idee (z. B. Fundament / Motor / Kundenergebnis).`;
}

function slugId(raw: string, fallback: string): string {
  const s = raw
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 48);
  return s || fallback;
}

function normalizeParts(rawParts: unknown): SachbuchMakroPart[] {
  if (!Array.isArray(rawParts)) return [];
  const parts: SachbuchMakroPart[] = [];
  const usedPartIds = new Set<string>();
  const usedChapterKeys = new Set<string>();

  rawParts.forEach((raw, pi) => {
    if (!raw || typeof raw !== "object") return;
    const row = raw as Record<string, unknown>;
    const title = typeof row.title === "string" ? row.title.trim() : "";
    if (!title) return;
    let partId = slugId(
      typeof row.id === "string" ? row.id : `teil_${pi + 1}`,
      `teil_${pi + 1}`,
    );
    while (usedPartIds.has(partId)) partId = `${partId}_${pi + 1}`;
    usedPartIds.add(partId);

    const chaptersRaw = Array.isArray(row.chapters) ? row.chapters : [];
    const chapters: SachbuchMakroChapterPlan[] = [];
    chaptersRaw.forEach((cRaw, ci) => {
      if (!cRaw || typeof cRaw !== "object") return;
      const c = cRaw as Record<string, unknown>;
      const cTitle = typeof c.title === "string" ? c.title.trim() : "";
      if (!cTitle) return;
      let chId = slugId(
        typeof c.id === "string" ? c.id : `ch_${ci + 1}`,
        `ch_${String(ci + 1).padStart(2, "0")}`,
      );
      let link = `${partId}__${chId}`;
      let n = 2;
      while (usedChapterKeys.has(link)) {
        chId = `${chId}_${n}`;
        link = `${partId}__${chId}`;
        n += 1;
      }
      usedChapterKeys.add(link);
      chapters.push({
        id: chId,
        title: cTitle,
        promise: typeof c.promise === "string" ? c.promise.trim() : "",
        notes: typeof c.notes === "string" ? c.notes.trim() : "",
      });
    });
    if (chapters.length === 0) return;
    parts.push({
      id: partId,
      title,
      promise: typeof row.promise === "string" ? row.promise.trim() : "",
      chapters: chapters.slice(0, 12),
    });
  });

  return parts.slice(0, 8);
}

/**
 * Generate / refresh makro as flexible parts+chapters via Architect.
 */
export async function generateSachbuchMakro(
  sachbuchId: string,
): Promise<SachbuchKontext> {
  const book = await getSachbuchKontext(sachbuchId);
  if (!book) throw new Error("Sachbuch nicht gefunden.");
  assertSachbuchGuideAllows(book, "makro");
  if (!book.idee.unpopularOpinion.trim() && !book.idee.briefing.trim()) {
    throw new Error("Zuerst Idee freigeben (Verfeinerung).");
  }

  const typ = book.makro.typ ?? "journey";
  // Prefer current default Architect prompt so stored „5-Stage“-Agents nicht gegen flexibles Makro arbeiten.
  const slot = {
    ...book.agents.architect,
    modelSlug: SACHBUCH_MODEL_ARCHITECT,
    systemPrompt: defaultSachbuchAgents().architect.systemPrompt,
  };
  const model = await resolveSachbuchAgentModel(slot);
  const evidenzSummary = book.evidenz.claims
    .slice(0, 12)
    .map((c) => `- ${c.claim}: ${c.evidence}`)
    .join("\n");

  const briefingClip = book.idee.briefing.trim().slice(0, 48_000);

  const raw = await generateText({
    model,
    systemInstruction: slot.systemPrompt,
    userText: `Buch: ${book.title}
Zielgruppe: ${book.zielgruppe.trim() || "—"}
Makro-Typ: ${typ} (${SACHBUCH_MAKRO_TYP_LABELS[typ]})
UVP: ${book.idee.unpopularOpinion}
Briefing:
${briefingClip || "—"}

Evidenz (Auszug):
${evidenzSummary || "—"}

${makroPromptBrief(typ)}

Antwort als JSON (nur parts — keine festen 5 Keys):
${PARTS_JSON_EXAMPLE}
Kein Markdown-Fence.`,
    preferJson: true,
    maxTokens: 8_000,
    timeoutMs: 300_000,
  });

  let parts: SachbuchMakroPart[] = [];
  try {
    const cleaned = raw.replace(/^```json?\s*|\s*```$/g, "").trim();
    const parsed = JSON.parse(cleaned) as { parts?: unknown };
    parts = normalizeParts(parsed.parts);
  } catch {
    throw new Error(
      "Makro-JSON konnte nicht gelesen werden. Bitte erneut versuchen.",
    );
  }

  if (parts.length === 0) {
    throw new Error(
      "Makro ohne Buchteile — bitte erneut erzeugen (Idee prüfen).",
    );
  }

  const chapterCount = parts.reduce((n, p) => n + p.chapters.length, 0);
  if (chapterCount < 3) {
    throw new Error(
      `Makro zu dünn (${chapterCount} Kapitel). Bitte erneut erzeugen.`,
    );
  }

  return patchSachbuchBook(sachbuchId, {
    makro: {
      typ,
      stages: emptyMakroStages(typ),
      parts,
      status: "ready",
      kapitelGenerated: book.makro.kapitelGenerated,
      bookTypeId: book.makro.bookTypeId ?? "",
    },
  });
}

/**
 * Create/replace kapitel list from makro parts (or legacy stages).
 * Preserves existing kapitel that match a link key when possible.
 */
export async function applyMakroToKapitel(
  sachbuchId: string,
): Promise<SachbuchKontext> {
  const book = await getSachbuchKontext(sachbuchId);
  if (!book) throw new Error("Sachbuch nicht gefunden.");
  assertSachbuchGuideAllows(book, "makro");
  if (book.makro.status === "empty") {
    throw new Error("Zuerst Makro erzeugen.");
  }

  const plans = flattenMakroChapterPlans(book.makro);
  if (plans.length === 0) {
    throw new Error("Makro hat keine Kapitelpläne.");
  }

  const existingByKey = new Map(
    book.kapitel
      .filter((k) => k.makroStageKey)
      .map((k) => [k.makroStageKey!, k]),
  );

  const kapitel = plans.map((plan, index) => {
    const goals = [
      plan.partTitle ? `Buchteil: ${plan.partTitle}` : "",
      plan.promise,
      plan.notes,
    ]
      .filter(Boolean)
      .join("\n\n");
    const prev = existingByKey.get(plan.key);
    if (prev) {
      return {
        ...prev,
        title: plan.title || prev.title,
        goals: goals || prev.goals,
        makroStageKey: plan.key,
        updatedAt: new Date().toISOString(),
      };
    }
    return emptySachbuchKapitel({
      title: plan.title || `Kapitel ${index + 1}`,
      goals,
      makroStageKey: plan.key,
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
