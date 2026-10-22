/**
 * Develop voice from written samples before outline:
 * 3 Autor (Haiku) variants → blind Lektor (Luna) critic → second-scene lock → Voice Card.
 */

import { z } from "zod";
import { voiceCardExtractSchema } from "@/lib/novel/schemas";
import type { NovelBundle } from "@/lib/novel/types";

export const VOICE_DISCOVERY_KEY = "__voiceDiscovery";

export const voiceVariantSchema = z.object({
  id: z.enum(["A", "B", "C"]),
  stanceLabel: z.string().min(2),
  prose: z.string().min(80),
});

/**
 * Models sometimes return 1–2 variants or omit ids — coerce to A/B/C and
 * require at least 2 usable samples (pad prompt asks for 3).
 */
function normalizeVoiceVariants(raw: unknown): unknown {
  if (!Array.isArray(raw)) return raw;
  const ids = ["A", "B", "C"] as const;
  const out: Array<{ id: "A" | "B" | "C"; stanceLabel: string; prose: string }> =
    [];
  for (let i = 0; i < raw.length && out.length < 3; i++) {
    const item = raw[i];
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const o = item as Record<string, unknown>;
    const prose = String(o.prose ?? o.text ?? "").trim();
    const stanceLabel = String(
      o.stanceLabel ?? o.stance ?? o.label ?? "",
    ).trim();
    if (prose.length < 80) continue;
    const idRaw = String(o.id ?? ids[out.length] ?? "A")
      .trim()
      .toUpperCase();
    const id = (ids.includes(idRaw as "A" | "B" | "C")
      ? idRaw
      : ids[out.length]) as "A" | "B" | "C";
    if (out.some((v) => v.id === id)) continue;
    out.push({
      id,
      stanceLabel: stanceLabel || `Haltung ${id}`,
      prose,
    });
  }
  // Re-label sequentially A, B, C if ids collided / missing.
  return out.map((v, i) => ({ ...v, id: ids[i]! }));
}

export const voiceVariantsBundleSchema = z.preprocess(
  (raw) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
    const o = raw as Record<string, unknown>;
    return {
      ...o,
      sceneBrief: String(o.sceneBrief ?? o.brief ?? "").trim(),
      variants: normalizeVoiceVariants(o.variants ?? o.samples ?? o.texte),
    };
  },
  z.object({
    sceneBrief: z.string().min(8),
    variants: z.array(voiceVariantSchema).min(2).max(3),
  }),
);

export const voiceCriticSchema = z.object({
  winnerId: z.enum(["A", "B", "C"]),
  runnerUpId: z.enum(["A", "B", "C"]),
  comparisons: z
    .array(
      z.object({
        criterion: z.string().min(2),
        winnerId: z.enum(["A", "B", "C"]),
        evidence: z.string().min(10),
      }),
    )
    .min(3)
    .max(8),
  verdict: z.string().min(20),
});

function coerceExcerptList(raw: unknown): string[] {
  const asList = Array.isArray(raw)
    ? raw
    : typeof raw === "string" && raw.trim()
      ? [raw]
      : [];
  return asList
    .map((x) => String(x ?? "").trim().replace(/\s+/g, " "))
    .filter((s) => s.length >= 20)
    .map((s) => (s.length > 280 ? `${s.slice(0, 279).trimEnd()}…` : s))
    .slice(0, 4);
}

export const voiceLockSchema = z.object({
  confirmed: z.boolean(),
  /** If confirmed=false, switch to runner-up from prior critic. */
  useRunnerUp: z.boolean().default(false),
  notes: z.string().max(2_000).default(""),
  /** Excerpts from the locked prose to seed sampleLines. */
  referenceExcerpts: z.preprocess(
    coerceExcerptList,
    z.array(z.string().min(20).max(281)).min(2).max(4),
  ),
  voiceCard: voiceCardExtractSchema,
});

export type VoiceVariantsBundle = z.infer<typeof voiceVariantsBundleSchema>;
export type VoiceCriticJson = z.infer<typeof voiceCriticSchema>;
export type VoiceLockJson = z.infer<typeof voiceLockSchema>;
export type VoiceVariant = z.infer<typeof voiceVariantSchema>;

