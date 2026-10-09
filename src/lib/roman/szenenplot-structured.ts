/**
 * Structured Kapitelgerüst + Szenenplot.
 * Gerüst (Pass 1): chapters + arcs + lifecycle — no scene actions.
 * Szenenplot (Pass 2): scenes with dramaturgy / info flow / continuity +
 * `schreibPrompt` (frozen prose contract for Manuskript).
 * Persisted on `editorial.kapitelGeruestStructured` / `szenenplotStructured`;
 * markdown mirrors in `kapitelGeruestRaw` / `manuskriptRaw`.
 */

import { parseModelJsonObject } from "@/lib/ai/parse-model-json";
import {
  formatChapterBlock,
  type PlotChapter,
} from "@/lib/roman/plot-chapters";

export type RomanSzenenplotDramaturgy = {
  scene_goal: string;
  obstacle_conflict: string;
  turning_point: string;
  outcome_value_change: string;
};

export type RomanSzenenplotInformationFlow = {
  revealed_to_audience: string;
  revealed_to_characters: string;
  kept_secret: string;
};

export type RomanSzenenplotContinuity = {
  /**
   * After-scene state per character — must include Ort/Etage (and props on body
   * when relevant), e.g. `Tobias: Arbeitszimmer OG · barfuß`.
   */
  character_states_after: Record<string, string>;
  /**
   * Where key props sit after the scene (independent of who holds them),
   * e.g. `Schuhe: Garderobe EG`. Empty on legacy rows.
   */
  prop_placements_after: Record<string, string>;
  next_scene_hook: string;
};

export type RomanSzenenplotScene = {
  scene_id: string;
  heading: string;
  summary: string;
  characters_present: string[];
  dramaturgy: RomanSzenenplotDramaturgy;
  information_flow: RomanSzenenplotInformationFlow;
  continuity: RomanSzenenplotContinuity;
  /**
   * Frozen Co-Autor brief for Manuskript prose (Handlungsschritte, MUSS/DARF-NICHT,
   * Zielwortzahl-Pointer). Empty on legacy rows — callers build a fallback.
   */
  schreibPrompt: string;
};

/**
 * Book-wide relationship / conflict arc (Pass-1).
 * Setup → Peak → Payoff chapter numbers bind multi-chapter Spannung.
 */
export type RomanSzenenplotCentralArc = {
  id: string;
  label: string;
  /** Involved parties (e.g. Vater, Sohn). */
  parties: string[];
  setupChapter: number;
  peakChapter: number;
  payoffChapter: number;
  notes: string;
};

/** Per-chapter mandate for one central arc. */
export type RomanSzenenplotArcBeat = {
  arcId: string;
  /** Tension temperature 1 (cool) … 5 (peak heat). */
  tension: number;
  /** What must be visible in this chapter for the arc. */
  mustShow: string;
  /** How the relationship/conflict moves this chapter. */
  delta: string;
};

/**
 * Pass-1 / chapter-level plan: concrete props, events, and thread lifecycle.
 * Empty arrays are valid for legacy rows that only had title + kernsatz.
 */
export type RomanSzenenplotChapterPlan = {
  /** Objects/devices that matter in this chapter (named, reusable). */
  props: string[];
  /** Named plot events that occur here. */
  events: string[];
  /** Threads still open after this chapter. */
  openThreads: string[];
  /** Beats/props/events that must not be re-done later. */
  mustNotRepeat: string[];
  /** Labels first appearing here (exactly once across the book). */
  introduces: string[];
  /** Labels closed/resolved in this chapter. */
  resolves: string[];
  /** Spannungsbogen mandates for this chapter (refs centralArcs). */
  arcBeats: RomanSzenenplotArcBeat[];
};

export type RomanSzenenplotChapterNode = {
  number: number;
  title: string;
  kernsatz: string;
  props: string[];
  events: string[];
  openThreads: string[];
  mustNotRepeat: string[];
  introduces: string[];
  resolves: string[];
  arcBeats: RomanSzenenplotArcBeat[];
  scenes: RomanSzenenplotScene[];
};

/**
 * Pass-1 Kapitelgerüst chapter: content sketch + lifecycle, no scenes.
 * `inhaltKurz` is 1–3 short paragraphs; `kernsatz` is the one-line role.
 */
export type RomanKapitelGeruestChapter = {
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
  arcBeats: RomanSzenenplotArcBeat[];
};

export type RomanKapitelGeruestStructured = {
  updatedAt: string;
  modelLabel: string;
  centralArcs: RomanSzenenplotCentralArc[];
  chapters: RomanKapitelGeruestChapter[];
};

const EMPTY_CHAPTER_PLAN: RomanSzenenplotChapterPlan = {
  props: [],
  events: [],
  openThreads: [],
  mustNotRepeat: [],
  introduces: [],
  resolves: [],
  arcBeats: [],
};

function clampTension(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return 1;
  return Math.min(5, Math.max(1, Math.round(n)));
}

/** Tolerant parse of one arcBeat row. */
export function parseArcBeat(raw: unknown): RomanSzenenplotArcBeat | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const arcId = String(r.arcId ?? r.arc_id ?? r.id ?? "")
    .trim()
    .slice(0, 64);
  const mustShow = String(r.mustShow ?? r.must_show ?? r.sichtbar ?? "")
    .trim()
    .slice(0, 280);
  const delta = String(r.delta ?? r.bewegung ?? "")
    .trim()
    .slice(0, 280);
  if (!arcId || mustShow.length < 4) return null;
  return {
    arcId,
    tension: clampTension(r.tension ?? r.stufe ?? r.heat),
    mustShow,
    delta: delta || "—",
  };
}

