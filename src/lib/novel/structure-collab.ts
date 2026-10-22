/**
 * Agentic structure collab: Auditor asks, Architect answers, Auditor re-scores.
 * Used between pyramid levels (acts / chapters / manifests). Idea stays fixed —
 * fixes go into structure + pyramid state via later architect rewrite.
 */

import { parseModelJsonObjectWithRepair } from "@/lib/ai/repair-model-json";
import { generateAsEditorJson, NOVEL_EDITOR_MODEL_SLUG } from "@/lib/novel/roles";
import {
  coerceArchitectChaptersList,
  coerceArchitectSceneManifests,
  type ArchitectSceneManifestsResult,
  type SkeletonChapter,
} from "@/lib/novel/tree-schemas";
import { resolveRomanSchreibModel } from "@/lib/roman/model";
import { z } from "zod";

const strList = (max: number) =>
  z.preprocess((raw) => {
    const list = Array.isArray(raw)
      ? raw
      : typeof raw === "string" && raw.trim()
        ? [raw]
        : [];
    return list
      .map((x) => String(x ?? "").trim())
      .filter(Boolean)
      .slice(0, max);
  }, z.array(z.string()).max(max).default([]));

const consultSchema = z.object({
  answers: z
    .array(
      z.object({
        question: z.string().min(1),
        answer: z.string().min(8),
      }),
    )
    .min(1)
    .max(8),
  /** Concrete state / act / chapter fixes the rewrite must apply. */
  fixOrders: strList(8),
});

export type StructureConsultResult = {
  transcript: string;
  fixOrders: string[];
};

/** Critiques about a "truncated idea" are almost always false positives. */
export function isBogusIdeaTruncationCritique(text: string): boolean {
  return /abgeschnitten|truncat|idee\s*(ist\s*)?(unvollständig|zu\s*kurz|fragment|abgebrochen)|ende\s*der\s*idee|idee\s*wirkt\s*abgeschnitten|idee\s*endet\s* abrupt|idea\s*(is\s*)?cut\s*off/i.test(
    text,
  );
}

/**
 * Auditor often invents scene-count / missing-ID math from the compact
 * manifest Kurzliste. When the machine inventory is complete, drop those.
 */
export function isBogusManifestInventoryCritique(text: string): boolean {
  return (
    /szenenregister|rechnerisch\s*widersprüchlich|gesamtsumme|nicht\s+\d+\s+szenen|ergibt\s+das\s+\d+|registerangabe|kurzliste\s+enthält|ids?\s+ersetzen\s+keine|vollständiges\s+szenenregister\s+mit\s+\d+|maschinell\s+und\s+gleiche|szenenzahlen\s+pro\s+kapitel/i.test(
      text,
    ) ||
    /manifest(?:e|liste)?\s+(?:enthält|enthält\s+nur|bricht|abgebrochen|unvollständig|nur\s+kapitel)/i.test(
      text,
    ) ||
    /(?:fehlende|fehlen(?:de)?|nicht\s+vorgelegt|nicht\s+vollständig\s+prüfbar).{0,40}(?:manifest|szene|kapitel\s*\d+)/i.test(
      text,
    ) ||
    // Tone needs prose — not a valid fail reason at manifest planning level.
    /ton(?:prüfung|bewertung)|prosa\s+(?:der|bereitstellen)|ausgearbeitete\s+prosa/i.test(
      text,
    ) ||
    text === "[object Object]" ||
    /^\[object Object\]$/i.test(text)
  );
}

/** Chapter numbers mentioned in audit/collab notes (e.g. 12.2 → 12). */
export function extractChapterNumbersFromStructureNotes(
  notes: string[],
): number[] {
  const found = new Set<number>();
  for (const n of notes) {
    for (const m of n.matchAll(/\b(?:Kap(?:itel)?\.?\s*)?(\d{1,2})(?:\.(\d{1,2}))?\b/gi)) {
      const ch = Number(m[1]);
      if (Number.isFinite(ch) && ch >= 1 && ch <= 40) found.add(ch);
    }
  }
  return [...found].sort((a, b) => a - b);
}

