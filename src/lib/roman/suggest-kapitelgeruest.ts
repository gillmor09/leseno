/**
 * Pass-1 Kapitelgerüst: chapter skeleton + arcs + lifecycle (no scenes).
 * Role: Entwicklungslektor (analytical). Seeds/grows Wissensgraph;
 * markdown mirror → `kapitelGeruestRaw`.
 *
 * Flow: outline (all chapters) → one detail call per chapter.
 * Persist via `onPartial` after outline and after each chapter so aborts
 * keep progress; re-run resumes thin chapters without regenerating the outline.
 */

import { AI_LONG_PROSE_TIMEOUT_MS } from "@/lib/ai/fetch-timeout";
import { lowestReasoningEffortForScoring } from "@/lib/ai/reasoning-effort";
import { parseModelJsonObjectWithRepair } from "@/lib/ai/repair-model-json";
import { generateText } from "@/lib/ai/provider";
import type { AiModelConfig } from "@/lib/prompts/catalog";
import {
  BUCHTYP_LABELS,
  buildCritiqueRulesAndNeedsBlock,
  exposeTextFromEditorial,
  type RomanBuchTyp,
  type RomanEditorial,
  type RomanWissensGraph,
} from "@/lib/roman/editorial";
import { formatCharaktere } from "@/lib/roman/fundament";
import { suggestedChapterCount } from "@/lib/roman/plot-chapters";
import {
  CLIP,
  ROMAN_CRITIQUE_MANDATE,
  ROMAN_CRITIQUE_MAX_TOKENS,
  ROMAN_EXCELLENCE_MANDATE,
} from "@/lib/roman/pipeline/quality-brief";
import { buildRomanStaticBookPrefix } from "@/lib/roman/prompt-prefix";
import { resolveRomanKiRolle } from "@/lib/roman/roles";
import {
  KAPITELGERUEST_SYSTEM_ADDENDUM,
  parseChapterPlan,
  parseCentralArcs,
  parseRomanKapitelGeruestStructured,
  structuredKapitelGeruestToMarkdown,
  type RomanKapitelGeruestStructured,
  type RomanSzenenplotCentralArc,
} from "@/lib/roman/szenenplot-structured";
import type { RomanCharakter } from "@/lib/roman/types";
import {
  formatWissensGraphForPrompt,
  growWissensGraphFromSkeleton,
  seedWissensGraphFromSources,
} from "@/lib/roman/wissens-graph";

const MAX_CHAPTERS = 24;
/** Compact title/kernsatz list for the whole book. */
const OUTLINE_MAX_TOKENS = 8_000;
/** One chapter at a time; headroom for thinking + JSON (empty STOP retried in gemini). */
const DETAIL_MAX_TOKENS = 6_000;
const DETAIL_TIMEOUT_MS = 120_000;
/** Sketch length — enough to not be kernsatz-only, short enough to stay a Gerüst. */
const MIN_INHALT_CHARS = 90;

const OUTLINE_SCHEMA_HINT = `{
  "centralArcs": [
    {
      "id": "arc_vater_sohn",
      "label": "Vater–Sohn-Spannung",
      "parties": ["Vater", "Sohn"],
      "setupChapter": 2,
      "peakChapter": 8,
      "payoffChapter": 14,
      "notes": "Misstrauen → Bruch → Annäherung"
    }
  ],
  "chapters": [
    { "number": 1, "title": "Kurztitel", "kernsatz": "Funktion im Bogen (eine Zeile)" },
    { "number": 2, "title": "…", "kernsatz": "…" }
  ]
}`;

const DETAIL_SCHEMA_HINT = `{
  "chapters": [
    {
      "number": 1,
      "title": "Kurztitel",
      "kernsatz": "Funktion im Bogen",
      "inhaltKurz": "2–4 Sätze Skizze: was in diesem Kapitel passiert (keine Einzelszenen, kein Mini-Roman).",
      "props": ["Wallbox"],
      "events": ["Vertrag wird unterschrieben"],
      "openThreads": ["Wer hat die Rechnung manipuliert?"],
      "mustNotRepeat": [],
      "introduces": ["Wallbox"],
      "resolves": [],
      "arcBeats": [
        {
          "arcId": "arc_vater_sohn",
          "tension": 1,
          "mustShow": "Alltagsnähe ohne Konflikt",
          "delta": "Basis für späteren Bruch"
        }
      ]
    }
  ]
}`;