/** Tolerant parse of book-level centralArcs. */
export function parseCentralArcs(raw: unknown): RomanSzenenplotCentralArc[] {
  if (!Array.isArray(raw)) return [];
  const out: RomanSzenenplotCentralArc[] = [];
  for (const item of raw.slice(0, 6)) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const id = String(r.id ?? r.key ?? "")
      .trim()
      .slice(0, 64);
    const label = String(r.label ?? r.name ?? r.titel ?? "")
      .trim()
      .slice(0, 160);
    if (!id || label.length < 3) continue;
    const setupChapter = Math.max(
      1,
      Math.round(Number(r.setupChapter ?? r.setup_chapter ?? r.setup) || 1),
    );
    const peakChapter = Math.max(
      1,
      Math.round(Number(r.peakChapter ?? r.peak_chapter ?? r.peak) || setupChapter),
    );
    const payoffChapter = Math.max(
      1,
      Math.round(
        Number(r.payoffChapter ?? r.payoff_chapter ?? r.payoff) || peakChapter,
      ),
    );
    out.push({
      id,
      label,
      parties: asStringList(r.parties ?? r.parteien ?? r.figuren, 6),
      setupChapter: Math.min(40, setupChapter),
      peakChapter: Math.min(40, peakChapter),
      payoffChapter: Math.min(40, payoffChapter),
      notes: String(r.notes ?? r.notiz ?? "")
        .trim()
        .slice(0, 400),
    });
  }
  return out;
}

/** Tolerant parse of chapter lifecycle arrays from model/legacy JSON. */
export function parseChapterPlan(raw: unknown): RomanSzenenplotChapterPlan {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ...EMPTY_CHAPTER_PLAN };
  }
  const c = raw as Record<string, unknown>;
  const arcRaw = c.arcBeats ?? c.arc_beats ?? c.arcs;
  const arcBeats: RomanSzenenplotArcBeat[] = [];
  if (Array.isArray(arcRaw)) {
    for (const item of arcRaw.slice(0, 6)) {
      const beat = parseArcBeat(item);
      if (beat) arcBeats.push(beat);
    }
  }
  return {
    props: asStringList(c.props ?? c.gegenstaende, 12),
    events: asStringList(c.events ?? c.ereignisse, 10),
    openThreads: asStringList(
      c.openThreads ?? c.open_threads ?? c.threads,
      8,
    ),
    mustNotRepeat: asStringList(
      c.mustNotRepeat ?? c.must_not_repeat ?? c.nichtWiederholen,
      8,
    ),
    introduces: asStringList(c.introduces ?? c.fuehrtEin, 10),
    resolves: asStringList(c.resolves ?? c.schliesst ?? c.loest, 10),
    arcBeats,
  };
}

/** Markdown / prompt block for chapter plan (empty → ""). */
export function formatChapterPlanBlock(
  plan: Partial<RomanSzenenplotChapterPlan> | null | undefined,
): string {
  if (!plan) return "";
  const lines: string[] = [
    "GESETZ: Props/Events/Einführen/Schließen genau hier — nicht früher, nicht später, nicht doppelt.",
  ];
  if (plan.props?.length) {
    lines.push(`MUSS — Props (sichtbar/referenziert): ${plan.props.join("; ")}`);
  }
  if (plan.events?.length) {
    lines.push(`MUSS — Events: ${plan.events.join("; ")}`);
  }
  if (plan.introduces?.length) {
    lines.push(`MUSS — Führt ein: ${plan.introduces.join("; ")}`);
  }
  if (plan.resolves?.length) {
    lines.push(`MUSS — Löst / schließt: ${plan.resolves.join("; ")}`);
  }
  if (plan.openThreads?.length) {
    lines.push(
      `MUSS offen lassen (nicht abschließen): ${plan.openThreads.join("; ")}`,
    );
  }
  if (plan.mustNotRepeat?.length) {
    lines.push(`DARF NICHT: ${plan.mustNotRepeat.join("; ")}`);
  }
  if (plan.arcBeats?.length) {
    lines.push(
      `MUSS — Arc-Beats: ${plan.arcBeats
        .map(
          (b) =>
            `${b.arcId} (T${b.tension}): ${b.mustShow}${b.delta && b.delta !== "—" ? ` → ${b.delta}` : ""}`,
        )
        .join(" | ")}`,
    );
  }
  return lines.length > 1 ? lines.join("\n") : "";
}

/** Book-level arc list for markdown / prompts. */
export function formatCentralArcsBlock(
  arcs: RomanSzenenplotCentralArc[] | null | undefined,
): string {
  if (!arcs?.length) return "";
  const lines = arcs.map((a) => {
    const parties = a.parties.length ? ` [${a.parties.join(", ")}]` : "";
    const notes = a.notes ? ` — ${a.notes}` : "";
    return `- ${a.id}: ${a.label}${parties} | Setup Kap.${a.setupChapter} · Peak Kap.${a.peakChapter} · Payoff Kap.${a.payoffChapter}${notes}`;
  });
  return `## Zentrale Spannungsbögen (verbindlich)\n${lines.join("\n")}`;
}

/**
 * Arc contracts for Manuskript: this chapter + next `lookahead` chapters.
 * Empty when no arcs / no beats — callers omit the packet section.
 */