export type VoiceDiscoveryState = {
  sceneBrief?: string;
  variants?: VoiceVariant[];
  winnerId?: "A" | "B" | "C";
  runnerUpId?: "A" | "B" | "C";
  criticVerdict?: string;
};

export function getVoiceDiscoveryState(
  bundle: NovelBundle,
): VoiceDiscoveryState {
  const raw = bundle.knowledgeGraph?.entityStates?.[VOICE_DISCOVERY_KEY];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return raw as VoiceDiscoveryState;
}

export function entityStatesWithVoiceDiscovery(
  entityStates: Record<string, unknown>,
  state: VoiceDiscoveryState,
): Record<string, unknown> {
  return { ...entityStates, [VOICE_DISCOVERY_KEY]: state };
}

export const VOICE_DISCOVERY_SCENE_A = `Schreibe dieselbe Eröffnungsszene GENAU dreimal — drei DEUTLICH unterschiedliche Erzählhaltungen (A/B/C).
Pflicht: Das JSON-Array "variants" enthält EXAKT 3 Objekte mit id "A", "B", "C".
Die Szene braucht Konflikt, Subtext und eine konkrete Wahrnehmung (keine reine Exposition).
Keine Kapitelüberschrift. Je Variante 200–350 Wörter (vollständig, nicht abbrechen).
Antwort NUR als valides JSON (keine Markdown-Fences):
{"sceneBrief":"1 Satz was passiert","variants":[{"id":"A","stanceLabel":"…","prose":"…"},{"id":"B","stanceLabel":"…","prose":"…"},{"id":"C","stanceLabel":"…","prose":"…"}]}`;

export function voiceCriticPrompt(variantsJson: string): string {
  return `Du kennst die Entstehung der Texte NICHT. Vergleiche blind drei Varianten derselben Szene.
Kriterien: konkrete Wahrnehmung, Figurenindividualität, Subtext, Vermeidung austauschbarer Formulierungen.
Jedes Urteil MUSS an Textstellen belegt werden (evidence = Zitat oder knappe Paraphrase).
Antwort NUR als JSON:
{"winnerId":"A|B|C","runnerUpId":"A|B|C","comparisons":[{"criterion":"…","winnerId":"A|B|C","evidence":"…"}],"verdict":"…"}

Varianten:
${variantsJson.slice(0, 24_000)}`;
}

export function secondSceneAuthorPrompt(input: {
  idea: string;
  stanceLabel: string;
  winningProse: string;
}): string {
  return `Schreibe eine ZWEITE, andersartige Szene (anderer Ort/Konflikt/Beat) in derselben Erzählhaltung wie die Referenz.
Haltung: ${input.stanceLabel}
Referenzpassage (Stimme halten, Inhalt nicht wiederholen):
${input.winningProse.slice(0, 3_500)}

Idee des Romans:
${input.idea.slice(0, 6_000)}

Gib NUR den Szenentext (350–550 Wörter), keine Meta-Kommentare.`;
}

export function voiceLockPrompt(input: {
  stanceLabel: string;
  firstProse: string;
  secondProse: string;
}): string {
  return `Prüfe, ob die zweite Szene dieselbe lebendige Stimme trägt wie die erste (nicht nur dieselben Adjektive).
Wenn ja: confirmed=true und leite eine Voice Card aus DEN TEXTEN ab (traits/doWrite/sampleLines aus echten Formulierungen).
Wenn nein: confirmed=false, useRunnerUp=true, trotzdem beste mögliche Card aus der stärkeren Passage.
sampleLines und referenceExcerpts: je 2–4 KURZE Sätze (max. ~200 Zeichen), keine Absätze.
Antwort NUR als JSON:
{"confirmed":true|false,"useRunnerUp":false,"notes":"…","referenceExcerpts":["kurzer Satz…","…"],"voiceCard":{"toneLabel":"…","traits":["…"],"doWrite":["…"],"sampleLines":["kurzer Satz…","…"],"endingRotation":["Handlung","Dialog","sinnlich","offen"]}}

Haltung: ${input.stanceLabel}

Szene 1:
${input.firstProse.slice(0, 4_000)}

Szene 2:
${input.secondProse.slice(0, 4_000)}`;
}