export type KapitelGeruestSuggestResult = {
  kapitelGeruestRaw: string;
  structured: RomanKapitelGeruestStructured;
  woven: boolean;
  modelLabel: string;
  wissensGraph: RomanWissensGraph | null;
  /** Chapters skipped because they already had full detail (resume). */
  resumedChapters: number[];
  /** True when outline was reused from a previous partial run. */
  resumedOutline: boolean;
};

export type KapitelGeruestPartialPhase = "outline" | "chapter" | "final";

export type KapitelGeruestPartialPayload = {
  structured: RomanKapitelGeruestStructured;
  kapitelGeruestRaw: string;
  wissensGraph: RomanWissensGraph | null;
  phase: KapitelGeruestPartialPhase;
  /** Set when phase === "chapter". */
  chapterNumber?: number;
};

export type KapitelGeruestCritiqueResult = {
  critique: string;
  modelLabel: string;
};

/** True when Kapitelgerüst already has substance. */
export function hasFilledKapitelGeruest(raw: string): boolean {
  return raw.trim().length >= 80;
}

type ThinChapterLike = {
  kernsatz: string;
  inhaltKurz: string;
  props: string[];
  events: string[];
  openThreads: string[];
  introduces: string[];
  arcBeats: unknown[];
};

/**
 * Outline stub or lazy detail: kernsatz-only body and/or empty lifecycle.
 * Used for resume — only these chapters are re-detailed.
 */
export function isThinKapitelGeruestChapter(ch: ThinChapterLike): boolean {
  const inhalt = ch.inhaltKurz.trim();
  const kern = ch.kernsatz.trim();
  const onlyKernsatz =
    !inhalt ||
    inhalt === kern ||
    inhalt.length < MIN_INHALT_CHARS ||
    (kern.length >= 8 && inhalt.length <= kern.length + 40);
  const bareLifecycle =
    ch.props.length === 0 &&
    ch.events.length === 0 &&
    ch.openThreads.length === 0 &&
    ch.introduces.length === 0 &&
    ch.arcBeats.length === 0;
  return onlyKernsatz || bareLifecycle;
}

/** Enough outline slots exist and at least one chapter still needs detail. */
export function kapitelGeruestNeedsDetailResume(
  structured: RomanKapitelGeruestStructured | null | undefined,
  zielWortzahl: number | null,
): boolean {
  const ziel = suggestedChapterCount(zielWortzahl);
  const minChapters = Math.max(4, ziel - 2);
  if (!structured?.chapters.length || structured.chapters.length < minChapters) {
    return false;
  }
  return structured.chapters.some(isThinKapitelGeruestChapter);
}

function typHints(buchTyp: RomanBuchTyp): string {
  switch (buchTyp) {
    case "sachbuch":
      return `Sachbuch: Kapitel = Argumentblöcke mit klarer Erkenntnis-Funktion.`;
    case "serie_welt":
      return `Serie/Welt: Kapitel für DIESES Band — Kontinuität wahren, Band-Bogen tragen.`;
    default:
      return `Belletristik: Kapitel-Funktionen mit Setup→Peak→Payoff über den Band.`;
  }
}

function buildStaticBookPrefix(input: {
  buchTyp: RomanBuchTyp;
  title: string;
  genre: string;
  ideeKurz: string;
  grobRegeln: string;
  editorial: RomanEditorial;
  charaktere: RomanCharakter[];
  weltSchauplaetze: string;
  weltRegeln: string;
  rechercheDossier?: string;
  tonalitaet?: string;
}): string {
  return `${buildRomanStaticBookPrefix({
    buchTyp: input.buchTyp,
    title: input.title,
    genre: input.genre,
    ideeKurz: input.ideeKurz,
    rechercheDossier: input.rechercheDossier,
    tonalitaet: input.tonalitaet,
    grobRegeln: input.grobRegeln,
    editorial: input.editorial,
    charaktere: input.charaktere,
    weltSchauplaetze: input.weltSchauplaetze,
    weltRegeln: input.weltRegeln,
  })}

${typHints(input.buchTyp)}`;
}

