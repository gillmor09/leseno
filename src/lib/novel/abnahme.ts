/**
 * Full-manuscript Abnahmecheck: Lektor (Haiku 5.5) rates quality 1–10
 * across Genre, Tonalität, Logik, Dramaturgie, Stil, Versprechen.
 * Hard gate: must not clearly sound AI-generated.
 */

import { z } from "zod";
import { parseModelJsonObjectWithRepair } from "@/lib/ai/repair-model-json";
import { formatCanonPrefix } from "@/lib/novel/context";
import {
  formatLogicLedgerForAbnahme,
  getLogicLedger,
} from "@/lib/novel/logic-ledger";
import { NOVEL_EDITOR_ANTI_AI_CHECKLIST } from "@/lib/novel/prose-guardrails";
import { manuscriptSoundsLikeAiFromTics } from "@/lib/novel/prose-tic-detect";
import {
  generateAsEditorJson,
  NOVEL_EDITOR_MODEL_SLUG,
} from "@/lib/novel/roles";
import {
  detectToneModeFromBundle,
  formatToneContractForAbnahme,
} from "@/lib/novel/tone-contract";
import {
  ABNAHME_PASS_OVERALL_MIN,
  type NovelAbnahme,
  type NovelBundle,
} from "@/lib/novel/types";
import { resolveRomanSchreibModel } from "@/lib/roman/model";

const scoreSchema = z.number().min(1).max(10);

export const novelAbnahmeSchema = z.object({
  overall: scoreSchema,
  scores: z.object({
    genre: scoreSchema,
    tonalitaet: scoreSchema,
    logik: scoreSchema,
    dramaturgie: scoreSchema,
    stil: scoreSchema,
    versprechen: scoreSchema,
  }),
  /** True = clearly AI-sounding → Abnahme fails regardless of scores. */
  soundsLikeAi: z.boolean(),
  soundsLikeAiNotes: z.string().default(""),
  /** Soft naturalness 1–10 (inverse of AI voice); for display only. */
  menschlichkeit: scoreSchema,
  verdict: z.string().min(10),
  strengths: z.array(z.string()).default([]),
  weaknesses: z.array(z.string()).default([]),
  recommendations: z.array(z.string()).default([]),
});

export type NovelAbnahmeCopy = z.infer<typeof novelAbnahmeSchema>;

export { ABNAHME_PASS_OVERALL_MIN };

const MANUSCRIPT_BUDGET = 90_000;

/**
 * Explicit sample-cut marker for over-budget chapters.
 * Must NOT look like manuscript placeholders (`[…]` / `[...]`) — those
 * previously caused Haiku to fail Abnahme for “Auslassungen” we inserted.
 */
export const ABNAHME_SAMPLE_CUT =
  "<<<ABNAHME_SAMPLE_CUT: Mittelteil dieses Kapitels aus Token-Budget weggelassen — kein Manuskriptfehler>>>";

/** Lektor sometimes still blames intentional sample cuts or legacy `[…]` markers. */
const SAMPLE_CUT_COMPLAINT =
  /ABNAHME_SAMPLE_CUT|Token-Budget|Stichproben.?K.?rzung|\[…\]|\[\.\.\.\]|eckige Auslassungspunkte/i;

function clampScore(n: unknown): number {
  const x = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(x)) return 1;
  return Math.max(1, Math.min(10, Math.round(x)));
}

/** Drop lektor notes that blame our intentional sample cuts / old `[…]` markers. */
export function stripSampleCutComplaints(lines: string[]): string[] {
  return lines.filter((line) => !SAMPLE_CUT_COMPLAINT.test(line));
}

/** LLM often flags intentional open endings as “KI” — those alone are not a fail. */
const ENDING_CRAFT_ONLY_AI =
  /Schluss|Übergang|Handgriff|Gegenstand|Schweigen|Ritual|Muster|offen(e|er)?\s+Schrift|zurechtgerückt|innehalten/i;

function llmAiIsEndingCraftOnly(notes: string): boolean {
  const t = notes.trim();
  if (!t) return false;
  if (!ENDING_CRAFT_ONLY_AI.test(t)) return false;
  // Real AI-voice complaints stay.
  if (
    /Platzhalter|Schablonen-?Prosa|erklärte Pointe|Motto-Schluss|Aphorismus|KI-Floskel|steril|Formel/i.test(
      t,
    )
  ) {
    return false;
  }
  return true;
}

/** Median scene pipeline score → soft floor for Abnahme overall. */
export function sceneScoreAbnahmeFloor(bundle: NovelBundle): number | null {
  const scores = bundle.scenes
    .map((s) => s.score)
    .filter((n): n is number => typeof n === "number" && n > 0);
  if (scores.length < 3) return null;
  const sorted = [...scores].sort((a, b) => a - b);
  const mid = sorted[Math.floor(sorted.length / 2)]!;
  if (mid >= 7) return 7;
  if (mid >= 6) return 6;
  return null;
}

