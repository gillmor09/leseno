/**
 * Chapter Packet: Gemini Flash compresses Szenenverträge + Graph + State
 * into a Schreibpaket so Sonnet expands prose — no plot invention.
 * When schreibPrompts are frozen, use the deterministic contract packet
 * ({@link buildFrozenContractChapterPacket}) with Gerüst-Plan + structured
 * fields always present (priority budget — never drop mustNotRepeat/secrets).
 */

import { generateText } from "@/lib/ai/provider";
import { resolveRomanAssistModel } from "@/lib/roman/assist-model";
import {
  formatFactContractsForChapter,
  formatPropLifecycleMandates,
  formatStoryStateForPrompt,
  formatWissensGraphForPrompt,
  type RomanStoryState,
  type RomanWissensGraph,
} from "@/lib/roman/editorial";
import { formatMetricFactsForContracts } from "@/lib/roman/wissens-metric-facts";
import {
  buildDeterministicChapterContextBuffer,
  CONTINUITY_PREV_TAIL_CHARS,
} from "@/lib/roman/manuskript-continuity";
import {
  formatChapterHeading,
  type PlotChapter,
} from "@/lib/roman/plot-chapters";
import {
  formatArcContractsForChapter,
  formatCanonicalSceneContract,
  formatChapterPlanBlock,
  formatSpatialSpineForChapter,
  formatStructuredChapterForManuskript,
  type RomanSzenenplotChapterNode,
  type RomanSzenenplotStructured,
} from "@/lib/roman/szenenplot-structured";

/** Max packet size passed to Sonnet userText (Flash / full deterministic). */
export const CHAPTER_PACKET_MAX_CHARS = 5_500;

/**
 * Frozen-contract packet cap. Raised so Gerüst-Plan + secrets + scenes fit;
 * fluff (long state/seam) yields first under priority join.
 */
export const CHAPTER_PACKET_FROZEN_MAX_CHARS = 5_500;

/** True when Szenenplot freigegeben and schreibPrompts are frozen. */
export function hasFrozenSchreibPrompts(
  structured: RomanSzenenplotStructured | null | undefined,
): boolean {
  return Boolean(structured?.schreibPromptsFrozenAt?.trim());
}

/** Prepend a MUSS section if Flash dropped it. */
function ensurePacketSection(
  packet: string,
  section: string,
  headingRe: RegExp,
): string {
  const block = section.trim();
  if (!block) return packet;
  if (headingRe.test(packet)) return packet;
  if (packet.length + block.length + 4 >= CHAPTER_PACKET_MAX_CHARS) {
    return packet;
  }
  return `${block}\n\n${packet}`.slice(0, CHAPTER_PACKET_MAX_CHARS);
}

/**
 * Join sections by priority (lower = keep first). Later/lower-priority text
 * is truncated or dropped so hard contracts survive the cap.
 */
export function joinPacketByPriority(
  sections: Array<{ priority: number; text: string }>,
  maxChars: number,
): string {
  const cleaned = sections
    .map((s) => ({ priority: s.priority, text: s.text.trim() }))
    .filter((s) => s.text.length > 0)
    .sort((a, b) => a.priority - b.priority);

  const parts: string[] = [];
  let used = 0;
  for (const s of cleaned) {
    const sep = parts.length ? 2 : 0;
    if (used + sep + s.text.length <= maxChars) {
      parts.push(s.text);
      used += sep + s.text.length;
      continue;
    }
    const room = maxChars - used - sep;
    // Only clip low-priority fluff; hard contracts (prio ≤ 2) keep a stub.
    if (room >= 200 && s.priority <= 2) {
      parts.push(`${s.text.slice(0, room - 2)}\n…`);
      break;
    }
    if (room >= 120 && s.priority <= 4) {
      parts.push(`${s.text.slice(0, room - 2)}\n…`);
      break;
    }
    // Drop remaining lower-priority sections.
    break;
  }
  return parts.join("\n\n").slice(0, maxChars);
}

/**
 * Hard contracts for one chapter: plan + per-scene structured+prompt.
 * Secrets and mustNotRepeat live here — never only in prose prompt.
 */