export function formatArcContractsForChapter(
  structured: RomanSzenenplotStructured | null | undefined,
  chapterNumber: number,
  lookahead = 3,
): string {
  if (!structured?.centralArcs?.length) return "";
  const byId = new Map(structured.centralArcs.map((a) => [a.id, a]));
  const chapters = structured.chapters
    .filter(
      (c) =>
        c.number >= chapterNumber &&
        c.number <= chapterNumber + Math.max(0, lookahead),
    )
    .sort((a, b) => a.number - b.number);
  if (!chapters.length) return "";

  const lines: string[] = [
    "## Arc-Verträge (verbindlich — Spannung/Beziehung nicht erfinden)",
    "GESETZ: mustShow dieses Kapitels sichtbar machen; Peak/Payoff nur in den genannten Kapiteln — keine Vorwegnahme.",
  ];
  for (const arc of structured.centralArcs) {
    lines.push(
      `### ${arc.id} — ${arc.label}${
        arc.parties.length ? ` (${arc.parties.join(", ")})` : ""
      }`,
    );
    lines.push(
      `Setup Kap.${arc.setupChapter} · Peak Kap.${arc.peakChapter} · Payoff Kap.${arc.payoffChapter}${
        arc.notes ? ` · ${arc.notes}` : ""
      }`,
    );
  }
  for (const ch of chapters) {
    if (!ch.arcBeats.length) continue;
    const tag = ch.number === chapterNumber ? "DIESES Kapitel" : "folgt";
    lines.push(`### Kap. ${ch.number} — ${ch.title} (${tag})`);
    for (const beat of ch.arcBeats) {
      const arc = byId.get(beat.arcId);
      const label = arc?.label ?? beat.arcId;
      lines.push(
        `- ${beat.arcId} (${label}): Spannung T${beat.tension}/5 · MUSS sichtbar: ${beat.mustShow} · Delta: ${beat.delta}`,
      );
    }
  }
  return lines.length > 1 ? lines.join("\n").slice(0, 2_500) : "";
}

export type RomanSzenenplotStructured = {
  updatedAt: string;
  modelLabel: string;
  /** Book-wide Spannungsbögen (empty = legacy Gerüst). */
  centralArcs: RomanSzenenplotCentralArc[];
  chapters: RomanSzenenplotChapterNode[];
  /** When set, Manuskript must use frozen schreibPrompts (no re-plot). */
  schreibPromptsFrozenAt?: string | null;
  /** When set, Ort/Etage/Prop-Ablage continuity was enriched for Manuskript. */
  spatialContinuityEnrichedAt?: string | null;
};

function asStringList(raw: unknown, max: number): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((x) => String(x ?? "").trim())
    .filter((s) => s.length >= 1)
    .slice(0, max)
    .map((s) => s.slice(0, 120));
}

function asStringMap(raw: unknown, maxEntries: number): Record<string, string> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const key = String(k).trim().slice(0, 80);
    const val = String(v ?? "").trim().slice(0, 240);
    if (!key || !val) continue;
    out[key] = val;
    if (Object.keys(out).length >= maxEntries) break;
  }
  return out;
}

function parseDramaturgy(raw: unknown): RomanSzenenplotDramaturgy | null {
  if (!raw || typeof raw !== "object") return null;
  const d = raw as Record<string, unknown>;
  const scene_goal = String(d.scene_goal ?? d.sceneGoal ?? "").trim();
  const obstacle_conflict = String(
    d.obstacle_conflict ?? d.obstacleConflict ?? "",
  ).trim();
  const turning_point = String(
    d.turning_point ?? d.turningPoint ?? "",
  ).trim();
  const outcome_value_change = String(
    d.outcome_value_change ?? d.outcomeValueChange ?? "",
  ).trim();
  if (
    scene_goal.length < 4 ||
    obstacle_conflict.length < 4 ||
    turning_point.length < 4 ||
    outcome_value_change.length < 4
  ) {
    return null;
  }
  return {
    scene_goal: scene_goal.slice(0, 400),
    obstacle_conflict: obstacle_conflict.slice(0, 400),
    turning_point: turning_point.slice(0, 400),
    outcome_value_change: outcome_value_change.slice(0, 400),
  };
}

function parseInformationFlow(
  raw: unknown,
): RomanSzenenplotInformationFlow {
  const d =
    raw && typeof raw === "object"
      ? (raw as Record<string, unknown>)
      : {};
  return {
    revealed_to_audience: String(
      d.revealed_to_audience ?? d.revealedToAudience ?? "",
    )
      .trim()
      .slice(0, 400),
    revealed_to_characters: String(
      d.revealed_to_characters ?? d.revealedToCharacters ?? "",
    )
      .trim()
      .slice(0, 400),
    kept_secret: String(d.kept_secret ?? d.keptSecret ?? "")
      .trim()
      .slice(0, 400),
  };
}

function parseContinuity(raw: unknown): RomanSzenenplotContinuity {
  const d =
    raw && typeof raw === "object"
      ? (raw as Record<string, unknown>)
      : {};
  return {
    character_states_after: asStringMap(
      d.character_states_after ?? d.characterStatesAfter,
      12,
    ),
    prop_placements_after: asStringMap(
      d.prop_placements_after ??
        d.propPlacementsAfter ??
        d.prop_locations_after ??
        d.propLocationsAfter,
      12,
    ),
    next_scene_hook: String(
      d.next_scene_hook ?? d.nextSceneHook ?? "",
    )
      .trim()
      .slice(0, 400),
  };
}