type SkeletonChapter = {
  number: number;
  title: string;
  kernsatz: string;
  inhaltKurz: string;
  props: string[];
  events: string[];
  openThreads: string[];
  mustNotRepeat: string[];
  introduces: string[];
  resolves: string[];
  arcBeats: ReturnType<typeof parseChapterPlan>["arcBeats"];
};

function emptyPlanChapter(
  number: number,
  title: string,
  kernsatz: string,
): SkeletonChapter {
  const plan = parseChapterPlan({});
  return {
    number,
    title,
    kernsatz,
    inhaltKurz: kernsatz || "Kapitel-Inhalt skizzieren.",
    ...plan,
  };
}

function chaptersFromObject(
  obj: Record<string, unknown>,
  options?: { requireInhalt?: boolean },
): SkeletonChapter[] {
  const list = Array.isArray(obj.chapters)
    ? obj.chapters
    : Array.isArray(obj.kapitel)
      ? obj.kapitel
      : [];
  const out: SkeletonChapter[] = [];
  for (const item of list.slice(0, MAX_CHAPTERS)) {
    if (!item || typeof item !== "object") continue;
    const c = item as Record<string, unknown>;
    const number = Number(c.number ?? c.kapitel ?? c.n);
    if (!Number.isFinite(number) || number < 1) continue;
    const title = String(c.title ?? c.titel ?? "")
      .trim()
      .slice(0, 120);
    const kernsatz = String(c.kernsatz ?? c.summary ?? c.role ?? "")
      .trim()
      .slice(0, 400);
    const inhaltKurz = String(
      c.inhaltKurz ?? c.inhalt_kurz ?? c.body ?? "",
    )
      .trim()
      .slice(0, 1_600);
    if (kernsatz.length < 8 && title.length < 2) continue;
    if (options?.requireInhalt && inhaltKurz.length < 12) continue;
    const plan = parseChapterPlan(c);
    out.push({
      number: Math.min(40, Math.round(number)),
      title: title || `Kapitel ${Math.round(number)}`,
      kernsatz: kernsatz || inhaltKurz.slice(0, 200) || "Kapitel-Funktion klären.",
      inhaltKurz: inhaltKurz || kernsatz || "Kapitel-Inhalt skizzieren.",
      ...plan,
    });
  }
  out.sort((a, b) => a.number - b.number);
  return out;
}

async function parseOutlinePayload(
  raw: string,
  model: AiModelConfig,
): Promise<{
  chapters: SkeletonChapter[];
  centralArcs: RomanSzenenplotCentralArc[];
}> {
  const obj = await parseModelJsonObjectWithRepair({
    raw,
    model,
    schemaHint: OUTLINE_SCHEMA_HINT,
    errorLabel: "Kapitelgerüst-Outline",
    timeoutMs: AI_LONG_PROSE_TIMEOUT_MS,
    maxTokens: OUTLINE_MAX_TOKENS,
  });
  const centralArcs = parseCentralArcs(
    obj.centralArcs ?? obj.central_arcs ?? obj.arcs,
  );
  const chapters = chaptersFromObject(obj).map((ch) =>
    emptyPlanChapter(ch.number, ch.title, ch.kernsatz),
  );
  return { chapters, centralArcs };
}

async function parseDetailChapterPayload(
  raw: string,
  model: AiModelConfig,
): Promise<SkeletonChapter[]> {
  const obj = await parseModelJsonObjectWithRepair({
    raw,
    model,
    schemaHint: DETAIL_SCHEMA_HINT,
    errorLabel: "Kapitelgerüst-Detail",
    timeoutMs: DETAIL_TIMEOUT_MS,
    maxTokens: DETAIL_MAX_TOKENS,
  });
  return chaptersFromObject(obj);
}

