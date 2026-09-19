/**
 * Structured Kapitelgerüst / Szenenplot: dramaturgy + information flow + continuity.
 * Persisted on `editorial.szenenplotStructured`; markdown mirror in `manuskriptRaw`.
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
  character_states_after: Record<string, string>;
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
};

export type RomanSzenenplotChapterNode = {
  number: number;
  title: string;
  kernsatz: string;
  scenes: RomanSzenenplotScene[];
};

export type RomanSzenenplotStructured = {
  updatedAt: string;
  modelLabel: string;
  chapters: RomanSzenenplotChapterNode[];
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
  if (!dramaturgy) return null;
  const heading = String(s.heading ?? s.title ?? "").trim();
  const summary = String(s.summary ?? s.zusammenfassung ?? "").trim();
  if (heading.length < 3 || summary.length < 8) return null;
  const scene_id = String(
    s.scene_id ?? s.sceneId ?? `SZ_${String(index + 1).padStart(2, "0")}`,
  )
    .trim()
    .slice(0, 32);
  return {
    scene_id: scene_id || `SZ_${String(index + 1).padStart(2, "0")}`,
    heading: heading.slice(0, 160),
    summary: summary.slice(0, 600),
    characters_present: asStringList(
      s.characters_present ?? s.charactersPresent ?? s.figuren,
      12,
    ),
    dramaturgy,
    information_flow: parseInformationFlow(
      s.information_flow ?? s.informationFlow,
    ),
    continuity: parseContinuity(s.continuity),
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
      chapters.push({
        number: Math.min(40, Math.round(number)),
        title: title || `Kapitel ${Math.round(number)}`,
        kernsatz:
          kernsatz ||
          scenes[0]?.summary.slice(0, 200) ||
          "Kapitel-Funktion klären.",
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
        scenes,
      });
    }
  }

  chapters.sort((a, b) => a.number - b.number);
  if (chapters.length < minChapters) return null;
  const sceneCount = chapters.reduce((n, c) => n + c.scenes.length, 0);
  if (sceneCount < minScenes) return null;

  return {
    updatedAt:
      String(row.updatedAt ?? "").trim() || new Date().toISOString(),
    modelLabel:
      String(row.modelLabel ?? meta?.modelLabel ?? "")
        .trim()
        .slice(0, 120) || "—",
    chapters,
  };
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
  for (const ch of structured.chapters) {
    const lines: string[] = [`Kernsatz: ${ch.kernsatz}`, ""];
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
          `Zustand danach: ${states.map(([k, v]) => `${k}: ${v}`).join("; ")}`,
        );
      }
      if (scene.continuity.next_scene_hook) {
        lines.push(`Hook: ${scene.continuity.next_scene_hook}`);
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

/** Compact chapter beat block for Manuskript Co-Autor (from structured). */
export function formatStructuredChapterForManuskript(
  structured: RomanSzenenplotStructured | null | undefined,
  chapterNumber: number,
): string {
  const ch = structured?.chapters.find((c) => c.number === chapterNumber);
  if (!ch) return "";
  const lines: string[] = [
    `Kernsatz: ${ch.kernsatz}`,
    "",
    "## Szenen (verbindlich umsetzen)",
  ];
  for (const scene of ch.scenes) {
    lines.push(`### ${scene.scene_id} — ${scene.heading}`);
    lines.push(scene.summary);
    lines.push(`Figuren: ${scene.characters_present.join(", ") || "—"}`);
    lines.push(`Ziel: ${scene.dramaturgy.scene_goal}`);
    lines.push(`Hindernis: ${scene.dramaturgy.obstacle_conflict}`);
    lines.push(`Wendepunkt: ${scene.dramaturgy.turning_point}`);
    lines.push(`Wertänderung: ${scene.dramaturgy.outcome_value_change}`);
    lines.push(
      `Info Publikum: ${scene.information_flow.revealed_to_audience || "—"}`,
    );
    lines.push(
      `Info Figuren: ${scene.information_flow.revealed_to_characters || "—"}`,
    );
    lines.push(`Geheim: ${scene.information_flow.kept_secret || "—"}`);
    const states = Object.entries(scene.continuity.character_states_after);
    if (states.length) {
      lines.push(
        `Zustand Ende: ${states.map(([k, v]) => `${k}=${v}`).join("; ")}`,
      );
    }
    lines.push(`Nächste Szene: ${scene.continuity.next_scene_hook || "—"}`);
    lines.push("");
  }
  return lines.join("\n").trim().slice(0, 8_000);
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
  "chapters": [
    {
      "number": 1,
      "title": "Kurztitel",
      "kernsatz": "Was dieses Kapitel im Bogen leistet",
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
            "character_states_after": { "Figur A": "Zustand danach" },
            "next_scene_hook": "Ursache → Wirkung in die nächste Szene."
          }
        }
      ]
    }
  ]
}`;

/** Skeleton-only schema (Pass 1 — titles + kernsatz, no scenes). */
export const SZENENPLOT_SKELETON_SCHEMA_HINT = `{
  "chapters": [
    { "number": 1, "title": "Kurztitel", "kernsatz": "Funktion im Bogen" }
  ]
}`;

export const SZENENPLOT_STRUCTURED_SYSTEM_ADDENDUM = `Du bist ein erfahrener Lektor und Dramaturg. Analysiere Exposé und Upstream und erstelle einen vollständigen, chronologischen Szenenplot.

Regeln:
- Jede Szene MUSS eine konkrete Wertänderung (outcome_value_change) haben. Szenen ohne Handlung / nur Nachdenken sind verboten.
- Verfolge den Informationsfluss (information_flow): Wer weiß wann was?
- Nahtlose Übergänge (next_scene_hook): jede Szene ist logische Konsequenz der vorherigen (Ursache-Wirkungs-Kette).
- Jedes Kapitel hat 1–N Szenen (typisch 2–5). Kapitelnummer fortlaufend ab 1.
- Antwort ausschließlich als gültiges JSON gemäß Schema — keine Markdown-Fences, keine Prosa drumherum.
- Felder kurz halten (1–2 Sätze). Keine Escapes mit echten Zeilenumbrüchen in Strings.`;