export type ManifestInventorySnapshot = {
  total: number;
  thin: number;
  /** "ch.idx" → present */
  ids: Set<string>;
  byChapter: Record<number, number>;
  /** Every skeleton chapter has expected scene count. */
  complete: boolean;
};

export function filterBogusStructureNotes(notes: string[]): string[] {
  return notes.filter((n) => !isBogusIdeaTruncationCritique(n));
}

/** Drop inventory/counting hallucinations when DB inventory is complete. */
export function filterBogusManifestInventoryNotes(
  notes: string[],
  inventory: ManifestInventorySnapshot | null | undefined,
): string[] {
  if (!inventory?.complete) {
    return notes.filter((n) => !isBogusIdeaTruncationCritique(n));
  }
  return notes.filter((n) => {
    if (isBogusIdeaTruncationCritique(n)) return false;
    if (isBogusManifestInventoryCritique(n)) return false;
    // "16.3 fehlt" while 16.3 exists in DB
    const idHits = [...n.matchAll(/\b(\d{1,2})\.(\d{1,2})\b/g)];
    if (
      idHits.length > 0 &&
      /fehlt|fehlend|nicht vorgelegt|nicht prüfbar|ergänzen/i.test(n)
    ) {
      const allPresent = idHits.every((m) =>
        inventory.ids.has(`${m[1]}.${m[2]}`),
      );
      if (allPresent) return false;
    }
    return true;
  });
}

/**
 * Format idea for auditor prompts. Never claim truncation unless we actually
 * truncate for token budget — and then forbid that as a scoring reason.
 */
export function formatIdeaForStructureAudit(idea: string): string {
  const full = idea.trim();
  const max = 12_000;
  if (full.length <= max) {
    return `VOLLSTÄNDIGE High-Concept-Idee (nicht abgeschnitten — Ende markiert):
${full}
--- ENDE IDEE ---`;
  }
  return `High-Concept-Idee (technischer Auszug der ersten ${max} Zeichen; der Rest existiert in der DB).
WICHTIG: Darf NICHT als „Idee abgeschnitten/unvollständig“ kritisiert oder abgewertet werden.
${full.slice(0, max)}
--- ENDE AUSZUG (Rest existiert) ---`;
}

const AUDIT_IDEA_BAN = `VERBOTENE Kritik (sofort ignorieren, score davon nicht senken):
- „Idee abgeschnitten / unvollständig / Fragment / Ende fehlt“
- Aufforderung, die High-Concept-Idee umzuschreiben oder zu ersetzen
Die Idee ist vorgegeben und vollständig genug für die Prüfung. Offene Stofflücken → Fragen an den Architekten zu State/Akte/Kapitel, nicht zur Idee.`;

export function structureAuditIdeaBanBlock(): string {
  return AUDIT_IDEA_BAN;
}

/**
 * Architect answers auditor questions with concrete structural solutions
 * (state facts, act phase bags, chapter load) — not prose, not idea rewrites.
 */