function parseScene(raw: unknown, index: number): RomanSzenenplotScene | null {
  if (!raw || typeof raw !== "object") return null;
  const s = raw as Record<string, unknown>;
  // Models often flatten dramaturgy onto the scene root.
  const dramaturgy =
    parseDramaturgy(s.dramaturgy) ??
    parseDramaturgy({
      scene_goal: s.scene_goal ?? s.sceneGoal ?? s.ziel,
      obstacle_conflict:
        s.obstacle_conflict ?? s.obstacleConflict ?? s.hindernis,
      turning_point: s.turning_point ?? s.turningPoint ?? s.wendepunkt,
      outcome_value_change:
        s.outcome_value_change ?? s.outcomeValueChange ?? s.wertänderung,
    });
  const heading = String(s.heading ?? s.title ?? "").trim();
  const summary = String(s.summary ?? s.zusammenfassung ?? "").trim();
  if (heading.length < 3 || summary.length < 8) return null;
  // Grobplot may omit dramaturgy — fill empty stubs; Feinplot overwrites.
  const dramaturgyOrStub: RomanSzenenplotDramaturgy = dramaturgy ?? {
    scene_goal: "",
    obstacle_conflict: "",
    turning_point: "",
    outcome_value_change: "",
  };
  const scene_id = String(
    s.scene_id ?? s.sceneId ?? `SZ_${String(index + 1).padStart(2, "0")}`,
  )
    .trim()
    .slice(0, 32);
  const schreibPrompt = String(
    s.schreibPrompt ?? s.schreib_prompt ?? s.prosaBrief ?? s.prosa_brief ?? "",
  )
    .trim()
    .slice(0, 2_400);
  return {
    scene_id: scene_id || `SZ_${String(index + 1).padStart(2, "0")}`,
    heading: heading.slice(0, 160),
    summary: summary.slice(0, 600),
    characters_present: asStringList(
      s.characters_present ?? s.charactersPresent ?? s.figuren,
      12,
    ),
    dramaturgy: dramaturgyOrStub,
    information_flow: parseInformationFlow(
      s.information_flow ?? s.informationFlow,
    ),
    continuity: parseContinuity(s.continuity),
    schreibPrompt,
  };
}

/**
 * Canonical Manuskript scene contract: structured fields are always present.
 * Never return prose `schreibPrompt` alone — that dropped secrets/dramaturgy.
 * Binding law for Co-Autor: all MUSS beats on-page; secrets never paraphrased.
 */
export function formatCanonicalSceneContract(
  scene: Omit<RomanSzenenplotScene, "schreibPrompt"> & {
    schreibPrompt?: string;
  },
): string {
  const prompt = scene.schreibPrompt?.trim() ?? "";
  const structured = [
    `Szene ${scene.scene_id} — ${scene.heading}`,
    "GESETZ: Alle vier MUSS-Beats sichtbar in der Prosa; DARF-NICHT weder Dialog noch Narration andeuten; keine Extra-Handlung.",
    scene.summary?.trim() ? `Handlung (Kurz): ${scene.summary.trim()}` : "",
    `MUSS — Ziel: ${scene.dramaturgy.scene_goal}`,
    `MUSS — Hindernis: ${scene.dramaturgy.obstacle_conflict}`,
    `MUSS — Wendepunkt: ${scene.dramaturgy.turning_point}`,
    `MUSS — Wertänderung: ${scene.dramaturgy.outcome_value_change}`,
    scene.information_flow.revealed_to_audience
      ? `MUSS — Publikum erfährt: ${scene.information_flow.revealed_to_audience}`
      : "",
    scene.information_flow.revealed_to_characters
      ? `MUSS — Figuren erfahren: ${scene.information_flow.revealed_to_characters}`
      : "",
    scene.information_flow.kept_secret
      ? `DARF NICHT verraten (hart — keine Andeutung/Paraphrase): ${scene.information_flow.kept_secret}`
      : "DARF NICHT verraten: (keins — kein Geheimnis in dieser Szene)",
    (() => {
      const states = Object.entries(scene.continuity.character_states_after);
      if (!states.length) return "";
      return `MUSS — Zustand danach (Ort/Etage je Figur): ${states
        .map(([k, v]) => `${k}: ${v}`)
        .join("; ")}`;
    })(),
    (() => {
      const props = Object.entries(scene.continuity.prop_placements_after ?? {});
      if (!props.length) return "";
      return `MUSS — Props danach (Ablageort): ${props
        .map(([k, v]) => `${k}: ${v}`)
        .join("; ")}`;
    })(),
    scene.continuity.next_scene_hook
      ? `MUSS — Ende/Hook (nahtlos zum Nächsten; Bewegung muss zum Zustand danach passen): ${scene.continuity.next_scene_hook}`
      : "",
  ].filter(Boolean);

  if (prompt) {
    return [
      ...structured,
      "",
      "Co-Autor-Auftrag (nur Ausformulieren — Ton/Emotion/SHOW; Plot steht oben):",
      prompt,
    ].join("\n");
  }
  return [
    ...structured,
    "Nur ausformulieren — keine neuen Handlungsstränge, Props oder Enthüllungen erfinden.",
  ].join("\n");
}

/** @deprecated Prefer {@link formatCanonicalSceneContract} — kept as alias. */
export function buildSchreibPromptFallback(
  scene: Omit<RomanSzenenplotScene, "schreibPrompt"> & {
    schreibPrompt?: string;
  },
): string {
  return formatCanonicalSceneContract(scene).slice(0, 3_200);
}

/**
 * Intra-chapter spatial spine: where people/props are after each scene.
 * Empty when no continuity states — callers omit the packet section.
 */
