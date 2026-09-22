/**
 * Roman book-cover pipeline:
 * Art director (visual, no text) → Gemini 3 Pro Image artwork →
 * Marketing typography brief → exact title overlay
 * (Nunito ExtraBold primary + Bold secondary/eyebrow; soft vignette, no banner bar).
 */

import { generateImage } from "@/lib/ai/generate-image";
import {
  FLUX_NO_TEXT_BLOCK,
  sanitizeFluxStyleCue,
  sanitizeFluxVisualCue,
} from "@/lib/ai/flux-prompt-guards";
import { generateText } from "@/lib/ai/provider";
import { parseModelJsonObject } from "@/lib/ai/parse-model-json";
import {
  resolveRomanCoverImagesModel,
  resolveRomanLayoutModel,
  resolveRomanTextModel,
} from "@/lib/roman/model";
import { compressCoverDataUrl } from "@/lib/roman/cover-compress";
import { ROMAN_COVER_SIZE } from "@/lib/roman/cover-size";
import {
  defaultCoverTitleDesign,
  normalizeCoverTitleLines,
  overlayCoverTitleByDesign,
  stripTitleLeakFromScene,
  type CoverTitleAlign,
  type CoverTitleDesign,
  type CoverTitleScrim,
  type CoverTitleSize,
  type CoverTitleTone,
  type CoverTitleZone,
} from "@/lib/roman/cover-title-overlay";
import type { RomanCharakter, RomanKontext } from "@/lib/roman/types";

export { ROMAN_COVER_SIZE } from "@/lib/roman/cover-size";

const MAX_MANUSCRIPT_FOR_SCENE = 10_000;

/** Trade / YA / children’s fiction covers — not the kids-app story style lock. */
const COVER_STYLE_LOCK = [
  "Professional trade-fiction book cover design for the German market",
  "Looks like a finished cover from a major house imprint — not a stock photo, not a generic AI collage",
  "Cinematic, emotionally charged illustration or graphic design with a clear hero focal point",
  "Color, motif and finish tuned to genre AND reader age — and also irresistible to the parents who buy",
  "Premium bookstore shelf presence: high contrast, memorable silhouette, scroll-stopping thumbnail",
  "When the brief asks for Pixar / 3D animation: high-end animated-feature look with expressive characters — not flat clipart; otherwise illustrated or painterly cover art — not a photograph",
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
 * Gemini plans the illustration only (title is composited later from a type brief).
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
  const title = input.title.trim() || "(untitled)";

  const systemInstruction = `You are a senior cover art director at a German trade publisher (Romane / Jugendbuch / altersgerechte Belletristik).
Your concepts are reviewed and signed off by an acquisitions / marketing publisher before production.
You brief a professional cover illustrator — not a hobbyist, not a stock-image prompt.

Goal: ONE cover IMAGE concept that is a marketing smash hit — it must fascinate the target age group AND their parents (who decide and buy). Instant shelf/click desire.

Hard rules:
- English only; image brief only — no markdown, no quotes wrapping the whole answer.
- Purely visual: mood, setting, key symbolic object or figure silhouette, lighting, COLOR PALETTE, composition.
- ZERO text/letters/numbers/signs/logos/UI/title on the image — typography is added later by design in a separate overlay pass.
- Design freedom for composition: YOU choose where the calm area for the later title should live (top / upper / center / lower / bottom). Prefer lower/bottom when unsure. Leave quiet pictorial space — NEVER paint a dark header bar, gradient strip, banner, UI chrome, or dimmed slab across the top for the title. The type layer must sit on the illustration itself, not on a fake panel.
- Motif AND palette must fit genre AND Altersklasse — and still feel premium to parents (trust, quality, “I’d gift this”).
- Match the book's Kernaussage / premise — not a generic genre cliché.
- Compose for a tall portrait eBook cover exactly 1200×1920 px (5:8), full-bleed.
- Do not invent spoilers that contradict the premise; stay faithful to the book's world.
- About 90–160 words.
- Finish: follow the brief’s art style (including Pixar / 3D animation when asked) — not a photograph, not flat clipart.
- Mention briefly where the title will sit later (e.g. “title zone: lower third, center”) so the illustrator protects open pictorial space there — without darkening it into a bar.`;

  let manuskript = input.manuskriptRaw.trim();
  if (manuskript.length > MAX_MANUSCRIPT_FOR_SCENE) {
    manuskript = `${manuskript.slice(0, MAX_MANUSCRIPT_FOR_SCENE)}\n\n[… truncated …]`;
  }

  const chars = formatCharBrief(input.charaktere);
  const extra = input.extraInstruction?.trim();
  const idee = (input.ideeKurz ?? "").trim().slice(0, 4_000);

  const userText = `Brief the cover artwork as a publisher-approved marketing hit (image only — no painted text).

# Working title (for context / title-zone planning only — do NOT write it in the image)
${title}

# Genre
${input.genre.trim() || "(unspecified)"}

# Reader age group (Altersklasse) + parent buyers
${input.alterLabel?.trim() || "(unspecified)"}
Design must excite this age AND feel like a premium, trustworthy buy for parents.

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
Write the image brief now: professional cover art, free composition, reserved calm title zone, genre-true and age-true, parent-appeal, absolutely no text.`;

  return { systemInstruction, userText };
}