/** How complete a chapter detail is (inhalt + lifecycle). Higher = better. */
function chapterSubstanceScore(ch: SkeletonChapter): number {
  const inhalt = ch.inhaltKurz.trim();
  const kern = ch.kernsatz.trim();
  let score = inhalt.length;
  if (inhalt && inhalt !== kern) score += 100;
  score += ch.props.length * 20;
  score += ch.events.length * 20;
  score += ch.openThreads.length * 15;
  score += ch.introduces.length * 15;
  score += ch.resolves.length * 10;
  score += ch.arcBeats.length * 25;
  score += ch.mustNotRepeat.length * 5;
  return score;
}

function mergeDetailIntoOutline(
  outline: SkeletonChapter[],
  details: SkeletonChapter[],
): SkeletonChapter[] {
  const byNum = new Map(details.map((c) => [c.number, c]));
  return outline.map((ch) => {
    const d = byNum.get(ch.number);
    if (!d) return ch;
    // Never replace a richer chapter with a thinner retry/truncation fragment.
    if (chapterSubstanceScore(d) < chapterSubstanceScore(ch)) return ch;
    return {
      ...ch,
      title: d.title || ch.title,
      kernsatz: d.kernsatz || ch.kernsatz,
      inhaltKurz: d.inhaltKurz || ch.inhaltKurz,
      props: d.props,
      events: d.events,
      openThreads: d.openThreads,
      mustNotRepeat: d.mustNotRepeat,
      introduces: d.introduces,
      resolves: d.resolves,
      arcBeats: d.arcBeats.length ? d.arcBeats : ch.arcBeats,
    };
  });
}

/**
 * Entwicklungslektor: Pass-1 Kapitelgerüst (structure only) + Wissensgraph seed/grow.
 * Callers should persist via `onPartial` so aborts keep outline + filled chapters.
 */