export function formatSpatialSpineForChapter(
  ch: RomanSzenenplotChapterNode | null | undefined,
): string {
  if (!ch?.scenes?.length) return "";
  const blocks: string[] = [];
  for (const scene of ch.scenes) {
    const states = Object.entries(scene.continuity.character_states_after ?? {});
    const props = Object.entries(scene.continuity.prop_placements_after ?? {});
    if (!states.length && !props.length) continue;
    const lines = [`### Nach ${scene.scene_id} — ${scene.heading}`];
    if (states.length) {
      lines.push(
        `Figuren: ${states.map(([k, v]) => `${k}: ${v}`).join("; ")}`,
      );
    }
    if (props.length) {
      lines.push(`Props: ${props.map(([k, v]) => `${k}: ${v}`).join("; ")}`);
    }
    if (scene.continuity.next_scene_hook?.trim()) {
      lines.push(`Nächste Bewegung: ${scene.continuity.next_scene_hook.trim()}`);
    }
    blocks.push(lines.join("\n"));
  }
  if (!blocks.length) return "";
  return [
    "## Raum-/Prop-Spine (verbindlich — Etage & Ablage)",
    "GESETZ: hoch/runter nur, wenn der Endzustand der vorigen Szene das erlaubt. Props bleiben am Ablageort, bis ein MUSS sie bewegt. Keine Teleportation, keine zweite Garderobe oben.",
    ...blocks,
  ].join("\n");
}

/** Ensure every scene has a non-empty schreibPrompt (fallback if needed). */
export function ensureSchreibPrompts(
  structured: RomanSzenenplotStructured,
): RomanSzenenplotStructured {
  return {
    ...structured,
    chapters: structured.chapters.map((ch) => ({
      ...ch,
      scenes: ch.scenes.map((s) => ({
        ...s,
        schreibPrompt: buildSchreibPromptFallback(s),
      })),
    })),
  };
}

/**
 * Tolerant parse of structured szenenplot JSON (chapters[] or flat scenes[]).
 */
export function parseRomanSzenenplotStructured(
  raw: unknown,
  meta?: {
    modelLabel?: string;
    /** Default 2 — use 1 for single-chapter batch fills. */
    minChapters?: number;
    /** Default 2 total scenes across all chapters; use 1 for one chapter. */
    minScenes?: number;
  },
): RomanSzenenplotStructured | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const minChapters = meta?.minChapters ?? 2;
  const minScenes = meta?.minScenes ?? 2;

  const chapters: RomanSzenenplotChapterNode[] = [];
  const chaptersRaw = Array.isArray(row.chapters) ? row.chapters : null;

  if (chaptersRaw) {
    for (const item of chaptersRaw.slice(0, 24)) {
      if (!item || typeof item !== "object") continue;
      const c = item as Record<string, unknown>;
      const number = Number(c.number ?? c.kapitel ?? c.n);
      if (!Number.isFinite(number) || number < 1) continue;
      const title = String(c.title ?? c.titel ?? "").trim().slice(0, 120);
      const kernsatz = String(c.kernsatz ?? c.summary ?? c.role ?? "")
        .trim()
        .slice(0, 400);
      const scenesRaw = Array.isArray(c.scenes) ? c.scenes : [];
      const scenes: RomanSzenenplotScene[] = [];
      for (let i = 0; i < scenesRaw.length && scenes.length < 16; i += 1) {
        const scene = parseScene(scenesRaw[i], scenes.length);
        if (scene) scenes.push(scene);
      }
      if (scenes.length < 1 && kernsatz.length < 12) continue;
      const plan = parseChapterPlan(c);
      chapters.push({
        number: Math.min(40, Math.round(number)),
        title: title || `Kapitel ${Math.round(number)}`,
        kernsatz:
          kernsatz ||
          scenes[0]?.summary.slice(0, 200) ||
          "Kapitel-Funktion klären.",
        ...plan,
        scenes,
      });
    }
  } else if (Array.isArray(row.scenes)) {
    // Flat scenes[] — group by chapter_number if present, else one chapter.
    const byChapter = new Map<number, RomanSzenenplotScene[]>();
    const scenesRaw = row.scenes;
    for (let i = 0; i < scenesRaw.length && i < 120; i += 1) {
      const item = scenesRaw[i];
      if (!item || typeof item !== "object") continue;
      const scene = parseScene(item, i);
      if (!scene) continue;
      const ch = Number(
        (item as Record<string, unknown>).chapter_number ??
          (item as Record<string, unknown>).chapterNumber ??
          (item as Record<string, unknown>).kapitel ??
          1,
      );
      const kap = Number.isFinite(ch) && ch >= 1 ? Math.round(ch) : 1;
      const list = byChapter.get(kap) ?? [];
      list.push(scene);
      byChapter.set(kap, list);
    }
    for (const [number, scenes] of [...byChapter.entries()].sort(
      (a, b) => a[0] - b[0],
    )) {
      chapters.push({
        number,
        title: `Kapitel ${number}`,
        kernsatz: scenes[0]?.summary.slice(0, 200) || "Kapitel-Funktion.",
        ...EMPTY_CHAPTER_PLAN,
        scenes,
      });
    }
  }

  chapters.sort((a, b) => a.number - b.number);
  if (chapters.length < minChapters) return null;
  const sceneCount = chapters.reduce((n, c) => n + c.scenes.length, 0);
  if (sceneCount < minScenes) return null;

  const frozen = String(row.schreibPromptsFrozenAt ?? "").trim();
  const spatialEnriched = String(
    row.spatialContinuityEnrichedAt ?? row.spatial_continuity_enriched_at ?? "",
  ).trim();
  return {
    updatedAt:
      String(row.updatedAt ?? "").trim() || new Date().toISOString(),
    modelLabel:
      String(row.modelLabel ?? meta?.modelLabel ?? "")
        .trim()
        .slice(0, 120) || "—",
    centralArcs: parseCentralArcs(
      row.centralArcs ?? row.central_arcs ?? row.arcs,
    ),
    chapters,
    schreibPromptsFrozenAt: frozen || null,
    spatialContinuityEnrichedAt: spatialEnriched || null,
  };
}

