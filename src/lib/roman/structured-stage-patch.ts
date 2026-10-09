/**
 * Structured-first Verbessern for Kapitelgerüst + Szenenplot.
 * Patches JSON fields (arcs, lifecycle, scenes) then remirrors markdown —
 * no freeform chapter-body weave that drifts from structured.
 */

import {
  salvageSzenenplotPatchJson,
  tryParseModelJsonObject,
} from "@/lib/ai/parse-model-json";
import { generateText } from "@/lib/ai/provider";
import { parseModelJsonObjectWithRepair } from "@/lib/ai/repair-model-json";
import { resolveRomanAssistModel } from "@/lib/roman/assist-model";
import {
  parseArcBeat,
  parseCentralArcs,
  parseChapterPlan,
  parseRomanKapitelGeruestStructured,
  parseRomanSzenenplotStructured,
  structuredKapitelGeruestToMarkdown,
  structuredSzenenplotToMarkdown,
  type RomanKapitelGeruestChapter,
  type RomanKapitelGeruestStructured,
  type RomanSzenenplotCentralArc,
  type RomanSzenenplotChapterNode,
  type RomanSzenenplotScene,
  type RomanSzenenplotStructured,
} from "@/lib/roman/szenenplot-structured";

const CLIP_BRIEF = 3_500;
/** Per-chapter Ist-JSON budget — never clip a single chapter mid-object. */
const CLIP_ONE_CHAPTER_JSON = 24_000;

/**
 * Resolve chapter numbers to patch.
 * Empty `requested` = all chapters. Non-empty with no overlap = empty (caller throws).
 * Never expands a miss into “patch everything”.
 */
function chapterNums(
  requested: number[] | undefined,
  available: number[],
): number[] {
  const all = available.filter((n) => n > 0).sort((a, b) => a - b);
  if (!requested?.length) return all;
  const set = new Set(all);
  return [...new Set(requested)]
    .filter((n) => set.has(n))
    .sort((a, b) => a - b);
}

function clipJson(value: unknown, max: number): string {
  const raw = JSON.stringify(value, null, 2);
  return raw.length <= max ? raw : `${raw.slice(0, max)}\n…`;
}

/** Canonical scene_id: SZ_01, SZ_43, … */
function normalizeSceneId(raw: string): string {
  const m = String(raw ?? "")
    .trim()
    .match(/^SZ[_-]?(\d{1,3})$/i);
  if (!m) return String(raw ?? "").trim().slice(0, 32);
  return `SZ_${String(Number(m[1])).padStart(2, "0")}`;
}

/** scene_id tokens from patch brief / kritik (SZ_01, SZ-12, …). */
function extractSceneIdsFromText(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/\bSZ[_-]?(\d{1,3})\b/gi)) {
    const id = normalizeSceneId(m[0]!);
    if (!out.includes(id)) out.push(id);
  }
  return out.slice(0, 12);
}

/**
 * When structured parse drops a patched scene (strict dramaturgy), keep the
 * baseline and overlay whatever usable fields the model returned.
 */
function overlaySceneFromModelRaw(
  baseline: RomanSzenenplotScene,
  raw: unknown,
  forcedId: string,
): RomanSzenenplotScene {
  if (!raw || typeof raw !== "object") return baseline;
  const s = raw as Record<string, unknown>;
  const heading = String(s.heading ?? s.title ?? "")
    .trim()
    .slice(0, 160);
  const summary = String(s.summary ?? s.zusammenfassung ?? "")
    .trim()
    .slice(0, 600);
  const d =
    s.dramaturgy && typeof s.dramaturgy === "object"
      ? (s.dramaturgy as Record<string, unknown>)
      : s;
  const goal = String(
    d.scene_goal ?? d.sceneGoal ?? d.ziel ?? "",
  )
    .trim()
    .slice(0, 280);
  const obstacle = String(
    d.obstacle_conflict ?? d.obstacleConflict ?? d.hindernis ?? "",
  )
    .trim()
    .slice(0, 280);
  const turn = String(
    d.turning_point ?? d.turningPoint ?? d.wendepunkt ?? "",
  )
    .trim()
    .slice(0, 280);
  const value = String(
    d.outcome_value_change ?? d.outcomeValueChange ?? d.wertänderung ?? "",
  )
    .trim()
    .slice(0, 280);
  return {
    ...baseline,
    scene_id: forcedId,
    heading: heading.length >= 3 ? heading : baseline.heading,
    summary: summary.length >= 8 ? summary : baseline.summary,
    dramaturgy: {
      scene_goal: goal.length >= 4 ? goal : baseline.dramaturgy.scene_goal,
      obstacle_conflict:
        obstacle.length >= 4
          ? obstacle
          : baseline.dramaturgy.obstacle_conflict,
      turning_point:
        turn.length >= 4 ? turn : baseline.dramaturgy.turning_point,
      outcome_value_change:
        value.length >= 4
          ? value
          : baseline.dramaturgy.outcome_value_change,
    },
  };
}