export async function consultArchitectOnStructureGaps(input: {
  level: "acts" | "chapters" | "manifests";
  idea: string;
  artifactJson: string;
  pyramidStateBlock: string;
  issues: string[];
  changeOrders: string[];
  questions: string[];
}): Promise<StructureConsultResult> {
  const questions =
    input.questions.length > 0
      ? input.questions
      : input.changeOrders.length > 0
        ? input.changeOrders.map((c) => `Wie setzt du um: ${c}?`)
        : input.issues.map((i) => `Wie behebst du: ${i}?`);

  if (!questions.length) {
    return { transcript: "", fixOrders: [] };
  }

  const levelLabel =
    input.level === "acts"
      ? "Akte"
      : input.level === "chapters"
        ? "Kapitel"
        : "Szenen-Manifeste";
  const solutionHint =
    input.level === "manifests"
      ? "Konkrete Manifest-Fixes: situations (≥3), mustShow, Ort, Figuren, Beat, Wissen allowed/forbidden — keine Prosa."
      : "State-Fakten, Phasen für 5–7 Kapitel/Akt, kausale Wendungen, Schauplätze, Figuren-Einsätze.";
  const raw = await generateAsEditorJson({
    role: "architect",
    userText: `Du arbeitest mit dem Struktur-Auditor zusammen (Agentic).
Ebene: ${levelLabel}. Die High-Concept-Idee ist FIX — nicht umschreiben.
Beantworte jede Frage mit einer konkreten strukturellen Lösung (${solutionHint}).
Keine Prosa. Keine Meta-Diskussion über „abgeschnittene Idee“.

Antwort NUR JSON:
{"answers":[{"question":"…","answer":"…"}],"fixOrders":["konkreter Auftrag für die nächste Skelett-Überarbeitung",…]}

Fragen des Auditors:
${questions.map((q, i) => `${i + 1}. ${q}`).join("\n")}

Bisherige Issues:
${input.issues.map((x) => `- ${x}`).join("\n") || "- —"}

ChangeOrders:
${input.changeOrders.map((x) => `- ${x}`).join("\n") || "- —"}

${input.pyramidStateBlock ? `${input.pyramidStateBlock}\n` : ""}
Idee (FIX):
${input.idea.slice(0, 8_000)}

Aktuelles Artefakt (${levelLabel}):
${input.artifactJson.slice(0, 10_000)}`,
  });

  const model = await resolveRomanSchreibModel(NOVEL_EDITOR_MODEL_SLUG);
  const obj = await parseModelJsonObjectWithRepair({
    raw,
    model,
    schemaHint:
      '{"answers":[{"question":"","answer":""}],"fixOrders":[]}',
    errorLabel: "Struktur-Collab-Architekt",
  });
  const parsed = consultSchema.safeParse(obj);
  if (!parsed.success) {
    const fallback = questions
      .slice(0, 4)
      .map(
        (q) =>
          `Q: ${q}\nA: State und ${levelLabel}-Summaries um Phasen/Schauplätze/Konfliktschrauben erweitern (Idee unverändert).`,
      )
      .join("\n\n");
    return {
      transcript: fallback,
      fixOrders: filterBogusStructureNotes(input.changeOrders).slice(0, 6),
    };
  }

  const answers = parsed.data.answers.filter(
    (a) => !isBogusIdeaTruncationCritique(a.answer),
  );
  const fixOrders = filterBogusStructureNotes(parsed.data.fixOrders);
  const transcript = answers
    .map((a) => `### Frage\n${a.question}\n### Antwort Architekt\n${a.answer}`)
    .join("\n\n");

  return { transcript, fixOrders };
}

/**
 * After auditor↔architect Q&A: architect returns patched chapters (full list
 * or replacements). Merges into the existing outline so re-audit can pass 10/10.
 */
export async function repairChaptersFromCollab(input: {
  idea: string;
  premise: string;
  actsJson: string;
  chapters: SkeletonChapter[];
  transcript: string;
  fixOrders: string[];
  issues: string[];
}): Promise<SkeletonChapter[]> {
  if (!input.chapters.length) return input.chapters;

  const raw = await generateAsEditorJson({
    role: "architect",
    userText: `Agentic Repair: Du setzt die Auditor-Collab um und lieferst eine VOLLSTÄNDIGE chapters-Liste.
Ziel: Struktur-Audit 10/10 realistisch schaffen — nicht literarische Perfektion.

Pflicht-Checkliste (alle erfüllen):
1) Pro Akt 5–7 Kapitel (Gesamt typisch 15–21); actNumber korrekt 1/2/3
2) Jedes Kapitel: goal ≥8 Zeichen, ≥2 konkrete Plot-beats, job aus der Taxonomie, gemischte Jobs (nicht alles escalate)
3) Kapitelziele bilden eine kausale Kette Akt1→2→3; jedes Kapitel bringt Neuheit
4) must/mustNot kurz und widerspruchsfrei (dürfen knapp sein)
5) High-Concept-Idee FIX — nur Kapitel/State-Stoff

Antwort NUR JSON:
{"chapters":[{"chapterNumber":1,"title":"…","actNumber":1,"job":"setup","goal":"…","beats":["…","…"],"must":["…"],"mustNot":["…"],"endingFunction":"…","mood":"…"}]}

Collab / FixOrders:
${input.transcript.slice(0, 6_000)}
${input.fixOrders.map((f) => `→ ${f}`).join("\n") || ""}

Issues:
${input.issues.map((i) => `- ${i}`).join("\n") || "- —"}

Prämisse: ${input.premise.slice(0, 1_500)}
Akte: ${input.actsJson.slice(0, 3_000)}
Bisherige Kapitel:
${JSON.stringify(input.chapters).slice(0, 12_000)}
Idee (FIX):
${input.idea.slice(0, 6_000)}`,
  });

  try {
    const model = await resolveRomanSchreibModel(NOVEL_EDITOR_MODEL_SLUG);
    const obj = await parseModelJsonObjectWithRepair({
      raw,
      model,
      schemaHint: '{"chapters":[]}',
      errorLabel: "Kapitel-Collab-Repair",
    });
    const repaired = coerceArchitectChaptersList(obj);
    if (repaired.length >= 12) {
      return repaired.map((c, i) => ({ ...c, chapterNumber: i + 1 }));
    }
    // Too thin — keep previous, try merge by chapterNumber
    if (repaired.length > 0) {
      const byNum = new Map(input.chapters.map((c) => [c.chapterNumber, c]));
      for (const c of repaired) byNum.set(c.chapterNumber, c);
      return [...byNum.values()]
        .sort((a, b) => a.chapterNumber - b.chapterNumber)
        .map((c, i) => ({ ...c, chapterNumber: i + 1 }));
    }
  } catch (err) {
    console.warn(
      "[novel/repairChaptersFromCollab]",
      err instanceof Error ? err.message : err,
    );
  }
  return input.chapters;
}