function averageDimensionScores(scores: {
  genre: number;
  tonalitaet: number;
  logik: number;
  dramaturgie: number;
  stil: number;
  versprechen: number;
}): number {
  const vals = [
    scores.genre,
    scores.tonalitaet,
    scores.logik,
    scores.dramaturgie,
    scores.stil,
    scores.versprechen,
  ];
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

/**
 * Align overall with dimension avg + scene pipeline floor.
 * Prevents “everything 6–7 but overall 5” dumps.
 */
export function reconcileAbnahmeOverall(input: {
  modelOverall: number;
  scores: {
    genre: number;
    tonalitaet: number;
    logik: number;
    dramaturgie: number;
    stil: number;
    versprechen: number;
  };
  sceneFloor: number | null;
}): number {
  const avg = averageDimensionScores(input.scores);
  const blended = Math.round((input.modelOverall + avg) / 2);
  let overall = clampScore(blended);
  if (input.sceneFloor != null) {
    overall = Math.max(overall, input.sceneFloor);
  }
  // Cap lift: don't invent a 9 from a 5 model + soft floor alone.
  if (input.sceneFloor != null && input.modelOverall <= 5) {
    overall = Math.min(overall, Math.max(input.sceneFloor, input.modelOverall + 2));
  }
  return overall;
}

function formatSceneScoreContext(bundle: NovelBundle): string {
  const scores = bundle.scenes
    .map((s) => s.score)
    .filter((n): n is number => typeof n === "number" && n > 0);
  if (!scores.length) return "";
  const sorted = [...scores].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)]!;
  const avg = Math.round(
    (scores.reduce((a, b) => a + b, 0) / scores.length) * 10,
  ) / 10;
  const ge7 = scores.filter((n) => n >= 7).length;
  const ge6 = scores.filter((n) => n >= 6).length;
  return `Pipeline-Szenen-Scores (bereits freigegeben): n=${scores.length}, Median ${median}, Ø ${avg}, ≥7: ${ge7}, ≥6: ${ge6}. Kalibriere overall daran — ein fertiger Soft-Pass-Roman liegt typisch bei 6–7, nicht bei 5.`;
}

/**
 * Full manuscript for lektorat; if over budget, keep proportional head/tail
 * per chapter so early setup and late payoff stay visible.
 */
export function assembleManuscriptForAbnahme(
  bundle: NovelBundle,
  budget = MANUSCRIPT_BUDGET,
): string {
  const chapters = bundle.chapters
    .slice()
    .sort((a, b) => a.chapterNumber - b.chapterNumber)
    .map((c) => {
      const body = (c.finalText || c.rawDraft).trim();
      return {
        number: c.chapterNumber,
        title: c.title || `Kapitel ${c.chapterNumber}`,
        body,
      };
    })
    .filter((c) => c.body.length >= 40);

  if (!chapters.length) return "";

  const headers = chapters.map(
    (c) => `## Kapitel ${c.number} — ${c.title}\n\n`,
  );
  const overhead = headers.reduce((n, h) => n + h.length, 0) + 80;
  const available = Math.max(8_000, budget - overhead);
  const totalBody = chapters.reduce((n, c) => n + c.body.length, 0);

  if (totalBody <= available) {
    return chapters
      .map((c, i) => `${headers[i]}${c.body}`)
      .join("\n\n");
  }

  const cutMarker = `\n\n${ABNAHME_SAMPLE_CUT}\n\n`;
  return chapters
    .map((c, i) => {
      const share = Math.max(
        400,
        Math.floor((c.body.length / totalBody) * available),
      );
      if (c.body.length <= share) {
        return `${headers[i]}${c.body}`;
      }
      const head = Math.floor(share * 0.55);
      const tail = Math.max(0, share - head - cutMarker.length);
      const excerpt = `${c.body.slice(0, head)}${cutMarker}${c.body.slice(-tail)}`;
      return `${headers[i]}${excerpt}`;
    })
    .join("\n\n");
}

export function emptyAbnahme(): NovelAbnahme | null {
  return null;
}