/** True when the brief explicitly authorizes emptying lists / striking items. */
export function briefAllowsEmptyWipe(brief: string): boolean {
  return /streich|l[öo]sch|entferne|raus\s+mit|weg\s+mit|leere?\s+liste|bewusst\s+leer|nicht\s+mehr|verbiete|streichen/i.test(
    brief ?? "",
  );
}

/**
 * Scene ids the brief wants removed (Geister-Szenen löschen / entfernen).
 * Handled locally — the model must not be asked to “return” a deleted scene.
 */
export function extractSceneIdsMarkedForDeletion(brief: string): string[] {
  const text = brief ?? "";
  if (!briefAllowsEmptyWipe(text)) return [];
  // Require delete language near scene tokens or a clear “Geister-/fremd”-delete framing.
  const deleteFramed =
    /geister[\s-]*szene|deplatziert|hineinkopiert|f[äa]lschlich|entferne|l[öo]sche|streich/i.test(
      text,
    );
  if (!deleteFramed) return [];
  return extractSceneIdsFromText(text);
}

function mergeStringList(
  prev: string[],
  next: string[] | undefined,
  allowEmpty: boolean,
): string[] {
  if (!Array.isArray(next)) return prev;
  if (next.length === 0) return allowEmpty ? [] : prev;
  return next;
}

/**
 * Weave centralArcs by id — keep prev arcs not returned; update overlapping ids.
 * Empty incoming keeps prev unless allowEmpty wipe.
 */
export function mergeCentralArcsById(
  prev: RomanSzenenplotCentralArc[],
  incoming: RomanSzenenplotCentralArc[],
  allowEmptyWipe: boolean,
): RomanSzenenplotCentralArc[] {
  if (incoming.length === 0) {
    return allowEmptyWipe ? [] : prev;
  }
  const byId = new Map(prev.map((a) => [a.id, a]));
  for (const a of incoming) {
    const old = byId.get(a.id);
    byId.set(a.id, old ? { ...old, ...a } : a);
  }
  const seen = new Set<string>();
  const out: RomanSzenenplotCentralArc[] = [];
  for (const a of incoming) {
    const row = byId.get(a.id);
    if (row && !seen.has(a.id)) {
      out.push(row);
      seen.add(a.id);
    }
  }
  for (const a of prev) {
    if (!seen.has(a.id)) out.push(a);
  }
  return out.slice(0, 6);
}

/**
 * Merge model chapter onto previous: update matching scene_id, keep missing
 * prev scenes (anti-wipe), append brand-new scene_ids from the model.
 */
function mergeSceneKeepPrompt(
  prev: RomanSzenenplotScene,
  next: RomanSzenenplotScene,
): RomanSzenenplotScene {
  const prompt = next.schreibPrompt?.trim();
  return {
    ...prev,
    ...next,
    schreibPrompt: prompt && prompt.length >= 8 ? prompt : prev.schreibPrompt,
  };
}

