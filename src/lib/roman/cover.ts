/**
 * Roman book-cover pipeline:
 * Gemini Flash scene brief → Flux 1200×1920 → Mistral title lines →
 * dominant Nunito marketing overlay (adaptive color / shadow).
 */

import { generateImage } from "@/lib/ai/generate-image";
import {
  FLUX_ILLUSTRATION_STYLE_LOCK,
  FLUX_NO_TEXT_BLOCK,
  sanitizeFluxVisualCue,
} from "@/lib/ai/flux-prompt-guards";
import { generateText } from "@/lib/ai/provider";
import { parseModelJsonObject } from "@/lib/ai/parse-model-json";
import {
  resolveRomanImagesModel,
  resolveRomanLayoutModel,
  resolveRomanTextModel,
} from "@/lib/roman/model";
import { overlayExactAngleTextOnImage } from "@/lib/social/overlay-angle-text";
import { ROMAN_COVER_SIZE } from "@/lib/roman/cover-size";
import type { RomanCharakter, RomanKontext } from "@/lib/roman/types";

export { ROMAN_COVER_SIZE } from "@/lib/roman/cover-size";

const MAX_MANUSCRIPT_FOR_SCENE = 10_000;

const COVER_STYLE_LOCK = [
  FLUX_ILLUSTRATION_STYLE_LOCK,
  "Literary fiction book-cover artwork, cinematic atmosphere, premium publishing aesthetic",
  "Painterly digital illustration, evocative mood lighting, strong focal subject",
  "Color palette and motif must match genre and reader age group",
  "Not a children's book illustration unless age group is young readers, not stock photo, not photoreal CGI",
].join(". ");

function formatCharBrief(chars: RomanCharakter[]): string {
  return chars
    .filter((c) => c.name.trim())
    .slice(0, 6)
    .map((c) => {
      const bits = [
        c.name.trim(),
        c.alter.trim() && `Alter ${c.alter.trim()}`,
        c.rolle.trim(),
        c.motivation.trim() && `will ${c.motivation.trim()}`,
      ].filter(Boolean);
      return `– ${bits.join(", ")}`;
    })
    .join("\n");
}

/**
 * Gemini plans one English cover scene from core promise + genre + age (no on-image text).
 */
