/**
 * Post-draft coverage: are dramaturgy / arc / fact mandates visible in prose?
 * Complements ban/secret heuristics and spatial/grammar checks.
 */

import { generateText } from "@/lib/ai/provider";
import { parseModelJsonObject } from "@/lib/ai/parse-model-json";
import { resolveRomanAssistModel } from "@/lib/roman/assist-model";
import type { RomanSzenenplotChapterNode } from "@/lib/roman/szenenplot-structured";

export type ManuskriptCoverageViolation = {
  code: "coverage_gap";
  message: string;
};

/**
 * Deterministic mandate list from structured chapter (+ optional fact block).
 */
export function buildChapterCoverageMandates(
  chapter: RomanSzenenplotChapterNode,
  factContractsBlock?: string,
): string[] {
  const out: string[] = [];
  for (const scene of chapter.scenes ?? []) {
    const id = scene.scene_id || "Szene";
    const d = scene.dramaturgy;
    if (d.scene_goal?.trim()) {
      out.push(`${id}: Ziel sichtbar — ${d.scene_goal.trim().slice(0, 160)}`);
    }
    if (d.obstacle_conflict?.trim()) {
      out.push(
        `${id}: Hindernis sichtbar — ${d.obstacle_conflict.trim().slice(0, 160)}`,
      );
    }
    if (d.turning_point?.trim()) {
      out.push(
        `${id}: Wendepunkt sichtbar — ${d.turning_point.trim().slice(0, 160)}`,
      );
    }
    if (d.outcome_value_change?.trim()) {
      out.push(
        `${id}: Wertänderung spürbar — ${d.outcome_value_change.trim().slice(0, 160)}`,
      );
    }
    const reveal = scene.information_flow.revealed_to_audience?.trim();
    if (reveal && reveal.length >= 8 && !/^(keins?|none|—|-)$/i.test(reveal)) {
      out.push(`${id}: Publikum erfährt — ${reveal.slice(0, 140)}`);
    }
  }
  for (const beat of chapter.arcBeats ?? []) {
    if (beat.mustShow?.trim()) {
      out.push(
        `Arc ${beat.arcId} (T${beat.tension}): MUSS sichtbar — ${beat.mustShow.trim().slice(0, 160)}`,
      );
    }
  }
  for (const prop of (chapter.props ?? []).slice(0, 8)) {
    if (prop.trim().length >= 2) {
      out.push(`Prop referenzieren/einsetzen: ${prop.trim().slice(0, 80)}`);
    }
  }
  for (const ev of (chapter.events ?? []).slice(0, 6)) {
    if (ev.trim().length >= 2) {
      out.push(`Event sichtbar: ${ev.trim().slice(0, 80)}`);
    }
  }
  for (const intro of (chapter.introduces ?? []).slice(0, 6)) {
    if (intro.trim().length >= 2) {
      out.push(`Neu einführen: ${intro.trim().slice(0, 80)}`);
    }
  }
  for (const res of (chapter.resolves ?? []).slice(0, 6)) {
    if (res.trim().length >= 2) {
      out.push(`Abschließen/lösen: ${res.trim().slice(0, 80)}`);
    }
  }
  const facts = (factContractsBlock ?? "").trim();
  if (facts) {
    // Pull a few FROZEN / MUSS lines from the fact block for the checker.
    for (const line of facts.split("\n")) {
      const t = line.replace(/^[-*•]\s*/, "").trim();
      if (
        t.length >= 20 &&
        (/FROZEN|MASS:|HIER erstmals|HIER abschließen|kennzeichen|besitz|abstand_cm|hoehe_cm|\bcm\b/i.test(
          t,
        ) || t.startsWith("### "))
      ) {
        if (t.startsWith("###")) continue;
        out.push(`Fakt/Prop: ${t.slice(0, 160)}`);
      }
      if (out.length >= 36) break;
    }
  }
  return out.slice(0, 36);
}

/**
 * Flash assist: which mandates are missing or only weakly implied in prose.
 */
export async function validateManuskriptChapterCoverage(input: {
  prose: string;
  chapter: RomanSzenenplotChapterNode;
  factContractsBlock?: string;
}): Promise<{ ok: boolean; violations: ManuskriptCoverageViolation[] }> {
  const mandates = buildChapterCoverageMandates(
    input.chapter,
    input.factContractsBlock,
  );
  if (!mandates.length || input.prose.trim().length < 80) {
    return { ok: true, violations: [] };
  }

  try {
    const model = await resolveRomanAssistModel();
    const numbered = mandates
      .map((m, i) => `${i + 1}. ${m}`)
      .join("\n");
    const raw = (
      await generateText({
        model,
        systemInstruction: `Du prüfst, ob Szenenplot-Verträge in der Kapitel-Prosa wirklich sichtbar sind.
Für jede Pflicht aus der Liste: ist sie in der Prosa klar erkennbar (Handlung/Dialog/Wahrnehmung), oder fehlt sie / ist nur vage Meta?
Melde NUR klare Lücken (fehlend oder widersprechend). Keine Stil-Kritik.
SHOW zählt — wenn der Beat erzählt wird, ohne den Vertragswortlaut zu zitieren, ist das OK.
Antwort NUR als JSON:
{"violations":[{"message":"Pflicht N fehlt: …"}]}`,
        userText: `# Pflichten (aus Plot/Gerüst/Fakten)
${numbered}

# Kapitel-Prosa
${input.prose.slice(0, 14_000)}

Welche Pflichten fehlen klar? Max. 6. Wenn alles abgedeckt: leeres Array.`,
        preferJson: true,
        maxTokens: 900,
        timeoutMs: 50_000,
        reasoningEffort: "none",
      })
    ).trim();

    let obj: unknown = null;
    try {
      obj = parseModelJsonObject(raw, "Coverage-Check");
    } catch {
      return { ok: true, violations: [] };
    }
    if (!obj || typeof obj !== "object") {
      return { ok: true, violations: [] };
    }
    const list = Array.isArray((obj as Record<string, unknown>).violations)
      ? ((obj as Record<string, unknown>).violations as unknown[])
      : [];
    const violations: ManuskriptCoverageViolation[] = [];
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
        code: "coverage_gap",
        message: message.slice(0, 320),
      });
      if (violations.length >= 6) break;
    }
    return { ok: violations.length === 0, violations };
  } catch {
    return { ok: true, violations: [] };
  }
}

export function formatCoverageViolationRewriteBrief(
  violations: ManuskriptCoverageViolation[],
): string {
  if (!violations.length) return "";
  return [
    "## Vertrags-Abdeckung — Korrektur (verbindlich)",
    "Der Entwurf lässt Plot-/Arc-/Fakten-Pflichten aus. Schreibe das Kapitel neu und mache sichtbar:",
    ...violations.map((v, i) => `${i + 1}. ${v.message}`),
    "Handlung laut Szenenverträgen; keine neuen Stränge. SHOW, nicht Meta-Erklärung.",
  ].join("\n");
}