export function mergeSzenenplotChapterScenes(
  prev: RomanSzenenplotChapterNode,
  incoming: RomanSzenenplotChapterNode,
  allowEmptyWipe = false,
): RomanSzenenplotChapterNode {
  const prevById = new Map(prev.scenes.map((s) => [s.scene_id, s]));
  const nextById = new Map<string, RomanSzenenplotScene>();
  for (const s of incoming.scenes) {
    if (s.scene_id) nextById.set(s.scene_id, s);
  }

  const out: RomanSzenenplotScene[] = [];
  for (const s of prev.scenes) {
    const next = nextById.get(s.scene_id);
    out.push(next ? mergeSceneKeepPrompt(s, next) : s);
  }
  for (const s of incoming.scenes) {
    if (!prevById.has(s.scene_id)) out.push(s);
  }

  if (out.length < prev.scenes.length) {
    return prev;
  }

  const title = incoming.title?.trim();
  const kernsatz = incoming.kernsatz?.trim();
  return {
    ...prev,
    title: title && title.length >= 2 ? title.slice(0, 120) : prev.title,
    kernsatz:
      kernsatz && kernsatz.length >= 8 ? kernsatz.slice(0, 400) : prev.kernsatz,
    props: mergeStringList(prev.props, incoming.props, allowEmptyWipe),
    events: mergeStringList(prev.events, incoming.events, allowEmptyWipe),
    openThreads: mergeStringList(
      prev.openThreads,
      incoming.openThreads,
      allowEmptyWipe,
    ),
    mustNotRepeat: mergeStringList(
      prev.mustNotRepeat,
      incoming.mustNotRepeat,
      allowEmptyWipe,
    ),
    introduces: mergeStringList(
      prev.introduces,
      incoming.introduces,
      allowEmptyWipe,
    ),
    resolves: mergeStringList(prev.resolves, incoming.resolves, allowEmptyWipe),
    arcBeats:
      incoming.arcBeats?.length || allowEmptyWipe
        ? incoming.arcBeats ?? (allowEmptyWipe ? [] : prev.arcBeats)
        : prev.arcBeats,
    scenes: out,
  };
}

function resolveNextArcs(
  prev: RomanSzenenplotCentralArc[],
  obj: Record<string, unknown>,
  allowEmptyWipe: boolean,
): RomanSzenenplotCentralArc[] {
  if (obj.centralArcs === undefined && obj.central_arcs === undefined) {
    return prev;
  }
  const parsed = parseCentralArcs(obj.centralArcs ?? obj.central_arcs);
  return mergeCentralArcsById(prev, parsed, allowEmptyWipe);
}

/**
 * Apply Verbessern / Dimension patch onto Kapitelgerüst JSON.
 * One chapter per model call (no clipped multi-chapter Ist-JSON).
 */