export function formatHardChapterContracts(
  ch: RomanSzenenplotChapterNode,
): { plan: string; scenes: string; bans: string; spatial: string } {
  const plan = formatChapterPlanBlock(ch);
  const bans = (ch.mustNotRepeat ?? []).filter((x) => x.trim().length >= 4);
  const banBlock = bans.length
    ? `## Verbote (mustNotRepeat — hart, kein Weichzeichnen)\n${bans
        .map((b) => `- DARF NICHT: ${b}`)
        .join("\n")}`
    : "";
  const scenes = ch.scenes
    .map((s) => {
      const contract = formatCanonicalSceneContract(s);
      return `### ${s.scene_id} — ${s.heading}\n${contract}`;
    })
    .join("\n\n");
  return {
    plan: plan
      ? `## Gerüst-Plan (verbindlich — Lifecycle dieses Kapitels)\n${plan}`
      : "",
    scenes: scenes
      ? `## Szenenverträge (Gesetz — nur ausformulieren, keine Lücken füllen mit neuer Handlung)\n${scenes}`
      : "",
    bans: banBlock,
    spatial: formatSpatialSpineForChapter(ch),
  };
}

/**
 * Deterministic fallback when the Flash assembler fails or returns junk.
 */
export function buildDeterministicChapterPacket(input: {
  storyState: RomanStoryState | null;
  chapter: PlotChapter;
  previousTail: string;
  lektorBriefSnippet?: string;
  wissensGraph?: RomanWissensGraph | null;
  szenenplotStructured?: RomanSzenenplotStructured | null;
  pathBBlock?: string;
  autorBias?: string;
}): string {
  const ch = input.szenenplotStructured?.chapters.find(
    (c) => c.number === input.chapter.number,
  );
  const hard = ch
    ? formatHardChapterContracts(ch)
    : {
        plan: "",
        scenes:
          formatStructuredChapterForManuskript(
            input.szenenplotStructured,
            input.chapter.number,
          ) || input.chapter.body.slice(0, 2_500),
        bans: "",
        spatial: "",
      };
  const arcs = formatArcContractsForChapter(
    input.szenenplotStructured,
    input.chapter.number,
    3,
  );
  const factsBase = formatFactContractsForChapter(
    input.wissensGraph,
    input.chapter.number,
    { storyState: input.storyState, maxChars: 1_600 },
  );
  const metricFacts = formatMetricFactsForContracts(input.wissensGraph, 8);
  const facts = [factsBase, metricFacts].filter(Boolean).join("\n\n").slice(0, 2_000);
  const lifecycle = formatPropLifecycleMandates(
    input.wissensGraph,
    input.chapter.number,
  );
  const graph = formatWissensGraphForPrompt(input.wissensGraph, {
    throughChapter: input.chapter.number,
    maxChars: 1_400,
  });
  const state = formatStoryStateForPrompt(input.storyState);
  const continuity = buildDeterministicChapterContextBuffer({
    storyState: input.storyState,
    chapter: input.chapter,
    previousTail: input.previousTail,
    lektorBriefSnippet: input.lektorBriefSnippet?.slice(0, 500),
    wissensGraph: input.wissensGraph,
  });

  return joinPacketByPriority(
    [
      {
        priority: 0,
        text: `# Kapitel-Paket ${input.chapter.number}\n${formatChapterHeading(input.chapter)}\nARBEITSTEILUNG: Plot/Logik = Szenenverträge + Gerüst + Fakten/Graph + Raum-Spine + FROZEN-Maße (lückenlos umsetzen). Deine Arbeit = Ton, Stimme, Emotion, SHOW — keine neuen Stränge, Props oder Enthüllungen.`,
      },
      {
        priority: 1,
        text: input.lektorBriefSnippet?.trim()
          ? `## Patch-/Lektor-Brief (Vorrang über Beats)\n${input.lektorBriefSnippet.trim().slice(0, 700)}`
          : "",
      },
      { priority: 1, text: hard.bans },
      { priority: 1, text: hard.plan },
      { priority: 1, text: hard.spatial },
      { priority: 2, text: hard.scenes },
      { priority: 2, text: facts },
      { priority: 3, text: arcs },
      { priority: 3, text: lifecycle },
      { priority: 4, text: graph ? graph.slice(0, 1_200) : "" },
      {
        priority: 5,
        text: state ? `## Continuity-State\n${state}` : "",
      },
      {
        priority: 6,
        text: input.autorBias?.trim()
          ? `## Autor-Bias\n${input.autorBias.trim().slice(0, 700)}`
          : "",
      },
      {
        priority: 6,
        text: input.pathBBlock?.trim()
          ? `## Pfad B\n${input.pathBBlock.trim().slice(0, 500)}`
          : "",
      },
      {
        priority: 6,
        text: `## Übergang-Hinweis\n${continuity.slice(0, 900)}`,
      },
    ],
    CHAPTER_PACKET_MAX_CHARS,
  );
}