/**
 * Tolerant parse of Pass-1 Kapitelgerüst (chapters without requiring scenes).
 */
export function parseRomanKapitelGeruestStructured(
  raw: unknown,
  meta?: { modelLabel?: string; minChapters?: number },
): RomanKapitelGeruestStructured | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const minChapters = meta?.minChapters ?? 2;
  const chaptersRaw = Array.isArray(row.chapters) ? row.chapters : null;
  if (!chaptersRaw) return null;

  const chapters: RomanKapitelGeruestChapter[] = [];
  for (const item of chaptersRaw.slice(0, 24)) {
    if (!item || typeof item !== "object") continue;
    const c = item as Record<string, unknown>;
    const number = Number(c.number ?? c.kapitel ?? c.n);
    if (!Number.isFinite(number) || number < 1) continue;
    const title = String(c.title ?? c.titel ?? "").trim().slice(0, 120);
    const kernsatz = String(c.kernsatz ?? c.summary ?? c.role ?? "")
      .trim()
      .slice(0, 400);
    const inhaltKurz = String(
      c.inhaltKurz ?? c.inhalt_kurz ?? c.body ?? c.beschreibung ?? kernsatz,
    )
      .trim()
      .slice(0, 1_600);
    if (kernsatz.length < 8 && inhaltKurz.length < 12 && title.length < 2) {
      continue;
    }
    const plan = parseChapterPlan(c);
    chapters.push({
      number: Math.min(40, Math.round(number)),
      title: title || `Kapitel ${Math.round(number)}`,
      kernsatz: kernsatz || inhaltKurz.slice(0, 200) || "Kapitel-Funktion klären.",
      inhaltKurz:
        inhaltKurz || kernsatz || "Kapitel-Inhalt skizzieren.",
      ...plan,
    });
  }
  chapters.sort((a, b) => a.number - b.number);
  if (chapters.length < minChapters) return null;

  return {
    updatedAt:
      String(row.updatedAt ?? "").trim() || new Date().toISOString(),
    modelLabel:
      String(row.modelLabel ?? meta?.modelLabel ?? "")
        .trim()
        .slice(0, 120) || "—",
    centralArcs: parseCentralArcs(
      row.centralArcs ?? row.central_arcs ?? row.arcs,
    ),
    chapters,
  };
}

/** Derive Gerüst from an existing Szenenplot (migration / backfill). */
export function deriveKapitelGeruestFromSzenenplot(
  structured: RomanSzenenplotStructured,
): RomanKapitelGeruestStructured {
  return {
    updatedAt: structured.updatedAt,
    modelLabel: structured.modelLabel,
    centralArcs: structured.centralArcs,
    chapters: structured.chapters.map((ch) => ({
      number: ch.number,
      title: ch.title,
      kernsatz: ch.kernsatz,
      inhaltKurz:
        ch.kernsatz ||
        ch.scenes
          .map((s) => s.summary)
          .filter(Boolean)
          .join(" ")
          .slice(0, 1_600) ||
        "Kapitel-Inhalt.",
      props: ch.props,
      events: ch.events,
      openThreads: ch.openThreads,
      mustNotRepeat: ch.mustNotRepeat,
      introduces: ch.introduces,
      resolves: ch.resolves,
      arcBeats: ch.arcBeats,
    })),
  };
}

/** Skeleton chapters usable by Szenenplot Pass 2 / Wissensgraph grow. */
export function geruestToSkeletonChapters(
  geruest: RomanKapitelGeruestStructured,
): Array<
  Omit<RomanSzenenplotChapterNode, "scenes"> & { scenes?: never }
> {
  return geruest.chapters.map((ch) => ({
    number: ch.number,
    title: ch.title,
    kernsatz: ch.kernsatz,
    props: ch.props,
    events: ch.events,
    openThreads: ch.openThreads,
    mustNotRepeat: ch.mustNotRepeat,
    introduces: ch.introduces,
    resolves: ch.resolves,
    arcBeats: ch.arcBeats,
  }));
}

/** Markdown mirror for Kapitelgerüst tab. */
export function structuredKapitelGeruestToMarkdown(
  structured: RomanKapitelGeruestStructured,
): string {
  const blocks: string[] = [];
  const arcsBlock = formatCentralArcsBlock(structured.centralArcs);
  if (arcsBlock) blocks.push(arcsBlock);
  for (const ch of structured.chapters) {
    const planBlock = formatChapterPlanBlock(ch);
    const body = [
      `Kernsatz: ${ch.kernsatz}`,
      "",
      ch.inhaltKurz,
      ...(planBlock ? ["", planBlock] : []),
    ]
      .join("\n")
      .trim();
    blocks.push(
      formatChapterBlock({
        number: ch.number,
        title: ch.title,
        body,
      }),
    );
  }
  return `${blocks.join("\n\n")}\n`;
}

export function parseSzenenplotStructuredFromModelText(
  raw: string,
  modelLabel: string,
): RomanSzenenplotStructured {
  const obj = parseModelJsonObject(raw, "Szenenplot");
  const parsed = parseRomanSzenenplotStructured(obj, { modelLabel });
  if (!parsed) {
    throw new Error(
      "Szenenplot-JSON unvollständig — mind. 2 Kapitel mit Szenen (dramaturgy inkl. outcome_value_change) nötig.",
    );
  }
  return {
    ...parsed,
    updatedAt: new Date().toISOString(),
    modelLabel: modelLabel || parsed.modelLabel,
  };
}