export async function patchKapitelGeruestStructured(input: {
  structured: RomanKapitelGeruestStructured;
  chapterNumbers?: number[];
  patchBrief: string;
  critiqueText?: string;
}): Promise<{
  structured: RomanKapitelGeruestStructured;
  markdown: string;
  changedChapters: number[];
}> {
  const requested = input.chapterNumbers;
  const targets = chapterNums(
    requested,
    input.structured.chapters.map((c) => c.number),
  );
  if (!targets.length) {
    throw new Error(
      requested?.length
        ? `Kapitelgerüst: angeforderte Kapitel (${requested.join(", ")}) nicht gefunden.`
        : "Kapitelgerüst: keine Kapitel zum Patchen.",
    );
  }

  // Cap: patch one chapter at a time so Ist-JSON is never clipped mid-chapter.
  if (targets.length > 1) {
    let live = input.structured;
    const changed: number[] = [];
    for (const n of targets) {
      const one = await patchKapitelGeruestStructured({
        ...input,
        structured: live,
        chapterNumbers: [n],
      });
      live = one.structured;
      changed.push(...one.changedChapters);
    }
    return {
      structured: live,
      markdown: structuredKapitelGeruestToMarkdown(live),
      changedChapters: [...new Set(changed)].sort((a, b) => a - b),
    };
  }

  const n = targets[0]!;
  const focusChapter = input.structured.chapters.find((c) => c.number === n);
  if (!focusChapter) {
    throw new Error(`Kapitelgerüst: Kapitel ${n} fehlt.`);
  }

  const allowEmptyWipe = briefAllowsEmptyWipe(input.patchBrief);
  const model = await resolveRomanAssistModel();
  const geruestSchemaHint = `{
  "chapters": [{ "number": ${n}, "title": "…", "kernsatz": "…", "inhaltKurz": "…", "props": [], "events": [], "openThreads": [], "mustNotRepeat": [], "introduces": [], "resolves": [], "arcBeats": [] }]
}
Optional nur bei Arc-Änderung: "centralArcs": [...]. Sonst centralArcs WEGLASSEN.`;

  const raw = await generateText({
    model,
    systemInstruction: `Du bist Entwicklungslektor:in und patchst das Kapitelgerüst als STRUCTURED JSON.
Nur das genannte Kapitel anpassen. centralArcs nur mitschicken, wenn der Brief Arcs ändert — sonst weglassen (spart Tokens, verhindert Abschneiden).
Felder je Kapitel: number, title, kernsatz, inhaltKurz, props, events, openThreads, mustNotRepeat, introduces, resolves, arcBeats[{arcId,tension,mustShow,delta}].
Keine Einzelszenen. Keine Markdown-Fences.
Arrays nur leeren, wenn der Patch-Brief explizit streicht — sonst bestehende Listen behalten.
Antwort NUR als JSON:
{"chapters":[{...vollständiges Kapitel-Objekt}]}`,
    userText: `# Patch-Brief (verbindlich)
${input.patchBrief.trim().slice(0, CLIP_BRIEF) || "(leer)"}

# Kritik (Kontext)
${(input.critiqueText ?? "").trim().slice(0, 2_000) || "(keine)"}

# centralArcs (Ist — nur bei Arc-Fix zurückgeben)
${clipJson(input.structured.centralArcs, 4_000)}

# Kapitel zum Patchen (Ist-JSON, vollständig)
${clipJson([focusChapter], CLIP_ONE_CHAPTER_JSON)}

Auftrag: Liefere das verbesserte Kapitel-Objekt (Nummer ${n}). Ohne Arc-Änderung: kein centralArcs-Key.`,
    preferJson: true,
    maxTokens: 8_000,
    timeoutMs: 180_000,
    reasoningEffort: "none",
  });

  const obj = await parseModelJsonObjectWithRepair({
    raw,
    model,
    schemaHint: geruestSchemaHint,
    errorLabel: "Kapitelgerüst-Patch",
    maxTokens: 8_000,
    timeoutMs: 120_000,
  });
  const nextArcs = resolveNextArcs(
    input.structured.centralArcs,
    obj,
    allowEmptyWipe,
  );

  const list = Array.isArray(obj.chapters) ? obj.chapters : [];
  let patched: RomanKapitelGeruestChapter | null = null;
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const num = Math.round(Number(row.number ?? row.kapitel));
    if (!Number.isFinite(num) || num !== n) continue;
    const prev = focusChapter;
    const plan = parseChapterPlan({ ...prev, ...row });
    const kernsatz = String(row.kernsatz ?? "").trim();
    const inhaltKurz = String(
      row.inhaltKurz ?? row.inhalt_kurz ?? "",
    ).trim();
    const title = String(row.title ?? row.titel ?? "").trim();
    const arcRaw = row.arcBeats ?? row.arc_beats;
    let arcBeats = plan.arcBeats;
    if (Array.isArray(arcRaw)) {
      if (arcRaw.length === 0 && !allowEmptyWipe) {
        arcBeats = prev.arcBeats;
      } else {
        const next = [];
        for (const beat of arcRaw.slice(0, 6)) {
          const parsed = parseArcBeat(beat);
          if (parsed) next.push(parsed);
        }
        arcBeats = next;
      }
    }
    patched = {
      ...prev,
      title: title.slice(0, 120) || prev.title,
      kernsatz: kernsatz.length >= 8 ? kernsatz.slice(0, 400) : prev.kernsatz,
      inhaltKurz:
        inhaltKurz.length >= 12 ? inhaltKurz.slice(0, 2_400) : prev.inhaltKurz,
      props: Array.isArray(row.props)
        ? mergeStringList(prev.props, plan.props, allowEmptyWipe)
        : prev.props,
      events: Array.isArray(row.events)
        ? mergeStringList(prev.events, plan.events, allowEmptyWipe)
        : prev.events,
      openThreads: Array.isArray(row.openThreads ?? row.open_threads)
        ? mergeStringList(prev.openThreads, plan.openThreads, allowEmptyWipe)
        : prev.openThreads,
      mustNotRepeat: Array.isArray(row.mustNotRepeat ?? row.must_not_repeat)
        ? mergeStringList(
            prev.mustNotRepeat,
            plan.mustNotRepeat,
            allowEmptyWipe,
          )
        : prev.mustNotRepeat,
      introduces: Array.isArray(row.introduces)
        ? mergeStringList(prev.introduces, plan.introduces, allowEmptyWipe)
        : prev.introduces,
      resolves: Array.isArray(row.resolves)
        ? mergeStringList(prev.resolves, plan.resolves, allowEmptyWipe)
        : prev.resolves,
      arcBeats,
    };
    break;
  }

  if (!patched) {
    throw new Error(
      "Kapitelgerüst-Patch: Modell lieferte keine gültigen Kapitel — bitte erneut.",
    );
  }

  const chapters = input.structured.chapters.map((ch) =>
    ch.number === n ? patched! : ch,
  );
  const structured: RomanKapitelGeruestStructured = {
    ...input.structured,
    updatedAt: new Date().toISOString(),
    modelLabel: `${input.structured.modelLabel || "—"} · Verbessern`,
    centralArcs: nextArcs,
    chapters,
  };
  const checked =
    parseRomanKapitelGeruestStructured(structured, {
      modelLabel: structured.modelLabel,
      minChapters: Math.min(2, structured.chapters.length),
    }) ?? structured;

  return {
    structured: checked,
    markdown: structuredKapitelGeruestToMarkdown(checked),
    changedChapters: [n],
  };
}