export async function suggestKapitelGeruestFromCoAutor(input: {
  buchTyp: RomanBuchTyp;
  title: string;
  genre: string;
  ideeKurz: string;
  grobRegeln: string;
  editorial: RomanEditorial;
  charaktere: RomanCharakter[];
  weltSchauplaetze: string;
  weltRegeln: string;
  existingGeruest: string;
  tonalitaet?: string;
  /**
   * `outline` = Grobgerüst (centralArcs + title/kernsatz only).
   * `full` = Feingerüst (detail pass; resumes thin chapters).
   */
  mode?: "outline" | "full";
  onProgress?: (label: string) => Promise<void>;
  /** Persist after outline / each chapter / final graph grow. */
  onPartial?: (payload: KapitelGeruestPartialPayload) => Promise<void>;
}): Promise<KapitelGeruestSuggestResult> {
  const mode = input.mode ?? "full";
  const expose = exposeTextFromEditorial(input.editorial);
  const hasSpec =
    expose.length >= 80 ||
    (input.ideeKurz.trim().length >= 40 &&
      formatCharaktere(input.charaktere).trim().length >= 40);
  if (!hasSpec) {
    throw new Error(
      "Zuerst einen Spec anlegen (Idee + Figuren/Welt/Exposé unter „Spec“).",
    );
  }

  const weave = hasFilledKapitelGeruest(input.existingGeruest);
  const { rolle, model: baseModel } = await resolveRomanKiRolle(
    "entwicklungslektor",
  );
  // Structured JSON: keep thinking light — high thinking + many chapter calls
  // often yields empty STOP (thought tokens only).
  const jsonEffort = lowestReasoningEffortForScoring(baseModel.modelSlug);
  const model: AiModelConfig = {
    ...baseModel,
    reasoningEffort: jsonEffort ?? baseModel.reasoningEffort ?? "low",
  };
  const kapitelZiel = suggestedChapterCount(input.editorial.zielWortzahlRoman);
  const minChapters = Math.max(4, kapitelZiel - 2);
  const maxChapters = Math.min(MAX_CHAPTERS, kapitelZiel + 2);
  const rechercheDossier = input.editorial.rechercheDossier ?? "";
  const tonalitaet = (input.tonalitaet ?? "").trim();

  const resumeOutline = kapitelGeruestNeedsDetailResume(
    input.editorial.kapitelGeruestStructured,
    input.editorial.zielWortzahlRoman,
  );

  let skeleton: SkeletonChapter[] = [];
  let centralArcs: RomanSzenenplotCentralArc[] = [];
  let wissensGraph: RomanWissensGraph | null =
    input.editorial.wissensGraph ?? null;
  const resumedChapters: number[] = [];
  let woven = false;

  const buildStructured = (): RomanKapitelGeruestStructured => ({
    updatedAt: new Date().toISOString(),
    modelLabel: model.label,
    centralArcs,
    chapters: skeleton,
  });

  const emitPartial = async (
    phase: KapitelGeruestPartialPhase,
    chapterNumber?: number,
  ) => {
    if (!input.onPartial) return;
    const structured = buildStructured();
    await input.onPartial({
      structured,
      kapitelGeruestRaw: structuredKapitelGeruestToMarkdown(structured),
      wissensGraph,
      phase,
      chapterNumber,
    });
  };

  const staticPrefix = buildStaticBookPrefix({
    ...input,
    rechercheDossier,
    tonalitaet,
  });
  // Override critique-oriented role defaults (Stärken→Risiken / Bullet-Listen).
  const systemBase = `${rolle.systemPrompt}

${ROMAN_EXCELLENCE_MANDATE}

${KAPITELGERUEST_SYSTEM_ADDENDUM}

AUSGABEFORMAT (überschreibt Rollen-Standardantwort): ausschließlich ein JSON-Objekt gemäß Schema.
VERBOTEN: Markdown, Bullet-Listen („- Kernsatz:“), Lektoratsprosa, Stärken/Risiken-Struktur, Code-Fences.

Zusatz: Wissensgraph und Recherche/Tonalität sind verbindlich — keine Widersprüche zu hardInvariants.
Skizzenhafte offene Fäden sind erlaubt und erwünscht; harte Canon-Widersprüche nicht.`;

  if (resumeOutline) {
    const prev = input.editorial.kapitelGeruestStructured!;
    skeleton = prev.chapters.slice(0, maxChapters).map((ch) => ({
      number: ch.number,
      title: ch.title,
      kernsatz: ch.kernsatz,
      inhaltKurz: ch.inhaltKurz,
      props: ch.props,
      events: ch.events,
      openThreads: ch.openThreads,
      mustNotRepeat: ch.mustNotRepeat,
      introduces: ch.introduces,
      resolves: ch.resolves,
      arcBeats: ch.arcBeats,
    }));
    centralArcs = prev.centralArcs;
    for (const ch of skeleton) {
      if (!isThinKapitelGeruestChapter(ch)) {
        resumedChapters.push(ch.number);
      }
    }
    await input.onProgress?.(
      `Kapitelgerüst · Fortsetzen: Outline steht (${skeleton.length} Kap., ${centralArcs.length} Bögen) — ${resumedChapters.length} fertig, ${
        skeleton.length - resumedChapters.length
      } Kapitel noch detaillieren …`,
    );
    if (!wissensGraph) {
      wissensGraph = await seedWissensGraphFromSources({
        buchTyp: input.buchTyp,
        title: input.title,
        genre: input.genre,
        ideeKurz: input.ideeKurz,
        rechercheDossier,
        tonalitaet,
        grobRegeln: input.grobRegeln,
        editorial: input.editorial,
        charaktere: input.charaktere,
        weltSchauplaetze: input.weltSchauplaetze,
        weltRegeln: input.weltRegeln,
      });
    }
  } else {
    woven = weave;
    await input.onProgress?.(
      "Kapitelgerüst · Outline & Spannungsbögen: Kapitelstruktur wird entworfen …",
    );
    wissensGraph = await seedWissensGraphFromSources({
      buchTyp: input.buchTyp,
      title: input.title,
      genre: input.genre,
      ideeKurz: input.ideeKurz,
      rechercheDossier,
      tonalitaet,
      grobRegeln: input.grobRegeln,
      editorial: input.editorial,
      charaktere: input.charaktere,
      weltSchauplaetze: input.weltSchauplaetze,
      weltRegeln: input.weltRegeln,
    });

    const weaveBlock = weave
      ? `Bestehendes Gerüst VERWEBEN/SCHÄRFEN — brauchbare Kapitel behalten, Lücken schließen, Widersprüche zum Exposé auflösen. KEINE Einzelszenen.`
      : `Kapitelgerüst NEU aus Exposé, Idee, Recherche, Figuren und Welt. KEINE Einzelszenen.`;

    const graphBlock = formatWissensGraphForPrompt(wissensGraph, {
      maxChars: CLIP.sharedContext,
    });

    // --- Pass A: compact outline for the full book ---
    const outlineRaw = await generateText({
      model,
      systemInstruction: systemBase,
      cacheablePrefix: staticPrefix,
      userText: `${graphBlock}

# Bisheriges Gerüst (Orientierung)
${weave ? input.existingGeruest.trim().slice(0, CLIP.kapitelgeruest) : "(leer — neu anlegen)"}

${weaveBlock}

Auftrag — NUR Outline (noch keine inhaltKurz / Props / Events):
- GENAU ${kapitelZiel} Kapitel (mind. ${minChapters}, max. ${maxChapters}) — ALLE in chapters[].
- centralArcs (2–4, PFLICHT): Reihenfolge = Priorität. Index 0 = Hauptbogen (A-Plot), danach Nebenbögen (B/C). Jeweils setupChapter / peakChapter / payoffChapter und parties.
- Pro Kapitel NUR: number, title, kernsatz (eine Zeile).
- Chronologisch, Exposé-Bogen abdecken. Feldtexte auf Deutsch.

Schema:
${OUTLINE_SCHEMA_HINT}

Antwort = nur das JSON-Objekt, beginnend mit {. chapters[] MUSS ${kapitelZiel} Einträge haben.`,
      preferJson: true,
      maxTokens: OUTLINE_MAX_TOKENS,
      timeoutMs: AI_LONG_PROSE_TIMEOUT_MS,
      reasoningEffort: jsonEffort,
    });

    const parsedOutline = await parseOutlinePayload(outlineRaw, model);
    skeleton = parsedOutline.chapters;
    centralArcs = parsedOutline.centralArcs;

    // One continuation if Flash still under-delivered the chapter count.
    if (skeleton.length < minChapters) {
      const have = skeleton
        .map((c) => `${c.number}. ${c.title} — ${c.kernsatz}`)
        .join("\n");
      const needFrom = skeleton.length + 1;
      const needCount = kapitelZiel - skeleton.length;
      const contRaw = await generateText({
        model,
        systemInstruction: systemBase,
        cacheablePrefix: staticPrefix,
        userText: `${graphBlock}

# Bereits feststehende Kapitel (behalten)
${have || "(keine)"}

# Central Arcs (behalten)
${JSON.stringify(centralArcs)}

Auftrag — fehlende Kapitel NACHliefern:
- Liefere chapters[] mit den nächsten ${needCount} Kapiteln (Nummern ab ${needFrom}, bis ca. ${kapitelZiel}).
- Nur number, title, kernsatz. Keine Duplikate der bestehenden Nummern.
- centralArcs weglassen oder unverändert lassen.

Schema:
${OUTLINE_SCHEMA_HINT}

Antwort = nur JSON.`,
        preferJson: true,
        maxTokens: OUTLINE_MAX_TOKENS,
        timeoutMs: AI_LONG_PROSE_TIMEOUT_MS,
        reasoningEffort: jsonEffort,
      });
      const more = await parseOutlinePayload(contRaw, model);
      const seen = new Set(skeleton.map((c) => c.number));
      for (const ch of more.chapters) {
        if (seen.has(ch.number)) continue;
        seen.add(ch.number);
        skeleton.push(ch);
      }
      skeleton.sort((a, b) => a.number - b.number);
      if (!centralArcs.length && more.centralArcs.length) {
        centralArcs = more.centralArcs;
      }
    }

    if (skeleton.length < minChapters) {
      throw new Error(
        `Kapitelgerüst unvollständig: nur ${skeleton.length} Kapitel (Ziel ca. ${kapitelZiel}, mind. ${minChapters}). Bitte erneut erzeugen.`,
      );
    }
    skeleton = skeleton.slice(0, maxChapters);

    await input.onProgress?.(
      mode === "outline"
        ? `Grobgerüst · Outline fertig: ${skeleton.length} Kapitel · ${centralArcs.length} Spannungsbögen`
        : `Kapitelgerüst · Outline gespeichert: ${skeleton.length} Kapitel · ${centralArcs.length} Spannungsbögen — jetzt Kapitel einzeln …`,
    );
    await emitPartial("outline");
  }

  if (mode === "outline") {
    const structured = buildStructured();
    return {
      kapitelGeruestRaw: structuredKapitelGeruestToMarkdown(structured),
      structured,
      woven,
      modelLabel: model.label,
      wissensGraph,
      resumedOutline: Boolean(resumeOutline),
      resumedChapters,
    };
  }

  const graphBlock = formatWissensGraphForPrompt(wissensGraph, {
    maxChars: CLIP.sharedContext,
  });
  const arcsHint = centralArcs.length
    ? `# Central Arcs (verbindlich, Reihenfolge = Priorität: erstes = Hauptbogen)\n${JSON.stringify(centralArcs)}\n`
    : "";

  async function fillDetailChapter(ch: SkeletonChapter): Promise<void> {
    const outlineBlock = skeleton
      .map((c) => {
        const mark = c.number === ch.number ? " ← DIESES KAPITEL" : "";
        return `${c.number}. ${c.title} — ${c.kernsatz}${mark}`;
      })
      .join("\n");

    try {
      const detailRaw = await generateText({
        model,
        systemInstruction: systemBase,
        cacheablePrefix: staticPrefix,
        userText: `${graphBlock}

${arcsHint}
# Gesamtes Kapitel-Outline
${outlineBlock}

# Dieses Kapitel — NUR Kap. ${ch.number} („${ch.title}“)
Skizziere DIESES eine Kapitel — Gerüst-Niveau, kein vorweggenommenes Buch.
PFLICHT:
- number: ${ch.number} (unverändert), title/kernsatz schärfen falls nötig.
- inhaltKurz: 2–4 knappe Sätze (NICHT nur den kernsatz; NICHT 2 Absätze Prosa).
- props und/oder events (mind. eines von beiden, wenn Handlung/Objekte vorkommen) — Stichworte, keine Szenen.
- openThreads (mind. 1, außer letztes Kapitel schließt alles) — offen lassen ist gut.
- arcBeats: für JEDEN centralArc, der hier aktiv ist (Setup-/Peak-/Payoff und Nachbarn) — tension 1–5, mustShow/delta kurz.
- introduces / resolves / mustNotRepeat nach Lifecycle-Regeln.
- KEINE Einzelszenen, KEINE Dialoge, KEINE Motivationessay. Feldtexte auf Deutsch.

Schema (chapters[] mit genau diesem einen Kapitel):
${DETAIL_SCHEMA_HINT}

Antwort = nur JSON.`,
        preferJson: true,
        maxTokens: DETAIL_MAX_TOKENS,
        timeoutMs: DETAIL_TIMEOUT_MS,
        reasoningEffort: jsonEffort,
      });

      const details = await parseDetailChapterPayload(detailRaw, model);
      skeleton = mergeDetailIntoOutline(skeleton, details);
    } catch {
      // Fail-soft: keep outline stub; thin-retry pass may still fill it.
    }
  }

  // --- Pass B: detail only thin / missing chapters ---
  const toFill = skeleton.filter(isThinKapitelGeruestChapter);
  const total = skeleton.length;
  for (let i = 0; i < toFill.length; i += 1) {
    const ch = toFill[i]!;
    const shortTitle = ch.title.slice(0, 40);
    await input.onProgress?.(
      `Kapitel ${ch.number}/${total}: „${shortTitle}“ — Inhalt, Props, Events, Arc-Beats …`,
    );
    await fillDetailChapter(ch);
    await emitPartial("chapter", ch.number);
  }

  // Nachzug: still-thin after first detail pass.
  const stillThin = skeleton.filter(isThinKapitelGeruestChapter);
  for (const ch of stillThin) {
    const shortTitle = ch.title.slice(0, 40);
    await input.onProgress?.(
      `Kapitel ${ch.number}/${total}: „${shortTitle}“ — Nachzug (noch dünn) …`,
    );
    await fillDetailChapter(ch);
    await emitPartial("chapter", ch.number);
  }

  await input.onProgress?.(
    "Kapitelgerüst · Wissensgraph: Kontinuität aus Outline & Kapiteln …",
  );
  try {
    wissensGraph = await growWissensGraphFromSkeleton({
      previous: wissensGraph,
      skeleton,
    });
  } catch {
    // Fail-soft: keep seed / previous graph.
  }

  const structured = buildStructured();
  const parsed =
    parseRomanKapitelGeruestStructured(structured, {
      modelLabel: model.label,
      minChapters,
    }) ?? structured;

  if (parsed.chapters.length < minChapters) {
    throw new Error(
      `Kapitelgerüst unvollständig nach Detail-Pass: ${parsed.chapters.length}/${minChapters} Kapitel.`,
    );
  }

  // Prefer parsed chapters for final persist.
  skeleton = parsed.chapters.map((ch) => ({
    number: ch.number,
    title: ch.title,
    kernsatz: ch.kernsatz,
    inhaltKurz: ch.inhaltKurz,
    props: ch.props,
    events: ch.events,
    openThreads: ch.openThreads,
    mustNotRepeat: ch.mustNotRepeat,
    introduces: ch.introduces,
    resolves: ch.resolves,
    arcBeats: ch.arcBeats,
  }));
  centralArcs = parsed.centralArcs;
  await emitPartial("final");

  return {
    kapitelGeruestRaw: structuredKapitelGeruestToMarkdown(parsed),
    structured: parsed,
    woven,
    modelLabel: model.label,
    wissensGraph,
    resumedChapters: [...resumedChapters].sort((a, b) => a - b),
    resumedOutline: Boolean(resumeOutline),
  };
}

