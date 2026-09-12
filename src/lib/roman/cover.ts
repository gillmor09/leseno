/**
 * Roman book-cover pipeline: Gemini 3.8 scene brief → Flux pixels → title overlay.
 * Same two-step pattern as social images; literary cover style (not kids brand).
 */

import { generateImage } from "@/lib/ai/generate-image";
import {
  FLUX_ILLUSTRATION_STYLE_LOCK,
  FLUX_NO_TEXT_BLOCK,
  sanitizeFluxVisualCue,
} from "@/lib/ai/flux-prompt-guards";
import { generateText } from "@/lib/ai/provider";
import {
  resolveRomanImagesModel,
  resolveRomanTextModel,
} from "@/lib/roman/model";
import { overlayExactAngleTextOnImage } from "@/lib/social/overlay-angle-text";
import type { RomanCharakter, RomanKontext } from "@/lib/roman/types";

const MAX_MANUSCRIPT_FOR_SCENE = 10_000;

const COVER_STYLE_LOCK = [
  FLUX_ILLUSTRATION_STYLE_LOCK,
  "Literary adult fiction book-cover artwork, cinematic atmosphere, premium publishing aesthetic",
  "Painterly digital illustration, evocative mood lighting, strong focal subject",
  "Not a children's book illustration, not cute cartoon, not stock photo, not photoreal CGI",
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
 * Gemini plans one English cover scene from manuscript + foundation (no on-image text).
 */
export function buildRomanCoverScenePlanPrompt(input: {
  title: string;
  genre: string;
  praemisse: string;
  tonalitaet: string;
  weltSchauplaetze: string;
  charaktere: RomanCharakter[];
  manuskriptRaw: string;
  extraInstruction?: string;
}): { systemInstruction: string; userText: string } {
  const systemInstruction = `You are a senior art director for adult fiction book covers (German trade publishing).
Your job: turn manuscript/foundation notes into ONE detailed image brief for a Flux pixel model.

Hard rules:
- English only; image brief only — no markdown, no quotes around the whole answer.
- Purely visual cover concept: mood, setting, key symbolic object or figure silhouette, lighting, color atmosphere.
- Match the genre and tonality (e.g. thriller → tense shadows; romance → warmth; fantasy → wonder).
- ZERO text/letters/numbers/signs/logos/UI/title on the image (title is added later in code).
- Leave a slightly calmer lower third for a later title overlay.
- Compose for a tall portrait eBook cover (Amazon 1600×2560 / 5:8), full-bleed, not square.
- Do not invent spoilers that contradict the premise; stay faithful to the book's world.
- About 80–160 words.
- Illustrated / painterly — not a photograph.`;

  let manuskript = input.manuskriptRaw.trim();
  if (manuskript.length > MAX_MANUSCRIPT_FOR_SCENE) {
    manuskript = `${manuskript.slice(0, MAX_MANUSCRIPT_FOR_SCENE)}\n\n[… manuscript truncated …]`;
  }

  const chars = formatCharBrief(input.charaktere);
  const extra = input.extraInstruction?.trim();

  const userText = `Plan the book-cover illustration.

# Working title
${input.title.trim() || "(untitled)"}

# Genre
${input.genre.trim() || "(unspecified)"}

# Premise / logline
${input.praemisse.trim() || "(none)"}

# Tonality & style
${input.tonalitaet.trim() || "(unspecified)"}

# Key places (sensory)
${input.weltSchauplaetze.trim() || "(none)"}

# Characters
${chars || "(none listed)"}

# Manuscript / outline excerpt
${manuskript || "(empty — invent from premise/genre only)"}

${extra ? `# Extra art direction\n${extra}\n` : ""}
Write the image brief now: cinematic literary cover, genre-true, absolutely no text.`;

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
    "Portrait full-bleed eBook cover composition (Amazon Kindle ratio 5:8 / 1600×2560), edge-to-edge illustration, slightly calmer lower third for title overlay.",
    FLUX_NO_TEXT_BLOCK,
  ].join(" ");
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
 * Gemini scene → Flux image → optional title overlay (Arbeitstitel).
 */
export async function generateRomanCover(
  input: RomanCoverGenerateInput,
): Promise<RomanCoverGenerateResult> {
  const hasMaterial =
    input.manuskriptRaw.trim().length >= 40 ||
    input.praemisse.trim().length >= 20 ||
    input.genre.trim().length >= 2;
  if (!hasMaterial) {
    throw new Error(
      "Für ein Cover brauchst du Manuskript, Prämisse oder zumindest ein Genre.",
    );
  }

  const [textModel, imagesModel] = await Promise.all([
    resolveRomanTextModel(),
    resolveRomanImagesModel(),
  ]);

  const plan = buildRomanCoverScenePlanPrompt(input);
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
  const dataUrl =
    input.skipTitleOverlay || !title
      ? result.dataUrl
      : await overlayExactAngleTextOnImage({
          imageDataUrl: result.dataUrl,
          overlayText: title,
          style: "winkel",
        });

  const debugPrompt = `— Gemini Szene —\n${sceneDescription}\n\n— FLUX Prompt —\n${promptUsed}`;

  return {
    dataUrl,
    sceneDescription,
    promptUsed: debugPrompt,
  };
}
