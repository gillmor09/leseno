/**
 * Post-draft spatial continuity check for Manuskript chapters.
 * Compares prose against the plot Raum-/Prop-Spine (floor, props, hoch/runter).
 */

import { generateText } from "@/lib/ai/provider";
import { parseModelJsonObject } from "@/lib/ai/parse-model-json";
import { resolveRomanAssistModel } from "@/lib/roman/assist-model";
import {
  formatSpatialSpineForChapter,
  type RomanSzenenplotChapterNode,
} from "@/lib/roman/szenenplot-structured";

export type ManuskriptSpatialViolation = {
  code: "spatial_break";
  message: string;
};

/**
 * Flash assist: flag Ort/Etage/Prop contradictions vs spine.
 * Skip when spine is empty (legacy plots without spatial continuity).
 */
export async function validateManuskriptChapterSpatial(input: {
  prose: string;
  chapter: RomanSzenenplotChapterNode;
}): Promise<{ ok: boolean; violations: ManuskriptSpatialViolation[] }> {
  const spine = formatSpatialSpineForChapter(input.chapter);
  if (!spine.trim() || input.prose.trim().length < 80) {
    return { ok: true, violations: [] };
  }

  try {
    const model = await resolveRomanAssistModel();
    const raw = (
      await generateText({
        model,
        systemInstruction: `Du prüfst Raum-/Prop-Continuity in einem Roman-Kapitel.
Vergleiche die Prosa NUR mit der gelieferten Raum-/Prop-Spine.
Melde Verstöße, wenn:
- eine Figur hoch/runter geht, obwohl sie laut Spine schon auf der Ziel-Etage ist (oder umgekehrt),
- Props (Schuhe, Tasche, Schlüssel …) an einem anderen Ort auftauchen als in der Spine (z. B. wieder an der Garderobe, obwohl sie unten abgelegt und die Figur oben ist),
- Figuren teleportieren ohne sichtbaren Übergang.
Keine Stil-/Plot-Kritik. Wenn die Prosa zur Spine passt: leeres violations-Array.
Antwort NUR als JSON:
{"violations":[{"message":"kurzer deutscher Befund"}]}`,
        userText: `# Raum-/Prop-Spine (verbindlich)
${spine.slice(0, 3_500)}

# Kapitel-Prosa
${input.prose.slice(0, 14_000)}

Prüfe nur Raum/Etage/Prop-Ablage.`,
        preferJson: true,
        maxTokens: 800,
        timeoutMs: 45_000,
        reasoningEffort: "none",
      })
    ).trim();

    let obj: unknown = null;
    try {
      obj = parseModelJsonObject(raw, "Spatial-Check");
    } catch {
      return { ok: true, violations: [] };
    }
    if (!obj || typeof obj !== "object") {
      return { ok: true, violations: [] };
    }
    const row = obj as Record<string, unknown>;
    const list = Array.isArray(row.violations) ? row.violations : [];
    const violations: ManuskriptSpatialViolation[] = [];
    for (const item of list) {
      const message =
        typeof item === "string"
          ? item.trim()
          : item && typeof item === "object"
            ? String(
                (item as Record<string, unknown>).message ??
                  (item as Record<string, unknown>).text ??
                  "",
              ).trim()
            : "";
      if (message.length < 12) continue;
      violations.push({
        code: "spatial_break",
        message: message.slice(0, 280),
      });
      if (violations.length >= 4) break;
    }
    return { ok: violations.length === 0, violations };
  } catch {
    // Fail-soft: never block manuscript on assist errors.
    return { ok: true, violations: [] };
  }
}

/** Patch brief for Co-Autor rewrite after spatial breaks. */
export function formatSpatialViolationRewriteBrief(
  violations: ManuskriptSpatialViolation[],
): string {
  if (!violations.length) return "";
  return [
    "## Raum-/Prop-Bruch — Korrektur (verbindlich)",
    "Der Entwurf verletzt Ort/Etage oder Prop-Ablage laut Raum-/Prop-Spine. Schreibe das Kapitel neu und beachte:",
    ...violations.map((v, i) => `${i + 1}. ${v.message}`),
    "Handlung laut Szenenverträgen behalten. hoch/runter und Props strikt an den Spine-Endzuständen ausrichten — keine Teleportation, keine zweite Garderobe oben.",
  ].join("\n");
}