export function buildRomanCoverScenePlanPrompt(input: {
  title: string;
  genre: string;
  praemisse: string;
  tonalitaet: string;
  weltSchauplaetze: string;
  charaktere: RomanCharakter[];
  manuskriptRaw: string;
  ideeKurz?: string;
  alterLabel?: string;
  extraInstruction?: string;
}): { systemInstruction: string; userText: string } {
  const systemInstruction = `You are a senior art director for trade fiction / age-appropriate book covers (German publishing).
Your job: turn the book's core promise, genre and reader age into ONE detailed image brief for a Flux pixel model.

Hard rules:
- English only; image brief only — no markdown, no quotes around the whole answer.
- Purely visual cover concept: mood, setting, key symbolic object or figure silhouette, lighting, COLOR PALETTE.
- Motif AND colors must fit genre AND altergruppe (e.g. YA warmer/clearer; thriller cooler/darker; children's brighter if age is young).
- Match the book's Kernaussage / premise — not a generic stock vibe.
- ZERO text/letters/numbers/signs/logos/UI/title on the image (title is added later in large Nunito marketing type).
- Leave a calmer lower ~40% for a DOMINANT centered title overlay (large type, high contrast) — avoid busy detail there.
- Compose for a tall portrait eBook cover exactly 1200×1920 px (5:8), full-bleed, not square.
- Do not invent spoilers that contradict the premise; stay faithful to the book's world.
- About 80–160 words.
- Illustrated / painterly — not a photograph.`;

  let manuskript = input.manuskriptRaw.trim();
  if (manuskript.length > MAX_MANUSCRIPT_FOR_SCENE) {
    manuskript = `${manuskript.slice(0, MAX_MANUSCRIPT_FOR_SCENE)}\n\n[… truncated …]`;
  }

  const chars = formatCharBrief(input.charaktere);
  const extra = input.extraInstruction?.trim();
  const idee = (input.ideeKurz ?? "").trim().slice(0, 4_000);

  const userText = `Plan the book-cover illustration.

# Working title
${input.title.trim() || "(untitled)"}

# Genre
${input.genre.trim() || "(unspecified)"}

# Reader age group (Altersklasse)
${input.alterLabel?.trim() || "(unspecified)"}

# Premise / Kernaussage
${input.praemisse.trim() || "(none)"}

# Idea dossier (short)
${idee || "(none)"}

# Tonality & style
${input.tonalitaet.trim() || "(unspecified)"}

# Key places (sensory)
${input.weltSchauplaetze.trim().slice(0, 2_000) || "(none)"}

# Characters
${chars || "(none listed)"}

# Outline / manuscript excerpt
${manuskript || "(empty — invent from premise/genre/age only)"}

${extra ? `# Extra art direction\n${extra}\n` : ""}
Write the image brief now: cinematic cover, genre-true, age-true colors, absolutely no text.`;

  return { systemInstruction, userText };
}

/** Final Flux prompt from Gemini scene + hard no-text. */
export function buildRomanCoverFluxPrompt(sceneDescription: string): string {
  const scene =
    sanitizeFluxVisualCue(sceneDescription, 900) ||
    "Atmospheric literary book-cover scene, strong focal silhouette, moody light";

  return [
    COVER_STYLE_LOCK,
    FLUX_NO_TEXT_BLOCK,
    `Scene: ${scene}.`,
    "Portrait full-bleed eBook cover 1200×1920 (5:8), edge-to-edge illustration, calmer lower 40% for a large dominant marketing title overlay.",
    FLUX_NO_TEXT_BLOCK,
  ].join(" ");
}

/**
 * Mistral suggests 1–3 centered title lines (line breaks only — no styling words).
 */
async function planCoverTitleLines(title: string): Promise<string[]> {
  const clean = title.trim().replace(/\s+/g, " ");
  if (!clean) return [];
  try {
    const layoutModel = await resolveRomanLayoutModel();
    const raw = await generateText({
      model: layoutModel,
      preferJson: true,
      maxTokens: 200,
      timeoutMs: 30_000,
      systemInstruction: `You format book titles for a DOMINANT marketing eBook cover overlay (large Nunito type, attention + urge to read).
Return ONLY JSON: {"lines":["..."]} with 1–3 short lines.
Rules:
- Keep the exact words of the title (German spelling), no quotes, no extra words, no author name.
- Prefer punchy line breaks: short lines, emotional/hook words can stand alone when natural.
- Avoid one long wrapping line — aim for a stacked poster look (2 lines often best).
- Balanced visual centering; no ALL-CAPS unless the source title is already all caps.`,
      userText: `Title:\n${clean}`,
    });
    const parsed = parseModelJsonObject(raw) as { lines?: unknown };
    const lines = Array.isArray(parsed.lines)
      ? parsed.lines
          .filter((l): l is string => typeof l === "string")
          .map((l) => l.trim())
          .filter(Boolean)
          .slice(0, 3)
      : [];
    if (lines.length > 0) return lines;
  } catch {
    /* fall through */
  }
  return [clean];
}

export type RomanCoverGenerateInput = Pick<
  RomanKontext,
  | "title"
  | "genre"
  | "praemisse"
  | "tonalitaet"
  | "weltSchauplaetze"
  | "charaktere"
  | "manuskriptRaw"
> & {
  ideeKurz?: string;
  alterLabel?: string;
  /** Prefer continuous prose when outline is thin. */
  manuskriptText?: string;
  extraInstruction?: string;
  /** When true, skip Nunito title overlay (raw Flux only). */
  skipTitleOverlay?: boolean;
};

export type RomanCoverGenerateResult = {
  dataUrl: string;
  sceneDescription: string;
  promptUsed: string;
};

/**
 * Gemini scene → Flux 1200×1920 → Mistral title lines → dominant Nunito overlay.
 */
export async function generateRomanCover(
  input: RomanCoverGenerateInput,
): Promise<RomanCoverGenerateResult> {
  const outlineOrProse =
    input.manuskriptRaw.trim().length >= 40
      ? input.manuskriptRaw
      : (input.manuskriptText ?? "");
  const hasMaterial =
    outlineOrProse.trim().length >= 40 ||
    input.praemisse.trim().length >= 20 ||
    (input.ideeKurz ?? "").trim().length >= 40 ||
    input.genre.trim().length >= 2;
  if (!hasMaterial) {
    throw new Error(
      "Für ein Cover brauchst du Idee, Prämisse, Manuskript oder zumindest ein Genre.",
    );
  }

  const [textModel, imagesModel] = await Promise.all([
    resolveRomanTextModel(),
    resolveRomanImagesModel(),
  ]);

  const plan = buildRomanCoverScenePlanPrompt({
    ...input,
    manuskriptRaw: outlineOrProse,
  });
  const sceneRaw = await generateText({
    model: textModel,
    systemInstruction: plan.systemInstruction,
    userText: plan.userText,
  });
  const sceneDescription = sceneRaw
    .trim()
    .replace(/^["'`]+|["'`]+$/g, "")
    .trim();
  if (!sceneDescription) {
    throw new Error("Gemini hat keine Cover-Szene geliefert.");
  }

  const promptUsed = buildRomanCoverFluxPrompt(sceneDescription);
  const result = await generateImage({
    model: imagesModel,
    prompt: promptUsed,
    sizePx: 1024,
    aspectRatio: "5:8",
    outputFormat: "png",
  });

  const title = input.title.trim();
  let dataUrl = result.dataUrl;
  if (!input.skipTitleOverlay && title) {
    const lines = await planCoverTitleLines(title);
    dataUrl = await overlayExactAngleTextOnImage({
      imageDataUrl: result.dataUrl,
      overlayText: lines.join("\n"),
      style: "cover-title",
    });
  }

  const debugPrompt = `— Gemini Szene —\n${sceneDescription}\n\n— FLUX Prompt —\n${promptUsed}`;

  return {
    dataUrl,
    sceneDescription,
    promptUsed: debugPrompt,
  };
}
