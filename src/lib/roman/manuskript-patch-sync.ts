/**
 * After Manuskript Verbessern / Feedback / Dimension patches: lightly sync
 * Kapitelgerüst beats for changed chapters and retract rejected themes in the
 * Wissensgraph so old MUSS-beats do not reappear on the next patch.
 * Fail-soft — prose patches must not fail because sync failed.
 */

import { parseModelJsonObject } from "@/lib/ai/parse-model-json";
import { generateText } from "@/lib/ai/provider";
import { resolveRomanAssistModel } from "@/lib/roman/assist-model";
import type {
  RomanWissensGraph,
  RomanWissensGraphNode,
} from "@/lib/roman/editorial";
import {
  parseArcBeat,
  parseChapterPlan,
  type RomanKapitelGeruestStructured,
  type RomanSzenenplotChapterNode,
  type RomanSzenenplotScene,
  type RomanSzenenplotStructured,
} from "@/lib/roman/szenenplot-structured";

const CLIP_BODY = 4_500;
const CLIP_BRIEF = 2_500;

type ChangedChapter = {
  number: number;
  title: string;
  body: string;
};

/**
 * Priority banner prepended to the chapter packet during craft apply.
 */
export function formatPatchPriorityBanner(patchBrief: string): string {
  const brief = patchBrief.trim().slice(0, 1_200);
  return [
    "## Patch-Vorrang (verbindlich — höchste Priorität)",
    "Der Patch-Brief steht ÜBER Gerüst-Beats, Arc-Verträgen und Paket-Fokus.",
    "Was der Brief streicht, ersetzt oder verbietet, gilt — auch wenn Beats/Arcs es noch fordern.",
    "Gestrichene Motive in späteren Läufen NICHT wieder einführen, solange der Brief das verlangt.",
    brief ? `Patch-Kern:\n${brief}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function mergeScene(
  prev: RomanSzenenplotScene,
  patch: Record<string, unknown>,
): RomanSzenenplotScene {
  const summary = String(patch.summary ?? "").trim();
  const goal = String(
    (patch.dramaturgy as Record<string, unknown> | undefined)?.scene_goal ??
      patch.scene_goal ??
      "",
  ).trim();
  const obstacle = String(
    (patch.dramaturgy as Record<string, unknown> | undefined)
      ?.obstacle_conflict ??
      patch.obstacle_conflict ??
      "",
  ).trim();
  const turn = String(
    (patch.dramaturgy as Record<string, unknown> | undefined)?.turning_point ??
      patch.turning_point ??
      "",
  ).trim();
  const value = String(
    (patch.dramaturgy as Record<string, unknown> | undefined)
      ?.outcome_value_change ??
      patch.outcome_value_change ??
      "",
  ).trim();
  return {
    ...prev,
    summary: summary.length >= 8 ? summary.slice(0, 600) : prev.summary,
    dramaturgy: {
      scene_goal:
        goal.length >= 4 ? goal.slice(0, 400) : prev.dramaturgy.scene_goal,
      obstacle_conflict:
        obstacle.length >= 4
          ? obstacle.slice(0, 400)
          : prev.dramaturgy.obstacle_conflict,
      turning_point:
        turn.length >= 4 ? turn.slice(0, 400) : prev.dramaturgy.turning_point,
      outcome_value_change:
        value.length >= 4
          ? value.slice(0, 400)
          : prev.dramaturgy.outcome_value_change,
    },
  };
}

function mergeChapterNode(
  prev: RomanSzenenplotChapterNode,
  patch: Record<string, unknown>,
): RomanSzenenplotChapterNode {
  const plan = parseChapterPlan({ ...prev, ...patch });
  const kernsatz = String(patch.kernsatz ?? "").trim();
  const hasKey = (...keys: string[]) => keys.some((k) => k in patch);
  const arcRaw = patch.arcBeats ?? patch.arc_beats;
  let arcBeats = prev.arcBeats;
  if (Array.isArray(arcRaw)) {
    const next = [];
    for (const item of arcRaw.slice(0, 6)) {
      const beat = parseArcBeat(item);
      if (beat) next.push(beat);
    }
    // Explicit empty array = clear rejected arc beats for this chapter.
    arcBeats = next;
  }
  const scenesRaw = Array.isArray(patch.scenes) ? patch.scenes : null;
  let scenes = prev.scenes;
  if (scenesRaw?.length) {
    scenes = prev.scenes.map((s) => {
      const hit = scenesRaw.find((raw) => {
        if (!raw || typeof raw !== "object") return false;
        const id = String(
          (raw as Record<string, unknown>).scene_id ??
            (raw as Record<string, unknown>).sceneId ??
            "",
        ).trim();
        return id === s.scene_id;
      }) as Record<string, unknown> | undefined;
      return hit ? mergeScene(s, hit) : s;
    });
  }
  return {
    ...prev,
    kernsatz:
      kernsatz.length >= 8 ? kernsatz.slice(0, 400) : prev.kernsatz,
    props: hasKey("props", "gegenstaende")
      ? plan.props
      : plan.props.length
        ? plan.props
        : prev.props,
    events: hasKey("events", "ereignisse")
      ? plan.events
      : plan.events.length
        ? plan.events
        : prev.events,
    openThreads: hasKey("openThreads", "open_threads", "threads")
      ? plan.openThreads
      : plan.openThreads.length
        ? plan.openThreads
        : prev.openThreads,
    mustNotRepeat: hasKey(
      "mustNotRepeat",
      "must_not_repeat",
      "nichtWiederholen",
    )
      ? plan.mustNotRepeat
      : plan.mustNotRepeat.length
        ? plan.mustNotRepeat
        : prev.mustNotRepeat,
    introduces: hasKey("introduces", "fuehrtEin")
      ? plan.introduces
      : plan.introduces.length
        ? plan.introduces
        : prev.introduces,
    resolves: hasKey("resolves", "schliesst", "loest")
      ? plan.resolves
      : plan.resolves.length
        ? plan.resolves
        : prev.resolves,
    arcBeats,
    scenes,
  };
}

/**
 * Sync Gerüst chapter nodes to the new prose for changed chapters only.
 */
export async function syncGeruestAfterManuskriptPatch(input: {
  structured: RomanSzenenplotStructured;
  patchBrief: string;
  changedChapters: ChangedChapter[];
}): Promise<RomanSzenenplotStructured> {
  if (!input.changedChapters.length) return input.structured;
  const model = await resolveRomanAssistModel();
  const chapterBlock = input.changedChapters
    .map((c) => {
      const prev = input.structured.chapters.find((x) => x.number === c.number);
      const prevPlan = prev
        ? `Alt-Kernsatz: ${prev.kernsatz}\nAlt-openThreads: ${prev.openThreads.join("; ") || "—"}\nAlt-mustNotRepeat: ${prev.mustNotRepeat.join("; ") || "—"}\nAlt-arcBeats: ${
            prev.arcBeats
              .map((b) => `${b.arcId}@T${b.tension}:${b.mustShow}`)
              .join(" | ") || "—"
          }`
        : "(kein Gerüst-Knoten)";
      return `## Kapitel ${c.number} — ${c.title}
${prevPlan}

### Neue Prosa (Ausschnitt)
${c.body.trim().slice(0, CLIP_BODY)}`;
    })
    .join("\n\n")
    .slice(0, 28_000);

  const arcsHint = input.structured.centralArcs.length
    ? `centralArcs: ${input.structured.centralArcs
        .map((a) => `${a.id}=${a.label}`)
        .join("; ")}`
    : "centralArcs: (keine)";

  const raw = await generateText({
    model,
    systemInstruction: `Du synchronisierst das Kapitelgerüst nach einer Manuskript-Verbesserung.
Nur die genannten Kapitel anpassen. Behalte Kapitelnummern und scene_id.
Streiche Motive/Beats, die der Patch-Brief entfernt hat — sie dürfen nicht als MUSS zurückkehren.
Aktualisiere kernsatz, openThreads, mustNotRepeat, arcBeats (tension/mustShow/delta) und bei Bedarf scene summary/dramaturgy kurz.
Antwort NUR als JSON:
{"chapters":[{"number":1,"kernsatz":"…","openThreads":[],"mustNotRepeat":[],"arcBeats":[{"arcId":"…","tension":2,"mustShow":"…","delta":"…"}],"scenes":[{"scene_id":"SZ_01","summary":"…","dramaturgy":{"scene_goal":"…","obstacle_conflict":"…","turning_point":"…","outcome_value_change":"…"}}]}]}
Keine Markdown-Fences.`,
    userText: `# Patch-Brief (verbindlich)
${input.patchBrief.trim().slice(0, CLIP_BRIEF) || "(leer)"}

# ${arcsHint}

# Geänderte Kapitel
${chapterBlock}`,
    preferJson: true,
    maxTokens: 4_000,
    timeoutMs: 90_000,
    reasoningEffort: "none",
  });

  const obj = parseModelJsonObject(raw, "Gerüst-Sync");
  const list = Array.isArray(obj.chapters) ? obj.chapters : [];
  if (!list.length) return input.structured;

  const byNum = new Map<number, Record<string, unknown>>();
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const n = Number(row.number ?? row.kapitel);
    if (!Number.isFinite(n) || n < 1) continue;
    byNum.set(Math.round(n), row);
  }

  const chapters = input.structured.chapters.map((ch) => {
    const patch = byNum.get(ch.number);
    return patch ? mergeChapterNode(ch, patch) : ch;
  });

  return {
    ...input.structured,
    updatedAt: new Date().toISOString(),
    modelLabel: `${input.structured.modelLabel || "—"} · Sync`,
    chapters,
  };
}

function markNodeResolved(
  node: RomanWissensGraphNode,
  chapterNumber: number,
): RomanWissensGraphNode {
  return {
    ...node,
    attrs: {
      ...node.attrs,
      status: "resolved",
      resolvedChapter: String(chapterNumber),
      retractReason: "manuskript_patch",
    },
  };
}

export type GraphRetractResult = {
  graph: RomanWissensGraph;
  /** Lowercased motif/prop labels the patch forbids (for book-wide Gerüst scrub). */
  forbidLabels: string[];
};

/**
 * Retract rejected themes in the knowledge graph after a craft patch.
 * Adds hardInvariants and marks matching thread/motif/prop nodes resolved.
 */
export async function retractWissensGraphAfterPatch(input: {
  graph: RomanWissensGraph;
  patchBrief: string;
  changedChapters: ChangedChapter[];
}): Promise<GraphRetractResult> {
  if (!input.changedChapters.length) {
    return { graph: input.graph, forbidLabels: [] };
  }
  const model = await resolveRomanAssistModel();
  const maxChapter = Math.max(
    ...input.changedChapters.map((c) => c.number),
    1,
  );
  const nodeIndex = input.graph.nodes
    .filter((n) =>
      ["thread", "motif", "prop", "event", "secret", "fact"].includes(n.kind),
    )
    .slice(0, 80)
    .map((n) => `- ${n.id} [${n.kind}] ${n.label}: ${n.summary.slice(0, 120)}`)
    .join("\n");

  const raw = await generateText({
    model,
    systemInstruction: `Du bereinigst den Wissensgraphen nach Manuskript-Verbessern.
Extrahiere Motive/Props/Threads, die der Patch-Brief STREICHT oder VERBIETET (nicht wieder einführen).
Antwort NUR als JSON:
{"forbidLabels":["kurzer Name"],"resolveNodeIds":["node_id"],"hardInvariants":["Muss: Motiv X nicht wieder einführen (ab Kap. N)"]}
Nur echte Retracts — keine kosmetischen Infos. Max. 8 forbidLabels, 12 resolveNodeIds, 8 hardInvariants.
Keine Markdown-Fences.`,
    userText: `# Patch-Brief
${input.patchBrief.trim().slice(0, CLIP_BRIEF)}

# Geänderte Kapitel
${input.changedChapters
  .map((c) => `Kap. ${c.number}: ${c.title}`)
  .join("\n")}

# Graph-Knoten (Auswahl)
${nodeIndex || "(leer)"}`,
    preferJson: true,
    maxTokens: 1_500,
    timeoutMs: 60_000,
    reasoningEffort: "none",
  });

  const obj = parseModelJsonObject(raw, "Graph-Retract");
  const forbidLabels = Array.isArray(obj.forbidLabels)
    ? obj.forbidLabels
        .map((x) => String(x ?? "").trim().toLowerCase())
        .filter((s) => s.length >= 2)
        .slice(0, 8)
    : [];
  const resolveIds = new Set(
    Array.isArray(obj.resolveNodeIds)
      ? obj.resolveNodeIds
          .map((x) => String(x ?? "").trim())
          .filter(Boolean)
          .slice(0, 12)
      : [],
  );
  const newInvariants = Array.isArray(obj.hardInvariants)
    ? obj.hardInvariants
        .map((x) => String(x ?? "").trim())
        .filter((s) => s.length >= 12)
        .slice(0, 8)
    : [];

  // Also resolve by label match against forbidLabels.
  for (const n of input.graph.nodes) {
    const label = n.label.trim().toLowerCase();
    if (!label) continue;
    if (forbidLabels.some((f) => label.includes(f) || f.includes(label))) {
      resolveIds.add(n.id);
    }
  }

  if (!resolveIds.size && !newInvariants.length && !forbidLabels.length) {
    return { graph: input.graph, forbidLabels: [] };
  }

  const nodes = input.graph.nodes.map((n) =>
    resolveIds.has(n.id) ? markNodeResolved(n, maxChapter) : n,
  );

  const autoInvariants = forbidLabels.map(
    (f) =>
      `Muss: „${f}“ nicht wieder einführen / nicht neu erfinden (Manuskript-Patch, ab Kap. ${maxChapter}).`,
  );
  const hardInvariants = Array.from(
    new Set([
      ...input.graph.hardInvariants,
      ...newInvariants,
      ...autoInvariants,
    ]),
  ).slice(0, 40);

  return {
    graph: {
      ...input.graph,
      updatedAt: new Date().toISOString(),
      modelLabel: `${input.graph.modelLabel || "—"} · Retract`,
      nodes,
      hardInvariants,
    },
    forbidLabels,
  };
}

function mentionsForbidden(text: string, forbidLabels: string[]): boolean {
  const hay = text.trim().toLowerCase();
  if (!hay || !forbidLabels.length) return false;
  return forbidLabels.some((f) => f.length >= 2 && hay.includes(f));
}

/**
 * Book-wide: strip forbidden motifs from ALL Gerüst chapters (not only patched),
 * so Hydra beats in unpatched chapters cannot re-enter the next packet.
 */
export function scrubGeruestForbiddenMotifs(
  structured: RomanSzenenplotStructured,
  forbidLabels: string[],
): RomanSzenenplotStructured {
  const labels = forbidLabels
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length >= 2)
    .slice(0, 8);
  if (!labels.length) return structured;

  let touched = false;
  const chapters = structured.chapters.map((ch) => {
    const mustNot = new Set(ch.mustNotRepeat.map((s) => s.trim()).filter(Boolean));
    for (const f of labels) {
      mustNot.add(`Nicht wieder einführen: ${f}`);
    }

    const openThreads = ch.openThreads.filter(
      (t) => !mentionsForbidden(t, labels),
    );
    const props = ch.props.filter((p) => !mentionsForbidden(p, labels));
    const events = ch.events.filter((e) => !mentionsForbidden(e, labels));
    const introduces = ch.introduces.filter(
      (x) => !mentionsForbidden(x, labels),
    );
    const arcBeats = ch.arcBeats.filter(
      (b) =>
        !mentionsForbidden(b.mustShow, labels) &&
        !mentionsForbidden(b.delta, labels),
    );
    const kernsatz = mentionsForbidden(ch.kernsatz, labels)
      ? ch.kernsatz
          .split(/[.;]/)
          .map((s) => s.trim())
          .filter((s) => s && !mentionsForbidden(s, labels))
          .join(". ")
          .slice(0, 400) || ch.kernsatz
      : ch.kernsatz;

    const nextMust = Array.from(mustNot).slice(0, 12);
    const changed =
      openThreads.length !== ch.openThreads.length ||
      props.length !== ch.props.length ||
      events.length !== ch.events.length ||
      introduces.length !== ch.introduces.length ||
      arcBeats.length !== ch.arcBeats.length ||
      kernsatz !== ch.kernsatz ||
      nextMust.length !== ch.mustNotRepeat.length ||
      nextMust.some((m, i) => m !== ch.mustNotRepeat[i]);

    if (!changed) return ch;
    touched = true;
    return {
      ...ch,
      kernsatz,
      props,
      events,
      openThreads,
      introduces,
      arcBeats,
      mustNotRepeat: nextMust,
    };
  });

  if (!touched) return structured;
  return {
    ...structured,
    updatedAt: new Date().toISOString(),
    modelLabel: `${structured.modelLabel || "—"} · Forbid-Scrub`,
    chapters,
  };
}

/**
 * Sync Kapitelgerüst JSON after a Gerüst markdown patch (no scenes).
 * Keeps structured alive so downstream Szenenplot / packets stay consistent.
 */
export async function syncKapitelGeruestAfterPatch(input: {
  structured: RomanKapitelGeruestStructured;
  patchBrief: string;
  changedChapters: ChangedChapter[];
}): Promise<RomanKapitelGeruestStructured> {
  if (!input.changedChapters.length) return input.structured;
  const model = await resolveRomanAssistModel();
  const chapterBlock = input.changedChapters
    .map((c) => {
      const prev = input.structured.chapters.find((x) => x.number === c.number);
      const prevPlan = prev
        ? `Alt-Kernsatz: ${prev.kernsatz}
Alt-InhaltKurz: ${prev.inhaltKurz.slice(0, 600)}
Alt-openThreads: ${prev.openThreads.join("; ") || "—"}
Alt-mustNotRepeat: ${prev.mustNotRepeat.join("; ") || "—"}
Alt-arcBeats: ${
            prev.arcBeats
              .map((b) => `${b.arcId}@T${b.tension}:${b.mustShow}`)
              .join(" | ") || "—"
          }`
        : "(kein Gerüst-Knoten)";
      return `## Kapitel ${c.number} — ${c.title}
${prevPlan}

### Neuer Markdown (Ausschnitt)
${c.body.trim().slice(0, CLIP_BODY)}`;
    })
    .join("\n\n")
    .slice(0, 28_000);

  const raw = await generateText({
    model,
    systemInstruction: `Du synchronisierst das Kapitelgerüst-JSON nach einer Gerüst-Verbesserung.
Nur die genannten Kapitel. Behalte Kapitelnummern und Titel.
Streiche Motive/Beats, die der Patch-Brief entfernt — sie dürfen nicht als MUSS zurückkehren.
Aktualisiere kernsatz, inhaltKurz, openThreads, mustNotRepeat, props/events/introduces/resolves, arcBeats.
Antwort NUR als JSON:
{"chapters":[{"number":1,"kernsatz":"…","inhaltKurz":"…","openThreads":[],"mustNotRepeat":[],"props":[],"events":[],"introduces":[],"resolves":[],"arcBeats":[{"arcId":"…","tension":2,"mustShow":"…","delta":"…"}]}]}
Keine Markdown-Fences.`,
    userText: `# Patch-Brief (verbindlich)
${input.patchBrief.trim().slice(0, CLIP_BRIEF) || "(leer)"}

# Geänderte Kapitel
${chapterBlock}`,
    preferJson: true,
    maxTokens: 4_000,
    timeoutMs: 90_000,
    reasoningEffort: "none",
  });

  const obj = parseModelJsonObject(raw, "Kapitelgerüst-Sync");
  const list = Array.isArray(obj.chapters) ? obj.chapters : [];
  if (!list.length) return input.structured;

  const byNum = new Map<number, Record<string, unknown>>();
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const n = Number(row.number ?? row.kapitel);
    if (!Number.isFinite(n) || n < 1) continue;
    byNum.set(Math.round(n), row);
  }

  const chapters = input.structured.chapters.map((ch) => {
    const patch = byNum.get(ch.number);
    if (!patch) return ch;
    const plan = parseChapterPlan({ ...ch, ...patch });
    const kernsatz = String(patch.kernsatz ?? "").trim();
    const inhaltKurz = String(
      patch.inhaltKurz ?? patch.inhalt_kurz ?? "",
    ).trim();
    const arcRaw = patch.arcBeats ?? patch.arc_beats;
    let arcBeats = ch.arcBeats;
    if (Array.isArray(arcRaw)) {
      const next = [];
      for (const item of arcRaw.slice(0, 6)) {
        const beat = parseArcBeat(item);
        if (beat) next.push(beat);
      }
      arcBeats = next;
    }
    return {
      ...ch,
      kernsatz: kernsatz.length >= 8 ? kernsatz.slice(0, 400) : ch.kernsatz,
      inhaltKurz:
        inhaltKurz.length >= 20 ? inhaltKurz.slice(0, 2_400) : ch.inhaltKurz,
      props: plan.props.length ? plan.props : ch.props,
      events: plan.events.length ? plan.events : ch.events,
      openThreads: plan.openThreads.length ? plan.openThreads : ch.openThreads,
      mustNotRepeat: plan.mustNotRepeat.length
        ? plan.mustNotRepeat
        : ch.mustNotRepeat,
      introduces: plan.introduces.length ? plan.introduces : ch.introduces,
      resolves: plan.resolves.length ? plan.resolves : ch.resolves,
      arcBeats,
    };
  });

  return {
    ...input.structured,
    updatedAt: new Date().toISOString(),
    modelLabel: `${input.structured.modelLabel || "—"} · Sync`,
    chapters,
  };
}

/**
 * Full light sync after Manuskript craft apply (Szenenplot-JSON + Graph).
 * Also used after Szenenplot Verbessern so frozen contracts stay consistent.
 */
export async function syncAfterManuskriptCraftPatch(input: {
  structured: RomanSzenenplotStructured | null | undefined;
  graph: RomanWissensGraph | null | undefined;
  patchBrief: string;
  changedChapters: ChangedChapter[];
}): Promise<{
  structured: RomanSzenenplotStructured | null;
  graph: RomanWissensGraph | null;
  /** Soft warnings (sync/retract failures) for pipeline summary. */
  warnings: string[];
}> {
  let structured = input.structured ?? null;
  let graph = input.graph ?? null;
  const warnings: string[] = [];
  if (!input.changedChapters.length) {
    return { structured, graph, warnings };
  }

  const frozenAt = structured?.schreibPromptsFrozenAt ?? null;
  let forbidLabels: string[] = [];

  if (structured) {
    try {
      structured = await syncGeruestAfterManuskriptPatch({
        structured,
        patchBrief: input.patchBrief,
        changedChapters: input.changedChapters,
      });
      // Keep freeze stamp so Manuskript stays on slim frozen packets.
      if (frozenAt) {
        structured = { ...structured, schreibPromptsFrozenAt: frozenAt };
      }
    } catch {
      warnings.push("Structured-Sync fehlgeschlagen — vorheriges JSON behalten");
    }
  }

  if (graph) {
    try {
      const retracted = await retractWissensGraphAfterPatch({
        graph,
        patchBrief: input.patchBrief,
        changedChapters: input.changedChapters,
      });
      graph = retracted.graph;
      forbidLabels = retracted.forbidLabels;
    } catch {
      warnings.push("Graph-Retract fehlgeschlagen — Grow-Stand behalten");
    }
  }

  if (structured && forbidLabels.length) {
    structured = scrubGeruestForbiddenMotifs(structured, forbidLabels);
    if (frozenAt) {
      structured = { ...structured, schreibPromptsFrozenAt: frozenAt };
    }
  }

  return { structured, graph, warnings };
}

/**
 * After Kapitelgerüst Verbessern: keep Gerüst-JSON + retract graph.
 */
export async function syncAfterKapitelGeruestCraftPatch(input: {
  structured: RomanKapitelGeruestStructured | null | undefined;
  graph: RomanWissensGraph | null | undefined;
  patchBrief: string;
  changedChapters: ChangedChapter[];
}): Promise<{
  structured: RomanKapitelGeruestStructured | null;
  graph: RomanWissensGraph | null;
  warnings: string[];
}> {
  let structured = input.structured ?? null;
  let graph = input.graph ?? null;
  const warnings: string[] = [];
  if (!input.changedChapters.length) {
    return { structured, graph, warnings };
  }

  if (structured) {
    try {
      structured = await syncKapitelGeruestAfterPatch({
        structured,
        patchBrief: input.patchBrief,
        changedChapters: input.changedChapters,
      });
    } catch {
      warnings.push("Gerüst-JSON-Sync fehlgeschlagen — vorheriges JSON behalten");
    }
  }

  if (graph) {
    try {
      const retracted = await retractWissensGraphAfterPatch({
        graph,
        patchBrief: input.patchBrief,
        changedChapters: input.changedChapters,
      });
      graph = retracted.graph;
      // Scrub geruest chapters if we have forbid labels — map via szenenplot helper.
      if (structured && retracted.forbidLabels.length) {
        const prevGeruest = structured;
        const asPlot: RomanSzenenplotStructured = {
          updatedAt: prevGeruest.updatedAt,
          modelLabel: prevGeruest.modelLabel,
          centralArcs: prevGeruest.centralArcs,
          chapters: prevGeruest.chapters.map((ch) => ({
            ...ch,
            scenes: [],
          })),
        };
        const scrubbed = scrubGeruestForbiddenMotifs(
          asPlot,
          retracted.forbidLabels,
        );
        const byNum = new Map(
          prevGeruest.chapters.map((ch) => [ch.number, ch] as const),
        );
        structured = {
          ...prevGeruest,
          updatedAt: scrubbed.updatedAt,
          modelLabel: scrubbed.modelLabel,
          chapters: scrubbed.chapters.map((ch) => {
            const prev = byNum.get(ch.number)!;
            return {
              ...prev,
              kernsatz: ch.kernsatz,
              props: ch.props,
              events: ch.events,
              openThreads: ch.openThreads,
              mustNotRepeat: ch.mustNotRepeat,
              introduces: ch.introduces,
              resolves: ch.resolves,
              arcBeats: ch.arcBeats,
            };
          }),
        };
      }
    } catch {
      warnings.push("Graph-Retract fehlgeschlagen — Grow-Stand behalten");
    }
  }

  return { structured, graph, warnings };
}