/** Final Flux prompt: artwork only, hard no-text (strip title leaks). */
export function buildRomanCoverFluxPrompt(
  sceneDescription: string,
  title = "",
  styleMandate = "",
): string {
  const cleanedScene = stripTitleLeakFromScene(sceneDescription, title);
  const scene =
    sanitizeFluxVisualCue(cleanedScene, 1_100) ||
    "Atmospheric literary book-cover scene, strong focal silhouette, moody premium light";
  const style = sanitizeFluxStyleCue(styleMandate, 1_000);

  return [
    COVER_STYLE_LOCK,
    style
      ? `MANDATORY ART STYLE (follow literally): ${style}.`
      : "",
    FLUX_NO_TEXT_BLOCK,
    `Scene / design brief: ${scene}.`,
    "Portrait full-bleed eBook cover 1200×1920 (5:8), edge-to-edge illustration, leave a calm readable area for a later title overlay (placement per brief).",
    FLUX_NO_TEXT_BLOCK,
  ]
    .filter(Boolean)
    .join(" ");
}

function asZone(v: unknown): CoverTitleZone {
  const s = String(v ?? "").toLowerCase();
  if (s === "top" || s === "upper" || s === "center" || s === "lower") {
    return s;
  }
  return "bottom";
}

function asAlign(v: unknown): CoverTitleAlign {
  const s = String(v ?? "").toLowerCase();
  if (s === "left" || s === "right") return s;
  return "center";
}

function asSize(_v: unknown): CoverTitleSize {
  // Marketing covers always render hero; planner compact/standard is ignored.
  return "hero";
}

function asTone(v: unknown): CoverTitleTone {
  const s = String(v ?? "").toLowerCase();
  if (s === "light" || s === "dark") return s;
  return "auto";
}

function asScrim(v: unknown): CoverTitleScrim {
  const s = String(v ?? "").toLowerCase();
  if (s === "none" || s === "strong") return s;
  return "soft";
}

/**
 * Senior typographer + publisher QC: hierarchy only; spelling locked to title.
 */