/** Markdown mirror for manuskriptRaw / parsePlotChapters / UI textarea. */
export function structuredSzenenplotToMarkdown(
  structured: RomanSzenenplotStructured,
): string {
  const blocks: string[] = [];
  const arcsBlock = formatCentralArcsBlock(structured.centralArcs);
  if (arcsBlock) {
    blocks.push(arcsBlock);
  }
  for (const ch of structured.chapters) {
    const planBlock = formatChapterPlanBlock(ch);
    const lines: string[] = [
      `Kernsatz: ${ch.kernsatz}`,
      ...(planBlock ? [planBlock, ""] : [""]),
    ];
    for (const scene of ch.scenes) {
      lines.push(`### ${scene.scene_id} — ${scene.heading}`);
      lines.push(`Zusammenfassung: ${scene.summary}`);
      if (scene.characters_present.length) {
        lines.push(`Figuren: ${scene.characters_present.join(", ")}`);
      }
      lines.push(`Ziel: ${scene.dramaturgy.scene_goal}`);
      lines.push(`Hindernis: ${scene.dramaturgy.obstacle_conflict}`);
      lines.push(`Wendepunkt: ${scene.dramaturgy.turning_point}`);
      lines.push(`Wertänderung: ${scene.dramaturgy.outcome_value_change}`);
      if (scene.information_flow.revealed_to_audience) {
        lines.push(
          `Publikum erfährt: ${scene.information_flow.revealed_to_audience}`,
        );
      }
      if (scene.information_flow.revealed_to_characters) {
        lines.push(
          `Figuren erfahren: ${scene.information_flow.revealed_to_characters}`,
        );
      }
      if (scene.information_flow.kept_secret) {
        lines.push(`Geheim: ${scene.information_flow.kept_secret}`);
      }
      const states = Object.entries(scene.continuity.character_states_after);
      if (states.length) {
        lines.push(
          `Zustand danach (Ort/Etage): ${states.map(([k, v]) => `${k}: ${v}`).join("; ")}`,
        );
      }
      const props = Object.entries(scene.continuity.prop_placements_after ?? {});
      if (props.length) {
        lines.push(
          `Props danach: ${props.map(([k, v]) => `${k}: ${v}`).join("; ")}`,
        );
      }
      if (scene.continuity.next_scene_hook) {
        lines.push(`Hook: ${scene.continuity.next_scene_hook}`);
      }
      const brief = buildSchreibPromptFallback(scene);
      if (brief) {
        lines.push(`Schreibprompt:\n${brief}`);
      }
      lines.push("");
    }
    blocks.push(
      formatChapterBlock({
        number: ch.number,
        title: ch.title,
        body: lines.join("\n").trim(),
      }),
    );
  }
  return `${blocks.join("\n\n")}\n`;
}

/**
 * Compact chapter contracts for Manuskript Co-Autor.
 * Prefers frozen `schreibPrompt`s — no plot invention, only prose expansion.
 */
export function formatStructuredChapterForManuskript(
  structured: RomanSzenenplotStructured | null | undefined,
  chapterNumber: number,
): string {
  const ch = structured?.chapters.find((c) => c.number === chapterNumber);
  if (!ch) return "";
  const planBlock = formatChapterPlanBlock(ch);
  const arcBlock = formatArcContractsForChapter(structured, chapterNumber, 0);
  const lines: string[] = [
    `Kernsatz: ${ch.kernsatz}`,
    ...(arcBlock ? ["", arcBlock, ""] : []),
    ...(planBlock
      ? ["", "## Gerüst-Plan (Props/Events — verbindlich)", planBlock, ""]
      : [""]),
    "## Szenenverträge (nur ausformulieren — Handlung nicht erfinden)",
  ];
  for (const scene of ch.scenes) {
    lines.push(`### ${scene.scene_id} — ${scene.heading}`);
    lines.push(formatCanonicalSceneContract(scene));
    lines.push("");
  }
  // Prefer full contracts over early clip — packet layer applies priority budgets.
  return lines.join("\n").trim().slice(0, 12_000);
}

export function structuredToPlotChapters(
  structured: RomanSzenenplotStructured,
): PlotChapter[] {
  return structured.chapters.map((c) => ({
    number: c.number,
    title: c.title,
    body: formatStructuredChapterForManuskript(structured, c.number),
  }));
}

/** JSON schema hint embedded in prompts. */
export const SZENENPLOT_STRUCTURED_SCHEMA_HINT = `{
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
    {
      "number": 1,
      "title": "Kurztitel",
      "kernsatz": "Was dieses Kapitel im Bogen leistet",
      "props": ["konkreter Gegenstand"],
      "events": ["benanntes Ereignis"],
      "openThreads": ["offener Faden"],
      "mustNotRepeat": ["bereits erledigter Beat"],
      "introduces": ["neu eingeführt hier"],
      "resolves": ["hier abgeschlossen"],
      "arcBeats": [
        {
          "arcId": "arc_vater_sohn",
          "tension": 2,
          "mustShow": "erste Reibung / unterkühlte Nähe",
          "delta": "Vertrauen sinkt leicht"
        }
      ],
      "scenes": [
        {
          "scene_id": "SZ_01",
          "heading": "INT. ORT - ZEIT",
          "summary": "Was in der Szene passiert (1–3 Sätze).",
          "characters_present": ["Figur A", "Figur B"],
          "dramaturgy": {
            "scene_goal": "Was die aktive Figur will.",
            "obstacle_conflict": "Was dagegensteht.",
            "turning_point": "Wendung in der Szene.",
            "outcome_value_change": "Konkrete Wertänderung (+/−), kein Stillstand."
          },
          "information_flow": {
            "revealed_to_audience": "Was das Publikum neu erfährt.",
            "revealed_to_characters": "Was welche Figur neu erfährt.",
            "kept_secret": "Was bewusst zurückgehalten wird."
          },
          "continuity": {
            "character_states_after": {
              "Tobias": "Arbeitszimmer OG · barfuß"
            },
            "prop_placements_after": {
              "Schuhe": "Garderobe EG"
            },
            "next_scene_hook": "Ursache → Wirkung; Bewegung muss zum Ort/Etage danach passen (z. B. runter zur Küche)."
          },
          "schreibPrompt": "Imperativ-Auftrag zum Ausformulieren: sichtbare Beats, Props, Hook; DARF-NICHT für kept_secret; keine Prosa, keine neuen Stränge — Manuskript liefert nur Ton/Emotion."
        }
      ]
    }
  ]
}`;