/**
 * Patch scene manifests for chapters named in collab/fixOrders.
 * Without this, auditor↔architect Q&A never lands in the DB → score stuck.
 */
export async function repairManifestsFromCollab(input: {
  idea: string;
  chapterNumbers: number[];
  /** Existing scenes JSON for those chapters (compact). */
  scenesJson: string;
  chapterJobsJson: string;
  transcript: string;
  fixOrders: string[];
  issues: string[];
}): Promise<ArchitectSceneManifestsResult["scenes"]> {
  const chapters = [...new Set(input.chapterNumbers)].filter((n) => n >= 1);
  if (!chapters.length) return [];

  const raw = await generateAsEditorJson({
    role: "architect",
    maxTokens: 8_192,
    userText: `Agentic Repair: Setze die Auditor-Collab in KONKRETE Szenen-Manifeste um.
Nur Kapitel ${chapters.join(", ")} — liefere alle Szenen dieser Kapitel vollständig neu (dichte Manifeste).
Keine Prosa. Keine Ton-Bewertung aus fehlender Prosa verlangen.

Pflicht pro Szene:
- sceneGoal, conflict, turningBeat, beat, location, timeAnchor
- characters: nur Figuren, die in situations tatsächlich handeln/anwesend sind
- situations: ≥3 geordnete Einzelhandlungen
- mustShow ≥2 konkret; knowledgeAllowed / knowledgeForbidden explizit
- Beat-Kette und Kapitel-Job aus chapterJobsJson einhalten

Antwort NUR JSON:
{"scenes":[{"chapterNumber":${chapters[0]},"sceneIndex":1,"planSummary":"…","beat":"advance","manifest":{…}}]}

Collab:
${input.transcript.slice(0, 8_000)}

FixOrders:
${input.fixOrders.map((f) => `→ ${f}`).join("\n") || "- —"}

Issues:
${input.issues.map((i) => `- ${i}`).join("\n") || "- —"}

Kapitel-Jobs:
${input.chapterJobsJson.slice(0, 4_000)}

Bisherige Manifeste (zu ersetzen):
${input.scenesJson.slice(0, 10_000)}

Idee (FIX):
${input.idea.slice(0, 4_000)}`,
  });

  try {
    const model = await resolveRomanSchreibModel(NOVEL_EDITOR_MODEL_SLUG);
    const obj = await parseModelJsonObjectWithRepair({
      raw,
      model,
      schemaHint: '{"scenes":[]}',
      errorLabel: "Manifest-Collab-Repair",
    });
    const coerced = coerceArchitectSceneManifests(obj);
    return coerced.scenes.filter((s) => chapters.includes(s.chapterNumber));
  } catch (err) {
    console.warn(
      "[novel/repairManifestsFromCollab]",
      err instanceof Error ? err.message : err,
    );
    return [];
  }
}