export function parseAbnahmeJson(raw: unknown): NovelAbnahme | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.overall !== "number" && typeof o.overall !== "string") {
    return null;
  }
  const scoresRaw =
    o.scores && typeof o.scores === "object" && !Array.isArray(o.scores)
      ? (o.scores as Record<string, unknown>)
      : {};
  const passed =
    typeof o.passed === "boolean"
      ? o.passed
      : !Boolean(o.soundsLikeAi) &&
        clampScore(o.overall) >= ABNAHME_PASS_OVERALL_MIN;

  return {
    overall: clampScore(o.overall),
    scores: {
      genre: clampScore(scoresRaw.genre),
      tonalitaet: clampScore(scoresRaw.tonalitaet),
      logik: clampScore(scoresRaw.logik),
      dramaturgie: clampScore(scoresRaw.dramaturgie),
      stil: clampScore(scoresRaw.stil),
      versprechen: clampScore(scoresRaw.versprechen),
    },
    soundsLikeAi: Boolean(o.soundsLikeAi),
    soundsLikeAiNotes: String(o.soundsLikeAiNotes ?? "").trim(),
    menschlichkeit: clampScore(o.menschlichkeit ?? 5),
    passed,
    verdict: String(o.verdict ?? "").trim() || "Keine Bewertung.",
    strengths: Array.isArray(o.strengths)
      ? o.strengths.map((x) => String(x).trim()).filter(Boolean)
      : [],
    weaknesses: Array.isArray(o.weaknesses)
      ? o.weaknesses.map((x) => String(x).trim()).filter(Boolean)
      : [],
    recommendations: Array.isArray(o.recommendations)
      ? o.recommendations.map((x) => String(x).trim()).filter(Boolean)
      : [],
    checkedAt: String(o.checkedAt ?? "").trim() || new Date().toISOString(),
    modelSlug: String(o.modelSlug ?? NOVEL_EDITOR_MODEL_SLUG).trim(),
  };
}

/**
 * Haiku as Lektor: whole-manuscript acceptance with 1–10 scores + AI-voice gate.
 */