/**
 * Entwicklungslektor: dramaturgy / structure critique of Kapitelgerüst.
 */
export async function critiqueKapitelGeruestMitEntwicklungslektor(input: {
  buchTyp: RomanBuchTyp;
  title: string;
  genre: string;
  ideeKurz: string;
  grobRegeln: string;
  editorial: RomanEditorial;
  charaktere: RomanCharakter[];
  weltSchauplaetze: string;
  weltRegeln: string;
  kapitelGeruest: string;
  structured?: RomanKapitelGeruestStructured | null;
}): Promise<KapitelGeruestCritiqueResult> {
  const { rolle, model } = await resolveRomanKiRolle("entwicklungslektor");
  const expose = exposeTextFromEditorial(input.editorial);
  const rules = buildCritiqueRulesAndNeedsBlock(input.editorial);
  const arcs =
    input.structured?.centralArcs
      ?.map(
        (a) =>
          `- ${a.id}: ${a.label} · Setup ${a.setupChapter} / Peak ${a.peakChapter} / Payoff ${a.payoffChapter}`,
      )
      .join("\n") ?? "";

  const text = await generateText({
    model,
    systemInstruction: `${rolle.systemPrompt}

${ROMAN_CRITIQUE_MANDATE}

Du prüfst NUR das Kapitelgerüst (Dramaturgie, Bögen, Tempo, Kapitelrollen) — keine Einzelszenen-Handlungen, keine Prosa.`,
    userText: `Buch: ${input.title} (${BUCHTYP_LABELS[input.buchTyp]}) · ${input.genre}

# Idee
${input.ideeKurz.slice(0, CLIP.idee)}

# Exposé
${expose.slice(0, CLIP.expose)}

# Figuren
${formatCharaktere(input.charaktere).slice(0, CLIP.charaktere)}

# Regeln / Needs
${rules}

${arcs ? `# Central Arcs\n${arcs}\n` : ""}
# Kapitelgerüst
${input.kapitelGeruest.slice(0, CLIP.kapitelgeruest)}

Prüfe: Kapitelrollen, Tempo, centralArcs Setup/Peak/Payoff, Lifecycle (introduces/resolves), Abdeckung des Exposés.
Auf Deutsch. Strukturierte Gegenlese.`,
    maxTokens: ROMAN_CRITIQUE_MAX_TOKENS,
    timeoutMs: 90_000,
  });

  return { critique: text.trim(), modelLabel: model.label };
}