/**
 * Deterministic packet when schreibPrompts are frozen.
 * Gerüst-Plan + Verbote + canonical scene contracts are priority 1–2.
 */
export function buildFrozenContractChapterPacket(input: {
  storyState: RomanStoryState | null;
  chapter: PlotChapter;
  previousTail: string;
  lektorBriefSnippet?: string;
  wissensGraph?: RomanWissensGraph | null;
  szenenplotStructured?: RomanSzenenplotStructured | null;
}): string {
  const ch = input.szenenplotStructured?.chapters.find(
    (c) => c.number === input.chapter.number,
  );
  const hard = ch
    ? formatHardChapterContracts(ch)
    : {
        plan: "",
        scenes:
          formatStructuredChapterForManuskript(
            input.szenenplotStructured,
            input.chapter.number,
          ) || input.chapter.body.slice(0, 1_800),
        bans: "",
        spatial: "",
      };

  const arcs = formatArcContractsForChapter(
    input.szenenplotStructured,
    input.chapter.number,
    1,
  );
  const factsBase = formatFactContractsForChapter(
    input.wissensGraph,
    input.chapter.number,
    { storyState: input.storyState, maxChars: 1_200 },
  );
  const metricFacts = formatMetricFactsForContracts(input.wissensGraph, 8);
  const facts = [factsBase, metricFacts].filter(Boolean).join("\n\n").slice(0, 1_600);
  const lifecycle = formatPropLifecycleMandates(
    input.wissensGraph,
    input.chapter.number,
  );
  const invariants = (input.wissensGraph?.hardInvariants ?? [])
    .map((h) => h.trim())
    .filter((h) => h.length >= 12)
    .slice(0, 10)
    .map((h) => `- ${h.slice(0, 180)}`)
    .join("\n");
  const invariantBlock = invariants
    ? `## Harte Invarianten (Graph — Logik/Maße, kein Widerspruch)\n${invariants}`
    : "";
  const state = formatStoryStateForPrompt(input.storyState).slice(0, 700);

  const lastHook =
    ch?.scenes[ch.scenes.length - 1]?.continuity.next_scene_hook?.trim() ?? "";
  const seam = input.previousTail.trim().slice(-800);
  const transition = [
    lastHook ? `MUSS — Hook aus Vertrag: ${lastHook}` : "",
    seam ? `Ende Vorgänger (nahtlos anschließen):\n${seam}` : "(Kapitel 1)",
  ]
    .filter(Boolean)
    .join("\n");

  return joinPacketByPriority(
    [
      {
        priority: 0,
        text: `# Kapitel-Paket ${input.chapter.number} (frozen contracts)\n${formatChapterHeading(input.chapter)}\nARBEITSTEILUNG: Szenenverträge + Gerüst + Raum-Spine + Fakten/Invarianten = vollständige Handlung (keine Lücken füllen). Deine Arbeit = Stimme, Ton, Emotion, SHOW. Stimme/Tabus zusätzlich im Cache-Canon.`,
      },
      {
        priority: 1,
        text: input.lektorBriefSnippet?.trim()
          ? `## Patch-/Lektor-Brief (Vorrang)\n${input.lektorBriefSnippet.trim().slice(0, 500)}`
          : "",
      },
      { priority: 1, text: hard.bans },
      { priority: 1, text: hard.plan },
      { priority: 1, text: hard.spatial },
      { priority: 1, text: invariantBlock },
      { priority: 2, text: hard.scenes },
      {
        priority: 2,
        text: facts ? facts : "",
      },
      { priority: 3, text: arcs ? arcs.slice(0, 800) : "" },
      { priority: 3, text: lifecycle ? lifecycle.slice(0, 700) : "" },
      {
        priority: 5,
        text: state ? `## Continuity-State\n${state}` : "",
      },
      {
        priority: 6,
        text: `## Übergang\n${transition}`,
      },
    ],
    CHAPTER_PACKET_FROZEN_MAX_CHARS,
  );
}

/**
 * Resolve chapter packet: frozen contracts → deterministic slim (no Flash);
 * otherwise Gemini Flash assembler with deterministic fallback.
 */