/**
 * Apply Verbessern / Dimension patch onto Szenenplot JSON (scenes + contracts).
 * Scene merge is by scene_id — sibling scenes are never wiped by a partial rewrite,
 * except when the brief explicitly marks scene_ids for deletion (handled locally).
 */
export async function patchSzenenplotStructured(input: {
  structured: RomanSzenenplotStructured;
  chapterNumbers?: number[];
  patchBrief: string;
  critiqueText?: string;
}): Promise<{
  structured: RomanSzenenplotStructured;
  markdown: string;
  changedChapters: number[];
}> {
  const requested = input.chapterNumbers;
  const targets = chapterNums(
    requested,
    input.structured.chapters.map((c) => c.number),
  );
  if (!targets.length) {
    throw new Error(
      requested?.length
        ? `Szenenplot: angeforderte Kapitel (${requested.join(", ")}) nicht gefunden.`
        : "Szenenplot: keine Kapitel zum Patchen.",
    );
  }

  const deleteIds = new Set(
    extractSceneIdsMarkedForDeletion(
      `${input.patchBrief}\n${input.critiqueText ?? ""}`,
    ).map(normalizeSceneId),
  );

  // Local Geister-Szenen wipe across all target chapters (no LLM).
  let structuredAfterDeletes = input.structured;
  const deletedIn: number[] = [];
  if (deleteIds.size > 0) {
    const nextChapters = structuredAfterDeletes.chapters.map((ch) => {
      if (!targets.includes(ch.number)) return ch;
      const nextScenes = ch.scenes.filter(
        (s) => !deleteIds.has(normalizeSceneId(s.scene_id)),
      );
      if (nextScenes.length === ch.scenes.length) return ch;
      // Keep at least one scene so the chapter stays a valid plot node.
      if (nextScenes.length < 1) return ch;
      deletedIn.push(ch.number);
      return { ...ch, scenes: nextScenes };
    });
    if (deletedIn.length) {
      structuredAfterDeletes = {
        ...structuredAfterDeletes,
        updatedAt: new Date().toISOString(),
        modelLabel: `${structuredAfterDeletes.modelLabel || "—"} · Verbessern`,
        chapters: nextChapters,
      };
    }
  }

  if (targets.length > 1) {
    let live = structuredAfterDeletes;
    const changed = [...deletedIn];
    for (const num of targets) {
      const one = await patchSzenenplotStructured({
        ...input,
        structured: live,
        chapterNumbers: [num],
        // Prevent re-applying the same deletes in the recursive single-chapter call
        // (already applied). Pass a brief copy without delete framing? Safer:
        // recursive call sees delete ids already gone → no-op deletes.
      });
      live = one.structured;
      changed.push(...one.changedChapters);
    }
    return {
      structured: live,
      markdown: structuredSzenenplotToMarkdown(live),
      changedChapters: [...new Set(changed)].sort((a, b) => a - b),
    };
  }

  const n = targets[0]!;
  const focusChapter = structuredAfterDeletes.chapters.find(
    (c) => c.number === n,
  );
  if (!focusChapter) {
    throw new Error(`Szenenplot: Kapitel ${n} fehlt.`);
  }

  const allowEmptyWipe = briefAllowsEmptyWipe(input.patchBrief);
  const frozenAt = structuredAfterDeletes.schreibPromptsFrozenAt ?? null;
  const model = await resolveRomanAssistModel();
  const fromBrief = extractSceneIdsFromText(
    `${input.patchBrief}\n${input.critiqueText ?? ""}`,
  );
  const chapterIds = new Set(
    focusChapter.scenes.map((s) => normalizeSceneId(s.scene_id)),
  );
  // Never ask the model to rewrite scenes marked for deletion.
  const sceneIds =
    fromBrief.length > 0
      ? fromBrief.filter(
          (id) =>
            chapterIds.has(normalizeSceneId(id)) &&
            !deleteIds.has(normalizeSceneId(id)),
        )
      : [];
  const ids = sceneIds;

  if (!ids.length) {
    // Pure delete (or scenes only live in other chapters) — already applied above.
    if (deletedIn.includes(n) || deleteIds.size > 0) {
      return {
        structured: structuredAfterDeletes,
        markdown: structuredSzenenplotToMarkdown(structuredAfterDeletes),
        changedChapters: deletedIn.includes(n) ? [n] : [],
      };
    }
    return {
      structured: structuredAfterDeletes,
      markdown: structuredSzenenplotToMarkdown(structuredAfterDeletes),
      changedChapters: [],
    };
  }

  // One scene per model call — multi-scene JSON was truncated by Gemini thinking.
  let liveChapter = focusChapter;
  let nextArcs = structuredAfterDeletes.centralArcs;
  for (const sceneId of ids) {
    const one = await patchOneSzenenplotScene({
      chapterNumber: n,
      sceneId,
      chapter: liveChapter,
      centralArcs: nextArcs,
      patchBrief: input.patchBrief,
      critiqueText: input.critiqueText,
      allowEmptyWipe,
      model,
    });
    liveChapter = one.chapter;
    nextArcs = one.centralArcs;
  }

  const structured: RomanSzenenplotStructured = {
    ...structuredAfterDeletes,
    updatedAt: new Date().toISOString(),
    modelLabel: `${structuredAfterDeletes.modelLabel || "—"} · Verbessern`,
    centralArcs: nextArcs,
    chapters: structuredAfterDeletes.chapters.map((ch) =>
      ch.number === n ? liveChapter : ch,
    ),
    schreibPromptsFrozenAt: frozenAt,
  };

  return {
    structured,
    markdown: structuredSzenenplotToMarkdown(structured),
    changedChapters: [...new Set([n, ...deletedIn])].sort((a, b) => a - b),
  };
}