/**
 * Skeleton schema (Pass 1): titles + kernsatz + prop/event lifecycle + arcs.
 * Scenes come in Pass 2; lifecycle and Spannungsbögen must already be planned.
 */
export const SZENENPLOT_SKELETON_SCHEMA_HINT = `{
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
    {
      "number": 1,
      "title": "Kurztitel",
      "kernsatz": "Funktion im Bogen",
      "inhaltKurz": "1–3 kurze Absätze: was in diesem Kapitel passiert (noch keine Einzelszenen).",
      "props": ["Wallbox", "Aufhebungsvertrag"],
      "events": ["Vertrag wird unterschrieben"],
      "openThreads": ["Wer hat die Rechnung manipuliert?"],
      "mustNotRepeat": [],
      "introduces": ["Wallbox", "Aufhebungsvertrag"],
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

export const KAPITELGERUEST_SYSTEM_ADDENDUM = `Du bist Entwicklungslektor:in und Dramaturg. Erstelle ein Kapitelgerüst — eine arbeitende SKIZZE, kein vorweggenommenes Buch.

Regeln:
- Pro Kapitel: kernsatz (eine Zeile Rolle) + inhaltKurz (knapp: 2–4 Sätze / max. 1 kurzer Absatz — nicht nur den Kernsatz, aber auch kein Mini-Manuskript).
- centralArcs (2–4): Reihenfolge = Priorität (erstes = Hauptbogen). Setup-/Peak-/Payoff-Kapitel; arcBeats pro Kapitel für aktive Arcs.
- Props/Events-Lifecycle: introduces genau einmal; resolves nur bei Abschluss.
- Props greifbar benennen (z. B. „silberner Golf AB-CD 123“) — aber nicht jede Szene ausbuchstabieren.
- Ecken & Kanten erwünscht: openThreads offen lassen, mustShow knapp, Raum für Szenenplot/Manuskript. Nicht glattbügeln, nicht „alles klären“.
- Tragfähig = Arc-Logik + Kapitel-Funktion + Lifecycle. Nicht = jedes Detail, jeder Dialogbeat, jede Motivation ausgeschrieben.
- Keine Szenen-Arrays, keine Dialoge, keine Manuskript-Prosa, keine Beat-für-Beat-Erzählung.
- Antwort ausschließlich als ein JSON-Objekt { "centralArcs": [...], "chapters": [...] }.
- VERBOTEN: Markdown-Überschriften, Bullet-Listen („- Kernsatz:“ / „- Inhalt:“), Code-Fences, Fließtext außerhalb von JSON-Stringwerten.`;

export const SZENENPLOT_STRUCTURED_SYSTEM_ADDENDUM = `Du bist Entwicklungslektor:in und Dramaturg. Analysiere freigegebenes Kapitelgerüst und Upstream und erstelle einen detaillierten Szenenplot (Verträge, keine Prosa).

Regeln:
- Jede Szene MUSS eine konkrete Wertänderung (outcome_value_change) haben. Szenen ohne Handlung / nur Nachdenken sind verboten.
- Jede Szene braucht einen schreibPrompt: verbindlicher Imperativ-Auftrag (sichtbare Beats, Props/Events, Hook, DARF-NICHT für kept_secret) — keine Prosa, keine neuen Stränge. Der Manuskript-Co-Autor soll nur Ton/Emotion/SHOW ergänzen müssen.
- Verfolge den Informationsfluss (information_flow): Wer weiß wann was? kept_secret hart und konsistent.
- Nahtlose Übergänge (next_scene_hook): jede Szene ist logische Konsequenz der vorherigen (Ursache-Wirkungs-Kette) — keine Handlungsbrüche.
- Continuity RÄUMLICH: character_states_after nennt Ort/Etage je Figur (EG/OG/…); prop_placements_after nennt Ablageort wichtiger Props (Schuhe, Tasche, Schlüssel). Hook-Bewegung (hoch/runter) muss zum Endzustand passen — kein „nochmal hoch“, wenn die Figur schon oben ist.
- Props/Events und Arc-Beats aus dem Gerüst übernehmen und in Szenen umsetzen — keine Doppel-Einführung, kein stilles Weglassen.
- KONKRETE DETAILS in Summary/schreibPrompt/props verankern (Farbe, Kennzeichen, Hausnr., Uhrzeit, Datum, Namen) — der Wissensgraph speichert sie kanonisch fürs Manuskript.
- Jedes Kapitel hat 1–N Szenen (typisch 2–5). Kapitelnummer fortlaufend ab 1 — nur Gerüst-Kapitel.
- Antwort ausschließlich als gültiges JSON gemäß Schema — keine Markdown-Fences, keine Prosa drumherum.
- Felder kurz halten (1–2 Sätze). Keine Escapes mit echten Zeilenumbrüchen in Strings.`;