export async function resolveManuskriptChapterPacket(input: {
  storyState: RomanStoryState | null;
  chapter: PlotChapter;
  allChapters: PlotChapter[];
  previousTail: string;
  lektorBrief: string;
  wissensGraph?: RomanWissensGraph | null;
  szenenplotStructured?: RomanSzenenplotStructured | null;
  pathBBlock?: string;
  autorBias?: string;
  slimCanonSnippet?: string;
}): Promise<{
  packet: string;
  modelLabel: string | null;
  frozen: boolean;
}> {
  if (hasFrozenSchreibPrompts(input.szenenplotStructured)) {
    return {
      packet: buildFrozenContractChapterPacket({
        storyState: input.storyState,
        chapter: input.chapter,
        previousTail: input.previousTail,
        lektorBriefSnippet: input.lektorBrief,
        wissensGraph: input.wissensGraph,
        szenenplotStructured: input.szenenplotStructured,
      }),
      modelLabel: "frozen-contracts",
      frozen: true,
    };
  }
  const assembled = await assembleManuskriptChapterPacket(input);
  return { ...assembled, frozen: false };
}

/**
 * Gemini Flash: one compact Schreibpaket for this chapter.
 * Fail-soft → deterministic packet.
 */
export async function assembleManuskriptChapterPacket(input: {
  storyState: RomanStoryState | null;
  chapter: PlotChapter;
  allChapters: PlotChapter[];
  previousTail: string;
  lektorBrief: string;
  wissensGraph?: RomanWissensGraph | null;
  szenenplotStructured?: RomanSzenenplotStructured | null;
  pathBBlock?: string;
  autorBias?: string;
  slimCanonSnippet?: string;
}): Promise<{ packet: string; modelLabel: string | null }> {
  const fallback = buildDeterministicChapterPacket({
    storyState: input.storyState,
    chapter: input.chapter,
    previousTail: input.previousTail,
    lektorBriefSnippet: input.lektorBrief,
    wissensGraph: input.wissensGraph,
    szenenplotStructured: input.szenenplotStructured,
    pathBBlock: input.pathBBlock,
    autorBias: input.autorBias,
  });

  try {
    const model = await resolveRomanAssistModel();
    const chPlan = input.szenenplotStructured?.chapters.find(
      (c) => c.number === input.chapter.number,
    );
    const hard = chPlan ? formatHardChapterContracts(chPlan) : null;
    const arcs = formatArcContractsForChapter(
      input.szenenplotStructured,
      input.chapter.number,
      3,
    );
    const factsBase = formatFactContractsForChapter(
      input.wissensGraph,
      input.chapter.number,
      { storyState: input.storyState, maxChars: 1_700 },
    );
    const metricFacts = formatMetricFactsForContracts(input.wissensGraph, 8);
    const facts = [factsBase, metricFacts]
      .filter(Boolean)
      .join("\n\n")
      .slice(0, 2_200);
    const beats =
      hard?.scenes ||
      formatStructuredChapterForManuskript(
        input.szenenplotStructured,
        input.chapter.number,
      ) ||
      input.chapter.body.slice(0, 3_500);
    const remaining = input.allChapters
      .filter((c) => c.number > input.chapter.number)
      .slice(0, 4)
      .map((c) => {
        const nextCh = input.szenenplotStructured?.chapters.find(
          (x) => x.number === c.number,
        );
        const arcHint = nextCh?.arcBeats?.length
          ? ` | arcs: ${nextCh.arcBeats
              .map((b) => `${b.arcId}@T${b.tension}`)
              .join(", ")}`
          : "";
        return `- Kap. ${c.number}: ${c.title}${arcHint}`;
      })
      .join("\n");
    const graph = formatWissensGraphForPrompt(input.wissensGraph, {
      throughChapter: input.chapter.number,
      maxChars: 3_500,
    });
    const lifecycle = formatPropLifecycleMandates(
      input.wissensGraph,
      input.chapter.number,
    );

    const raw = (
      await generateText({
        model,
        systemInstruction: `Du bist Continuity-Assembler für einen Roman.
Komprimiere den Kontext zu EINEM knappen Kapitel-Schreibpaket für den Co-Autor.
Nur Deutsch, Markdown, keine Code-Fences, keine Prosa schreiben.
Maximal ~900 Wörter. Alles Verbindliche behalten; Rohdossier weglassen.
Ton & Basisregeln aus Slim-Canon/Lektor-Brief sind MUSS: Humor, Wortwitz, Register und harte Regeln in „Stimme & Tabus“ konkret machen — nicht weglassen.
Arc-Verträge (Spannungsbögen / Beziehungen) sind MUSS — Abschnitt „Arc-Verträge“ vollständig und konkret übernehmen, nicht kürzen oder weglassen.
Fakten-Verträge (Props/Logik: Auto, Kennzeichen, Besitz, Verträge) sind MUSS — Abschnitt „Fakten-Verträge“ vollständig übernehmen; FROZEN-Attrs nicht weglassen.
Gerüst-Plan (Props/Events/mustNotRepeat/openThreads) und DARF-NICHT-Geheimnisse sind MUSS — MUSS/DARF-NICHT aus Szenenverträgen wörtlich übernehmen, Geheimnisse nicht zusammenfassen oder abschwächen.
Raum-/Prop-Spine ist MUSS — Ort/Etage und Prop-Ablagen nach jeder Szene übernehmen; hoch/runter muss zum Endzustand passen.
PRIORITÄT: Lektor-/Patch-Brief steht ÜBER Szenenverträgen. Was der Brief streicht oder verbietet, darf NICHT als MUSS im Paket stehen.
ARBEITSTEILUNG im Paket klar machen: Plot/Logik = Verträge (lückenlos); Co-Autor = Ton/Emotion/SHOW — keine neuen Stränge, Props oder Enthüllungen.`,
        userText: `# Slim-Canon (Ausschnitt)
${(input.slimCanonSnippet ?? "").slice(0, 2_200) || "(leer)"}

# Lektor-/Patch-Brief (höchste Priorität — über Szenenverträge)
${input.lektorBrief.trim().slice(0, 2_200) || "(leer)"}

# Continuity-State
${formatStoryStateForPrompt(input.storyState) || "(leer)"}

# Wissensgraph
${graph || "(leer)"}

# Prop-Lebenszyklus
${lifecycle || "(keine)"}

# Fakten-Verträge (Roh — verbindlich übernehmen)
${facts || "(keine)"}

# Arc-Verträge (Roh — verbindlich übernehmen)
${arcs || "(keine — dann aus Verträgen ableiten)"}

# Dieses Kapitel
${formatChapterHeading(input.chapter)}
${hard?.plan ? `${hard.plan}\n` : ""}
${hard?.bans ? `${hard.bans}\n` : ""}
${hard?.spatial ? `${hard.spatial}\n` : ""}
Szenenverträge (kanonisch — Structured + Auftrag):
${beats.slice(0, 4_500)}

# Autor-Bias
${(input.autorBias ?? "").trim().slice(0, 900) || "(keiner)"}

# Pfad B
${(input.pathBBlock ?? "").trim().slice(0, 700) || "(keiner)"}

# Ende Vorgänger
${input.previousTail.trim().slice(-CONTINUITY_PREV_TAIL_CHARS) || "(Kapitel 1)"}

# Folgende Kapitel (Titel + Arc-Hinweis)
${remaining || "(letztes Kapitel)"}

Baue das Schreibpaket mit genau diesen Überschriften:
## Stimme & Tabus (kurz — Ton/Humor/Wortwitz/Register + harte Regeln aus Canon, verbindlich)
## Arc-Verträge (verbindlich — dieses Kapitel + nächste 2–3; tension/mustShow/delta)
## Fakten-Verträge (verbindlich — FROZEN attrs + erlaubte Deltas dieses Kapitels)
## Gerüst-Plan / Verbote (mustNotRepeat, openThreads, Props — verbindlich)
## Raum-/Prop-Spine (verbindlich — Etage & Ablage nach jeder Szene)
## Fokus dieses Kapitels
## Szenenverträge (verbindlich — Structured MUSS/DARF-NICHT + Auftrag, nur ausformulieren)
## Props/Events (einführen / referenzieren / schließen)
## Continuity / Verbote
## Übergang vom Vorgänger
## Figurenstimmen (nur Anwesende)`,
        preferJson: false,
        maxTokens: 2_200,
        timeoutMs: 60_000,
        reasoningEffort: "none",
      })
    ).trim();

    const cleaned = raw
      .replace(/^```(?:markdown|md)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();
    if (cleaned.length < 120) {
      return { packet: fallback, modelLabel: model.label };
    }
    let packet = cleaned.slice(0, CHAPTER_PACKET_MAX_CHARS);
    packet = ensurePacketSection(packet, arcs, /##\s*Arc-Verträge/i);
    packet = ensurePacketSection(packet, facts, /##\s*Fakten-Verträge/i);
    if (hard?.plan) {
      packet = ensurePacketSection(packet, hard.plan, /##\s*Gerüst-Plan/i);
    }
    if (hard?.bans) {
      packet = ensurePacketSection(packet, hard.bans, /##\s*Verbote/i);
    }
    if (hard?.spatial) {
      packet = ensurePacketSection(
        packet,
        hard.spatial,
        /##\s*Raum-?\/?\s*Prop-Spine/i,
      );
    }
    return {
      packet,
      modelLabel: model.label,
    };
  } catch {
    return { packet: fallback, modelLabel: null };
  }
}