async function patchOneSzenenplotScene(input: {
  chapterNumber: number;
  sceneId: string;
  chapter: RomanSzenenplotChapterNode;
  centralArcs: RomanSzenenplotCentralArc[];
  patchBrief: string;
  critiqueText?: string;
  allowEmptyWipe: boolean;
  model: Awaited<ReturnType<typeof resolveRomanAssistModel>>;
}): Promise<{
  chapter: RomanSzenenplotChapterNode;
  centralArcs: RomanSzenenplotCentralArc[];
}> {
  const n = input.chapterNumber;
  const wantId = normalizeSceneId(input.sceneId);
  const scene = input.chapter.scenes.find(
    (s) => normalizeSceneId(s.scene_id) === wantId,
  );
  if (!scene) {
    return { chapter: input.chapter, centralArcs: input.centralArcs };
  }

  const slimScene = {
    ...scene,
    summary: scene.summary.slice(0, 180),
    schreibPrompt: scene.schreibPrompt.trim()
      ? "«schreibPrompt beibehalten»"
      : "",
  };

  const plotSchemaHint = `{
  "chapters": [{
    "number": ${n},
    "scenes": [{
      "scene_id": "${input.sceneId}",
      "heading": "kurz",
      "summary": "max 2 Sätze",
      "characters_present": [],
      "dramaturgy": {
        "scene_goal": "…",
        "obstacle_conflict": "…",
        "turning_point": "…",
        "outcome_value_change": "…"
      },
      "information_flow": {},
      "continuity": {}
    }]
  }]
}`;

  const raw = await generateText({
    model: input.model,
    systemInstruction: `Du bist Entwicklungslektor:in. Patch EINE Szene als kompaktes JSON.
NUR scene_id ${input.sceneId} in Kapitel ${n}. Kein centralArcs, kein schreibPrompt.
Felder KURZ: heading ≤80 Zeichen, summary ≤240 Zeichen, dramaturgy-Felder je ≤120 Zeichen.
Antwort NUR: {"chapters":[{"number":${n},"scenes":[{...genau diese eine Szene}]}]}`,
    userText: `# Patch-Brief (verbindlich — Fokus ${input.sceneId})
${input.patchBrief.trim().slice(0, CLIP_BRIEF) || "(leer)"}

# Kritik
${(input.critiqueText ?? "").trim().slice(0, 1_200) || "(keine)"}

# Ist-Szene
${clipJson(slimScene, 6_000)}

Nur ${input.sceneId} zurückgeben. JSON vollständig schließen.`,
    preferJson: true,
    maxTokens: 4_000,
    timeoutMs: 120_000,
    reasoningEffort: "none",
  });

  let obj =
    tryParseModelJsonObject(raw) ??
    salvageSzenenplotPatchJson(raw, n) ??
    null;
  if (!obj) {
    try {
      obj = await parseModelJsonObjectWithRepair({
        raw,
        model: input.model,
        schemaHint: plotSchemaHint,
        errorLabel: "Szenenplot-Patch",
        maxTokens: 4_000,
        timeoutMs: 90_000,
      });
    } catch {
      obj = salvageSzenenplotPatchJson(raw, n);
    }
  }
  if (!obj) {
    const preview = raw.trim().slice(0, 160).replace(/\s+/g, " ");
    throw new Error(
      `Szenenplot-Patch lieferte kein gültiges JSON (${input.sceneId}).${
        preview ? ` Anfang: ${preview}…` : ""
      }`,
    );
  }

  const nextArcs = resolveNextArcs(
    input.centralArcs,
    obj,
    input.allowEmptyWipe,
  );

  const pad =
    input.chapter.scenes.find(
      (s) => normalizeSceneId(s.scene_id) !== wantId,
    ) ?? scene;
  const patchRow =
    (Array.isArray(obj.chapters) ? obj.chapters : []).find((row) => {
      if (!row || typeof row !== "object") return false;
      const num = Math.round(
        Number((row as Record<string, unknown>).number ?? 0),
      );
      return num === n;
    }) ?? (Array.isArray(obj.chapters) ? obj.chapters[0] : null);

  const scenesRaw =
    patchRow && typeof patchRow === "object"
      ? (patchRow as Record<string, unknown>).scenes
      : null;
  const rawScenes = Array.isArray(scenesRaw) ? scenesRaw : [];

  // Prefer the requested id; if the model returned exactly one scene, accept it.
  const rawMatch =
    rawScenes.find((row) => {
      if (!row || typeof row !== "object") return false;
      const id = normalizeSceneId(
        String((row as Record<string, unknown>).scene_id ?? ""),
      );
      return id === wantId;
    }) ?? (rawScenes.length === 1 ? rawScenes[0] : null);

  const mergedEnvelope = {
    updatedAt: new Date().toISOString(),
    modelLabel: "patch",
    centralArcs: nextArcs,
    chapters: [
      {
        number: n,
        title: input.chapter.title,
        kernsatz: input.chapter.kernsatz,
        props: input.chapter.props,
        events: input.chapter.events,
        openThreads: input.chapter.openThreads,
        mustNotRepeat: input.chapter.mustNotRepeat,
        introduces: input.chapter.introduces,
        resolves: input.chapter.resolves,
        arcBeats: input.chapter.arcBeats,
        scenes: rawMatch
          ? [{ ...(rawMatch as object), scene_id: wantId }]
          : rawScenes,
      },
      {
        number: n === 1 ? 2 : 1,
        title: "pad",
        kernsatz: "Pad-Kapitel für Parser",
        props: [],
        events: [],
        openThreads: [],
        mustNotRepeat: [],
        introduces: [],
        resolves: [],
        arcBeats: [],
        scenes: [pad],
      },
    ],
    schreibPromptsFrozenAt: null,
  };

  const parsed = parseRomanSzenenplotStructured(mergedEnvelope, {
    modelLabel: "patch",
    minChapters: 1,
    minScenes: 1,
  });

  let incoming = parsed?.chapters.find((c) => c.number === n) ?? null;
  if (!incoming?.scenes.length && rawMatch) {
    // Strict parser dropped the scene — overlay onto baseline instead of failing.
    incoming = {
      ...input.chapter,
      scenes: [overlaySceneFromModelRaw(scene, rawMatch, wantId)],
    };
  }
  if (!incoming?.scenes.length) {
    throw new Error(
      `Szenenplot-Patch: ${wantId} fehlte in der Antwort — bitte erneut.`,
    );
  }

  const merged = mergeSzenenplotChapterScenes(
    input.chapter,
    incoming,
    input.allowEmptyWipe,
  );
  return { chapter: merged, centralArcs: nextArcs };
}