async function planCoverTitleDesign(input: {
  title: string;
  genre: string;
  alterLabel?: string;
  sceneDescription: string;
}): Promise<CoverTitleDesign> {
  const clean = input.title.trim().replace(/\s+/g, " ");
  if (!clean) return defaultCoverTitleDesign("");

  try {
    const layoutModel = await resolveRomanLayoutModel();
    const raw = await generateText({
      model: layoutModel,
      preferJson: true,
      maxTokens: 500,
      timeoutMs: 45_000,
      systemInstruction: `You are a marketing-driven cover typographer for German trade / YA / children's knowledge series covers.
Glyphs are composited later in Nunito (ExtraBold primary, Bold for secondary/eyebrow — never lighter than Bold) — friendly rounded shelf energy, NOT old soft-serif book type and NOT childish sticker chrome.
You ONLY plan hierarchy, placement, tone, scrim. You NEVER invent or respell the title.

Return ONLY JSON:
{
  "lines": [
    { "text": "...", "role": "eyebrow"|"primary"|"secondary" }
  ],
  "zone": "top"|"upper"|"center"|"lower"|"bottom",
  "align": "left"|"center"|"right",
  "size": "compact"|"standard"|"hero",
  "tone": "light"|"dark"|"auto",
  "scrim": "none"|"soft"|"strong",
  "publisherNote": "one short QC sentence on modern shelf impact"
}

Hard rules:
- Concatenating line texts with spaces MUST equal the exact title (same words, same order). Keep punctuation attached as in the title (e.g. trailing colon on the series line).
- Exactly ONE line with role "primary". Other lines: eyebrow and/or secondary.
- SERIES TITLES with a colon (e.g. "Clever erzählt: Wald & Bäume"):
  - Everything BEFORE the colon (including the colon) = ONE eyebrow line — quiet series label.
  - Everything AFTER the colon = the TOPIC and must dominate the cover.
  - First strong topic noun is primary (e.g. "Wald"). Lines that start with "&" / "und" are secondary — NEVER primary.
  - Topic pair lines ("Wald" + "& Bäume") should feel like one title unit (primary slightly larger than secondary), never put the series and the first topic word at the same small size.
- NEVER equal visual weight across series vs topic — series is small; topic is huge.
- Prefer 2–3 short lines when the title has 3+ words so EACH topic line can be huge; one line only for 1–2 word titles.
- ALWAYS set size to "hero". Never "compact". Thumbnail readability beats clever micro type.
- Prefer zone "lower" or "bottom" (or "center" when art clearly opens there). Avoid "top"/"upper" unless the artwork truly demands it.
- Contrast comes from the type itself (opaque halo). Default scrim to "none". Never plan a header bar. Only allow "soft"/"strong" for a subtle bottom fade when type sits in the lower third on busy art.
- Prefer "light" tone (white type) on mid/dark fields.
- No author, no extra words, no ALL-CAPS unless the source title is already all caps.
- Modern geometric energy: big topic type, quiet series line, short lines.`,
      userText: `Exact title:\n${clean}

Genre: ${input.genre.trim() || "(unspecified)"}
Age group: ${input.alterLabel?.trim() || "(unspecified)"}

Art director scene brief (title zone hint):
${input.sceneDescription.slice(0, 2_500)}

Propose a modern series/topic typographic hierarchy now.`,
    });

    const parsed = parseModelJsonObject(raw) as Record<string, unknown>;
    const lines = normalizeCoverTitleLines(clean, parsed.lines);

    return {
      lines,
      zone: asZone(parsed.zone),
      align: asAlign(parsed.align),
      size: asSize(parsed.size),
      tone: asTone(parsed.tone),
      scrim: asScrim(parsed.scrim),
      publisherNote: String(parsed.publisherNote ?? "")
        .trim()
        .slice(0, 240),
    };
  } catch {
    return defaultCoverTitleDesign(clean);
  }
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
};

export type RomanCoverGenerateResult = {
  dataUrl: string;
  sceneDescription: string;
  promptUsed: string;
};

/**
 * Art direction → Gemini 3 Pro Image (no text) → publisher typography brief → title overlay.
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
    resolveRomanCoverImagesModel(),
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

  const title = input.title.trim();
  const styleMandate = [input.tonalitaet, input.extraInstruction]
    .map((s) => (s ?? "").trim())
    .filter(Boolean)
    .join(" ");
  const promptUsed = buildRomanCoverFluxPrompt(
    sceneDescription,
    title,
    styleMandate,
  );
  const result = await generateImage({
    model: imagesModel,
    prompt: promptUsed,
    sizePx: 2048,
    aspectRatio: "5:8",
    outputFormat: "jpeg",
  });

  let dataUrl = result.dataUrl;
  let design: CoverTitleDesign | null = null;
  if (title) {
    design = await planCoverTitleDesign({
      title,
      genre: input.genre,
      alterLabel: input.alterLabel,
      sceneDescription,
    });
    dataUrl = await overlayCoverTitleByDesign({
      imageDataUrl: result.dataUrl,
      design,
    });
  }

  // Compact JPEG — multi-MB PNG data URLs crash the IDE on Server Action save.
  dataUrl = await compressCoverDataUrl(dataUrl);

  const designBlock = design
    ? `\n\n— Typografie (Mistral Layout) —\n${JSON.stringify(design, null, 2)}`
    : "";

  const debugPrompt = `— Art Direction (Bild ohne Text) —\n${sceneDescription}\n\n— Image Prompt —\n${promptUsed}${designBlock}`;

  return {
    dataUrl,
    sceneDescription,
    promptUsed: debugPrompt,
  };
}
