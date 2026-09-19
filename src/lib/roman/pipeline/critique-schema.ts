import { z } from "zod";
import { PIPELINE_STAGES } from "@/lib/roman/pipeline/stages";
import { ROMAN_CRITIQUE_FOCUS_MAX } from "@/lib/roman/pipeline/quality-brief";

export const critiqueFindingSchema = z.object({
  id: z.string().min(1).max(40),
  severity: z.enum(["kritisch", "wichtig", "optional"]).default("wichtig"),
  summary: z.string().min(3).max(800),
  suggestion: z.string().min(3).max(12_000),
  severityHint: z.enum(["lokal", "upstream"]).optional(),
  chapterNumbers: z.array(z.number().int().positive()).max(40).optional(),
});

export const critiquePayloadSchema = z.object({
  findings: z
    .array(critiqueFindingSchema)
    .min(1)
    .max(ROMAN_CRITIQUE_FOCUS_MAX),
  strengths: z.string().max(8_000).optional().default(""),
});

export type CritiqueFinding = z.infer<typeof critiqueFindingSchema>;
export type CritiquePayload = z.infer<typeof critiquePayloadSchema>;

export const routeTargetSchema = z.object({
  stage: z.enum(PIPELINE_STAGES),
  reason: z.string().min(3).max(800),
  patchBrief: z.string().min(3).max(6000),
  chapterNumbers: z.array(z.number().int().positive()).max(40).optional(),
});

export const routePayloadSchema = z.object({
  targets: z.array(routeTargetSchema).min(1).max(2),
});

export type RouteTarget = z.infer<typeof routeTargetSchema>;
export type RoutePayload = z.infer<typeof routePayloadSchema>;

const SEVERITY_RANK: Record<CritiqueFinding["severity"], number> = {
  kritisch: 0,
  wichtig: 1,
  optional: 2,
};

const SEVERITY_LABEL: Record<CritiqueFinding["severity"], string> = {
  kritisch: "kritisch",
  wichtig: "wichtig",
  optional: "Nice to have",
};

/** Clamp model output into schema limits (avoids cascade Zod „Eingabe ist zu lang.“). */
export function clampCritiquePayload(payload: CritiquePayload): CritiquePayload {
  const findings = [...payload.findings]
    .sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity])
    .slice(0, ROMAN_CRITIQUE_FOCUS_MAX)
    .map((f, i) => ({
      id: (f.id || String(i + 1)).slice(0, 40),
      severity: f.severity,
      summary: f.summary.trim().slice(0, 800),
      suggestion: f.suggestion.trim().slice(0, 12_000),
      severityHint: f.severityHint,
      chapterNumbers: f.chapterNumbers?.slice(0, 40),
    }));
  return {
    strengths: (payload.strengths ?? "").slice(0, 8_000),
    findings,
  };
}

/** Soft-parse critique from model JSON or fall back to one finding from prose. */
export function parseCritiquePayload(
  raw: string,
  fallbackLabel = "Gegenlese",
): CritiquePayload {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  try {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    const slice =
      start >= 0 && end > start ? cleaned.slice(start, end + 1) : cleaned;
    const obj = JSON.parse(slice) as unknown;
    if (obj && typeof obj === "object") {
      const soft = obj as {
        strengths?: unknown;
        findings?: unknown;
      };
      if (Array.isArray(soft.findings) && soft.findings.length > 0) {
        const clamped = clampCritiquePayload({
          strengths: String(soft.strengths ?? ""),
          findings: soft.findings.map((item, i) => {
            const f = (item ?? {}) as Record<string, unknown>;
            const severityRaw = String(f.severity ?? "wichtig")
              .trim()
              .toLowerCase()
              .replace(/[\s-]+/g, "_");
            const severity =
              severityRaw === "kritisch" || severityRaw === "critical"
                ? ("kritisch" as const)
                : severityRaw === "optional" ||
                    severityRaw === "nice_to_have" ||
                    severityRaw === "nice"
                  ? ("optional" as const)
                  : ("wichtig" as const);
            return {
              id: String(f.id ?? i + 1),
              severity,
              summary: String(f.summary ?? "Finding").trim() || "Finding",
              suggestion:
                String(f.suggestion ?? f.summary ?? "").trim() ||
                "Siehe Kritik.",
              severityHint:
                f.severityHint === "lokal" || f.severityHint === "upstream"
                  ? f.severityHint
                  : undefined,
              chapterNumbers: Array.isArray(f.chapterNumbers)
                ? f.chapterNumbers
                    .map((n) => Number(n))
                    .filter((n) => Number.isFinite(n) && n > 0)
                : undefined,
            };
          }),
        });
        const parsed = critiquePayloadSchema.safeParse(clamped);
        if (parsed.success) return parsed.data;
      }
    }
  } catch {
    /* prose fallback */
  }
  const text = cleaned.slice(0, 12_000);
  if (text.length < 40) {
    throw new Error(`${fallbackLabel} lieferte keine brauchbare Kritik.`);
  }
  return clampCritiquePayload({
    findings: [
      {
        id: "1",
        severity: "wichtig",
        summary: "Freitext-Gegenlese",
        suggestion: text,
        severityHint: "lokal",
      },
    ],
    strengths: "",
  });
}

/** Soft-parse router JSON. */
export function parseRoutePayload(raw: string): RoutePayload {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  const slice =
    start >= 0 && end > start ? cleaned.slice(start, end + 1) : cleaned;
  let obj: unknown;
  try {
    obj = JSON.parse(slice);
  } catch {
    throw new Error("Pipeline-Router lieferte ungültiges JSON.");
  }
  const parsed = routePayloadSchema.safeParse(obj);
  if (!parsed.success) {
    throw new Error("Pipeline-Router lieferte ungültige Ziele.");
  }
  return parsed.data;
}

export function formatCritiqueForPrompt(payload: CritiquePayload): string {
  const lines: string[] = [];
  if (payload.strengths.trim()) {
    lines.push(`Stärken:\n${payload.strengths.trim()}`);
  }
  const onlyOptional =
    payload.findings.length > 0 &&
    payload.findings.every((f) => f.severity === "optional");
  if (onlyOptional) {
    lines.push(
      "Hinweis: Nur noch Nice-to-have — keine kritischen/wichtigen Pflichtpunkte.",
    );
  }
  lines.push("Findings (max. 3, nach Wichtigkeit):");
  for (const f of payload.findings) {
    const chapters = f.chapterNumbers?.length
      ? ` [Kapitel ${f.chapterNumbers.join(", ")}]`
      : "";
    lines.push(
      `- (${f.id}) [${SEVERITY_LABEL[f.severity]}]${chapters} ${f.summary}\n  → ${f.suggestion}`,
    );
  }
  return lines.join("\n");
}
