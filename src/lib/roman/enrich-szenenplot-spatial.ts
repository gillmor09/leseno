/**
 * Legacy / weak plots: fill character_states_after (Ort/Etage) and
 * prop_placements_after so Manuskript Raum-Spine is usable.
 */

import { generateText } from "@/lib/ai/provider";
import { parseModelJsonObject } from "@/lib/ai/parse-model-json";
import { resolveRomanAssistModel } from "@/lib/roman/assist-model";
import {
  type RomanSzenenplotChapterNode,
  type RomanSzenenplotScene,
  type RomanSzenenplotStructured,
} from "@/lib/roman/szenenplot-structured";

const ORT_HINT_RE =
  /\b(eg|og|ug|keller|dach|etage|stock|zimmer|küche|flur|garderobe|treppe|haus|wohnung|büro|garten|straße|auto|wagen)\b/i;

/** True when spatial continuity is missing or too vague for a usable spine. */
export function szenenplotNeedsSpatialEnrichment(
  structured: RomanSzenenplotStructured | null | undefined,
): boolean {
  if (!structured?.chapters.length) return false;
  if (structured.spatialContinuityEnrichedAt?.trim()) return false;
  let scenes = 0;
  let weak = 0;
  for (const ch of structured.chapters) {
    for (const s of ch.scenes) {
      scenes += 1;
      const states = Object.entries(s.continuity.character_states_after ?? {});
      const props = Object.entries(s.continuity.prop_placements_after ?? {});
      const statesOk =
        states.length > 0 &&
        states.some(([, v]) => ORT_HINT_RE.test(v) || /\b(oben|unten)\b/i.test(v));
      if (!statesOk || (ch.props.length > 0 && props.length === 0)) {
        weak += 1;
      }
    }
  }
  if (scenes === 0) return false;
  return weak / scenes >= 0.35;
}

type EnrichSceneRow = {
  scene_id?: string;
  character_states_after?: Record<string, string>;
  prop_placements_after?: Record<string, string>;
  next_scene_hook?: string;
};

function mergeSceneContinuity(
  scene: RomanSzenenplotScene,
  row: EnrichSceneRow | undefined,
): RomanSzenenplotScene {
  if (!row) return scene;
  const states = {
    ...scene.continuity.character_states_after,
    ...(row.character_states_after && typeof row.character_states_after === "object"
      ? Object.fromEntries(
          Object.entries(row.character_states_after)
            .map(([k, v]) => [String(k).trim(), String(v ?? "").trim()])
            .filter(([k, v]) => k && v.length >= 2),
        )
      : {}),
  };
  const props = {
    ...scene.continuity.prop_placements_after,
    ...(row.prop_placements_after && typeof row.prop_placements_after === "object"
      ? Object.fromEntries(
          Object.entries(row.prop_placements_after)
            .map(([k, v]) => [String(k).trim(), String(v ?? "").trim()])
            .filter(([k, v]) => k && v.length >= 2),
        )
      : {}),
  };
  const hook =
    String(row.next_scene_hook ?? "").trim() ||
    scene.continuity.next_scene_hook;
  return {
    ...scene,
    continuity: {
      character_states_after: states,
      prop_placements_after: props,
      next_scene_hook: hook.slice(0, 400),
    },
  };
}

async function enrichChapterSpatial(
  ch: RomanSzenenplotChapterNode,
): Promise<RomanSzenenplotChapterNode> {
  if (!ch.scenes.length) return ch;
  const model = await resolveRomanAssistModel();
  const sceneBrief = ch.scenes
    .map((s) => {
      const states = Object.entries(s.continuity.character_states_after)
        .map(([k, v]) => `${k}: ${v}`)
        .join("; ");
      const props = Object.entries(s.continuity.prop_placements_after ?? {})
        .map(([k, v]) => `${k}: ${v}`)
        .join("; ");
      return [
        `### ${s.scene_id} — ${s.heading}`,
        s.summary ? `Summary: ${s.summary}` : "",
        `Figuren: ${s.characters_present.join(", ") || "—"}`,
        `Ziel: ${s.dramaturgy.scene_goal}`,
        `Hook: ${s.continuity.next_scene_hook || "—"}`,
        states ? `Ist-Zustand: ${states}` : "Ist-Zustand: (leer)",
        props ? `Ist-Props: ${props}` : "Ist-Props: (leer)",
        `schreibPrompt: ${(s.schreibPrompt || "").slice(0, 400)}`,
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n\n");

  const raw = (
    await generateText({
      model,
      systemInstruction: `Du ergänzt räumliche Continuity für einen Szenenplot (kein neuer Plot).
Pro Szene: character_states_after (Figur → Ort/Etage, z. B. „Arbeitszimmer OG · barfuß“) und prop_placements_after (Prop → Ablageort, z. B. „Schuhe: Garderobe EG“).
Hooks nur schärfen, wenn die Bewegung zum Endzustand passen muss (hoch/runter).
Keine Prosa. Handlung nicht erfinden — aus Summary/schreibPrompt ableiten.
Antwort NUR JSON:
{"scenes":[{"scene_id":"SZ_01","character_states_after":{"Name":"Ort · Etage"},"prop_placements_after":{"Prop":"Ort"},"next_scene_hook":"…"}]}`,
      userText: `# Kapitel ${ch.number} — ${ch.title}
Props (Kapitel): ${ch.props.join("; ") || "—"}
Events: ${ch.events.join("; ") || "—"}

${sceneBrief}

Liefere Continuity für JEDE scene_id.`,
      preferJson: true,
      maxTokens: 2_400,
      timeoutMs: 60_000,
      reasoningEffort: "none",
    })
  ).trim();

  let obj: unknown = null;
  try {
    obj = parseModelJsonObject(raw, "Spatial-Enrich");
  } catch {
    return ch;
  }
  if (!obj || typeof obj !== "object") return ch;
  const scenesRaw = (obj as Record<string, unknown>).scenes;
  if (!Array.isArray(scenesRaw)) return ch;
  const byId = new Map<string, EnrichSceneRow>();
  for (const item of scenesRaw) {
    if (!item || typeof item !== "object") continue;
    const row = item as EnrichSceneRow;
    const id = String(row.scene_id ?? "").trim();
    if (id) byId.set(id, row);
  }
  return {
    ...ch,
    scenes: ch.scenes.map((s) => mergeSceneContinuity(s, byId.get(s.scene_id))),
  };
}

/**
 * Enrich Ort/Etage/Prop-Ablage for all chapters (batched per chapter).
 * Sets spatialContinuityEnrichedAt on success path (even if some chapters soft-fail).
 */
export async function enrichSzenenplotSpatialContinuity(
  structured: RomanSzenenplotStructured,
  options?: { onProgress?: (label: string) => Promise<void> },
): Promise<RomanSzenenplotStructured> {
  if (!structured.chapters.length) return structured;
  const chapters: RomanSzenenplotChapterNode[] = [];
  for (let i = 0; i < structured.chapters.length; i += 1) {
    const ch = structured.chapters[i]!;
    await options?.onProgress?.(
      `Raum-Continuity nachschärfen · Kap. ${ch.number}/${structured.chapters.length} …`,
    );
    try {
      chapters.push(await enrichChapterSpatial(ch));
    } catch {
      chapters.push(ch);
    }
  }
  return {
    ...structured,
    chapters,
    updatedAt: new Date().toISOString(),
    spatialContinuityEnrichedAt: new Date().toISOString(),
  };
}