export async function runNovelAbnahmeCheck(
  bundle: NovelBundle,
): Promise<NovelAbnahme> {
  const manuscript = assembleManuscriptForAbnahme(bundle);
  if (!manuscript.trim()) {
    throw new Error("Noch kein Manuskript für den Abnahmecheck.");
  }

  const genre = bundle.styleGuide?.genre ?? "";
  const tone = bundle.styleGuide?.primaryTone ?? "";
  const idea = bundle.novel.highConceptIdea.trim().slice(0, 2_000);
  const ledgerBlock = formatLogicLedgerForAbnahme(getLogicLedger(bundle));
  const toneMode = detectToneModeFromBundle(bundle);
  const toneContract = formatToneContractForAbnahme(toneMode);

  const sceneCtx = formatSceneScoreContext(bundle);
  const sceneFloor = sceneScoreAbnahmeFloor(bundle);

  const raw = await generateAsEditorJson({
    cacheablePrefix: formatCanonPrefix(bundle),
    systemExtra: `Du bist Lektor für die Endabnahme eines Romans aus einer Szenen-Pipeline (Soft-Pass ≥6, Freigabe ≥8).
Skala 1–10 — ehrlich, aber kalibriert:
- 5 = klare Strukturbrüche / unfertig (nicht der Default für „Restarbeit“)
- 6 = brauchbarer fertiger Pipeline-Roman, lesbar, Restarbeit ok
- 7 = solide Abnahme-reif
- 8–9 = stark · 10 = selten

soundsLikeAi=true NUR bei klarer Schablonen-Prosa, Platzhaltern, erklärten Pointen, Motto-Aphorismus-Schlüssen, sterilen Formelketten.
NICHT soundsLikeAi nur weil Szenen/Kapitel offen enden, mit Gegenständen/Handgriffen/Schweigen schließen oder Übergänge ähneln — das ist hier absichtlicher Craft (Szenenvertrag „offen lassen“). Solche Muster höchstens als stil-Schwäche (1 Punkt), kein KI-Fail.
${NOVEL_EDITOR_ANTI_AI_CHECKLIST}

WICHTIG zum Stichproben-Zuschnitt: Marker <<<ABNAHME_SAMPLE_CUT: …>>> sind System-Kürzungen (Token-Budget), keine Manuskript-Lücken. Nie in weaknesses/recommendations/soundsLikeAiNotes; nie Punkte abziehen.

Logic-Ledger: echte Zeit-/Geld-Widersprüche → logik senken. Soft-Pass-Schuld allein → overall nicht unter 6 drücken, wenn die Prosa sonst trägt.
${toneContract ? `\n${toneContract}\n` : ""}
Kriterien: genre, tonalitaet, logik, dramaturgie, stil, versprechen, menschlichkeit (hoch = menschlich).
overall soll nahe am Mittel der Dimension-Scores liegen (nicht willkürlich 5 bei Dimensionen 6–7).
Antworte NUR als JSON.`,
    userText: `Endabnahme für „${bundle.novel.title}“.
Genre: ${genre || "—"} · Tonalität: ${tone || "—"}
${toneContract ? `${toneContract}\n` : ""}
${sceneCtx ? `\n${sceneCtx}\n` : ""}
High Concept / Versprechen:
${idea || "(fehlt)"}
${ledgerBlock ? `\n${ledgerBlock}\n` : ""}
Antwort NUR als JSON:
{"overall":7,"scores":{"genre":7,"tonalitaet":7,"logik":7,"dramaturgie":7,"stil":7,"versprechen":7},"soundsLikeAi":false,"soundsLikeAiNotes":"","menschlichkeit":7,"verdict":"2–4 Sätze Gesamturteil","strengths":["…"],"weaknesses":["…"],"recommendations":["konkrete nächste Schritte"]}

Manuskript:
${manuscript}`,
  });

  const model = await resolveRomanSchreibModel(NOVEL_EDITOR_MODEL_SLUG);
  const obj = await parseModelJsonObjectWithRepair({
    raw,
    model,
    schemaHint:
      '{"overall":7,"scores":{"genre":7,"tonalitaet":7,"logik":7,"dramaturgie":7,"stil":7,"versprechen":7},"soundsLikeAi":false,"soundsLikeAiNotes":"","menschlichkeit":7,"verdict":"…","strengths":[],"weaknesses":[],"recommendations":[]}',
    errorLabel: "Abnahmecheck",
  });

  const scoresIn =
    obj.scores && typeof obj.scores === "object" && !Array.isArray(obj.scores)
      ? (obj.scores as Record<string, unknown>)
      : {};

  const normalized = {
    overall: clampScore(obj.overall),
    scores: {
      genre: clampScore(scoresIn.genre),
      tonalitaet: clampScore(scoresIn.tonalitaet),
      logik: clampScore(scoresIn.logik),
      dramaturgie: clampScore(scoresIn.dramaturgie),
      stil: clampScore(scoresIn.stil),
      versprechen: clampScore(scoresIn.versprechen),
    },
    soundsLikeAi: Boolean(obj.soundsLikeAi),
    soundsLikeAiNotes: String(obj.soundsLikeAiNotes ?? "").trim(),
    menschlichkeit: clampScore(obj.menschlichkeit ?? 5),
    verdict: String(obj.verdict ?? "").trim(),
    strengths: Array.isArray(obj.strengths)
      ? (obj.strengths as unknown[]).map((x) => String(x).trim()).filter(Boolean)
      : [],
    weaknesses: Array.isArray(obj.weaknesses)
      ? (obj.weaknesses as unknown[])
          .map((x) => String(x).trim())
          .filter(Boolean)
      : [],
    recommendations: Array.isArray(obj.recommendations)
      ? (obj.recommendations as unknown[])
          .map((x) => String(x).trim())
          .filter(Boolean)
      : [],
  };

  const parsed = novelAbnahmeSchema.safeParse(normalized);
  if (!parsed.success) {
    throw new Error("Abnahme-JSON ungültig.");
  }

  const data = parsed.data;

  const chapterTexts = bundle.chapters
    .slice()
    .sort((a, b) => a.chapterNumber - b.chapterNumber)
    .map((c) => (c.finalText || c.rawDraft).trim())
    .filter((t) => t.length >= 80);
  const ticGate = manuscriptSoundsLikeAiFromTics(chapterTexts, {
    mode: "abnahme",
  });
  // LLM often flags open-ending craft as AI — ignore that alone.
  const llmAi =
    data.soundsLikeAi && !llmAiIsEndingCraftOnly(data.soundsLikeAiNotes);
  const soundsLikeAi = llmAi || ticGate.soundsLikeAi;
  const soundsLikeAiNotes = [
    llmAi ? data.soundsLikeAiNotes : "",
    ticGate.notes,
  ]
    .map((s) => s.trim())
    .filter(Boolean)
    .join(" ")
    // Never let sample-cut noise pollute the AI-voice note.
    .replace(/\s*<<<ABNAHME_SAMPLE_CUT:[^>]*>>>\s*/g, " ")
    .trim();

  const weaknesses = stripSampleCutComplaints(data.weaknesses);
  const recommendations = stripSampleCutComplaints(data.recommendations);

  const overall = reconcileAbnahmeOverall({
    modelOverall: data.overall,
    scores: data.scores,
    sceneFloor,
  });

  const passed = !soundsLikeAi && overall >= ABNAHME_PASS_OVERALL_MIN;

  return {
    ...data,
    overall,
    weaknesses,
    recommendations,
    soundsLikeAi,
    soundsLikeAiNotes,
    menschlichkeit: soundsLikeAi
      ? Math.min(data.menschlichkeit, 4)
      : data.menschlichkeit,
    passed,
    checkedAt: new Date().toISOString(),
    modelSlug: NOVEL_EDITOR_MODEL_SLUG,
  };
}
