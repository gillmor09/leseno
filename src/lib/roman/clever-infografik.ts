/**
 * Clever erzählt: one-shot chapter infographic (1200×1920).
 * Story → English image prompt → one image model paints motifs + German text.
 * Series Pixar art style is shared with the cover (`clever-visual-style.ts`).
 */

import { createCanvas, loadImage } from "@napi-rs/canvas";
import { generateImage } from "@/lib/ai/generate-image";
import { generateText } from "@/lib/ai/provider";
import { loadPromptAdminCatalog } from "@/lib/prompts/repository";
import type { AiModelConfig } from "@/lib/prompts/catalog";
import { compressCoverDataUrl } from "@/lib/roman/cover-compress";
import { ROMAN_COVER_SIZE } from "@/lib/roman/cover-size";
import { buildCleverMandatoryArtStyleBlock, wrapCleverSeriesImagePrompt } from "@/lib/roman/clever-visual-style";
import type {
  CleverUnterthemaKapitel,
  RomanEditorial,
} from "@/lib/roman/editorial";
import { emptyRomanEditorial } from "@/lib/roman/editorial";
import { parsePlotChapters } from "@/lib/roman/plot-chapters";
import { resolveRomanKiRolle } from "@/lib/roman/roles";

export const CLEVER_INFOGRAFIK_SIZE = ROMAN_COVER_SIZE;

const IMAGE_MODEL_SLUG = "gemini-3.1-flash-image";
const MAX_STORY_CHARS = 3_500;

const GERMAN_TEXT_LOCK = `

LANGUAGE LOCK (mandatory): German children's book page. Every readable word MUST be German (Deutsch) only. Prefer short clear German labels. Zero English words on the image.`;

/**
 * Painted labels must stay off the trim. Image models otherwise hug the edges.
 * ~8% quiet border on every side of the 1200×1920 canvas.
 */
const TEXT_SAFE_MARGIN_LOCK = `

TEXT SAFE MARGIN (mandatory): Keep every letter, number, caption, and label at least 8% of the canvas away from ALL four edges (top, right, bottom, left). Leave a clean quiet border with no text. Do not let words touch or nearly touch the frame. Motifs may approach the edge; readable text may not.`;

async function resolveInfografikImageModel(
  roleImageModel: AiModelConfig | null,
): Promise<AiModelConfig> {
  if (roleImageModel?.isActive) {
    return roleImageModel;
  }
  try {
    const catalog = await loadPromptAdminCatalog({ mergeFallback: true });
    const hit = catalog.models.find(
      (m) => m.modelSlug === IMAGE_MODEL_SLUG && m.isActive,
    );
    if (hit) return hit;
  } catch {
    // fall through
  }
  return {
    id: "clever-infografik-image",
    label: "Gemini 3.1 Flash Image",
    provider: "gemini-image",
    modelSlug: IMAGE_MODEL_SLUG,
    supportsSystemPrompt: false,
    supportsJsonOutput: false,
    isActive: true,
    ttsVoiceId: null,
    notes: "Clever erzählt Kapitel-Infografiken",
  };
}

function parseDataUrl(dataUrl: string): Buffer {
  const m = /^data:image\/[a-zA-Z0-9+.-]+;base64,([\s\S]+)$/.exec(
    dataUrl.trim(),
  );
  if (!m?.[1]) throw new Error("Ungültige Infografik (data URL).");
  return Buffer.from(m[1], "base64");
}

async function normalizeInfografikToPageSize(
  dataUrl: string,
): Promise<string> {
  const { width: W, height: H } = CLEVER_INFOGRAFIK_SIZE;
  const image = await loadImage(parseDataUrl(dataUrl));
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);
  // Equal quiet border so labels that hug the source edge still sit inset.
  const pad = Math.round(W * 0.055);
  const innerW = W - pad * 2;
  const innerH = H - pad * 2;
  const scale = Math.min(innerW / image.width, innerH / image.height);
  const dw = image.width * scale;
  const dh = image.height * scale;
  const x = pad + (innerW - dw) / 2;
  const y = pad + (innerH - dh) / 2;
  ctx.drawImage(image, x, y, dw, dh);
  const out = canvas.toBuffer("image/jpeg", 88);
  return `data:image/jpeg;base64,${out.toString("base64")}`;
}

/** Story body for chapter if present in manuskript. */
export function storyBodyForKapitel(
  editorial: RomanEditorial | null | undefined,
  chapterNumber: number,
): string {
  const text = (editorial ?? emptyRomanEditorial()).manuskriptText ?? "";
  return (
    parsePlotChapters(text).find((c) => c.number === chapterNumber)?.body ?? ""
  );
}

/**
 * One-shot: story → image prompt → one painted infographic (German text in pixels).
 */
export async function generateCleverKapitelInfografik(input: {
  thema: string;
  editorial: RomanEditorial;
  kapitel: CleverUnterthemaKapitel;
  storyBody?: string;
  /** Book tonality — same Pixar/series cues as Cover. */
  tonalitaet?: string;
}): Promise<{
  kapitel: CleverUnterthemaKapitel;
  imagePrompt: string;
  designerModelLabel: string;
  imageModelLabel: string;
}> {
  const story = (input.storyBody ?? "").trim().replace(/\s+/g, " ");
  if (story.length < 80) {
    throw new Error(
      `Infografik Kapitel ${input.kapitel.nummer}: zuerst die Geschichte schreiben (zu wenig Text).`,
    );
  }

  const { rolle, model: designerModel, imageModel: roleImageModel } =
    await resolveRomanKiRolle("clever_infografiker");
  const alter =
    input.editorial.zielAlterMin != null &&
    input.editorial.zielAlterMax != null
      ? `${input.editorial.zielAlterMin}–${input.editorial.zielAlterMax}`
      : "8–12";

  const storySlice = story.slice(0, MAX_STORY_CHARS);
  const tonalitaet = (input.tonalitaet ?? "").trim();

  const userText = `# Aufgabe
Schreibe EINEN englischen Bildprompt für eine fertige ganzseitige Kinder-Infografik (1200×1920, 5:8).
Das Bildmodell soll Motive UND deutschen Text in einem Schritt malen.
Art style ist SERIEN-WEIT gesperrt (three-dimensional CGI / Disney-Pixar feature quality) — du planst nur Inhalt + Layout + deutsche Labels, keinen rivalisierenden Stil.

# Kapitel
${input.kapitel.nummer}. ${input.kapitel.titel}

# Geschichte (einzige Inhaltsquelle)
${storySlice}

${tonalitaet ? `# Buch-Tonalität (nur CGI-Stil verstärken, kein Medienwechsel)\n${tonalitaet}\n` : ""}
# Regeln
- Nur Inhalte aus dieser Geschichte — nichts erfinden, kein Buchthema als Extra-Stoff.
- 3–6 kurze deutsche Labels/Captions auf dem Bild (klar, groß, gut lesbar, nur Deutsch).
- TEXT-RAND: jeder Buchstabe mindestens 8% vom Rand entfernt (oben, rechts, unten, links). Kein Text in der Außenkante.
- CHARACTER ANCHOR: mindestens eine Figur mit lesbarem Gesicht und großen ausdrucksstarken Augen (kein reines Diagramm ohne Figur).
- Freundlich, hell, kindgerecht (${alter} Jahre); cinematic CGI lighting, soft saturated colors.
- Keine Logos, keine Marken, keine Fotorealistik, keine flache Clipart-/Editorial-Icons.
- LANGUAGE LOCK am Anfang und Ende: all on-image text German only.

# Ausgabe
Nur der Bildprompt (Inhalt + Labels + Layout), kein Markdown, keine Vorrede, keine Style-Bibel (die kommt aus dem Code).`;

  const designerPrompt = (
    await generateText({
      model: designerModel,
      systemInstruction: rolle.systemPrompt,
      userText,
      preferJson: false,
      maxTokens: 1_200,
      timeoutMs: 90_000,
    })
  )
    .trim()
    .replace(/^```[\s\S]*?\n/, "")
    .replace(/\n```$/, "")
    .trim();

  if (designerPrompt.length < 60) {
    throw new Error("Infografik-Designer lieferte keinen brauchbaren Prompt.");
  }

  const styleBlock = buildCleverMandatoryArtStyleBlock({
    tonalitaet,
    roleSystemPrompt: rolle.systemPrompt,
  });
  const imagePrompt = wrapCleverSeriesImagePrompt({
    styleBlock,
    contentBrief: designerPrompt.trim(),
    tailExtras: [GERMAN_TEXT_LOCK, TEXT_SAFE_MARGIN_LOCK],
  });

  const imageModel = await resolveInfografikImageModel(roleImageModel);
  const rendered = await generateImage({
    model: imageModel,
    prompt: imagePrompt,
    sizePx: 1024,
    aspectRatio: "5:8",
    outputFormat: "jpeg",
  });

  const pageSized = await normalizeInfografikToPageSize(rendered.dataUrl);
  const dataUrl = await compressCoverDataUrl(pageSized, 80);

  return {
    imagePrompt,
    designerModelLabel: designerModel.label,
    imageModelLabel: imageModel.label,
    kapitel: {
      ...input.kapitel,
      infografikDataUrl: dataUrl,
      infografikPrompt: imagePrompt.slice(0, 8_000),
      infografikGeneratedAt: new Date().toISOString(),
      infografikModelLabel: `${designerModel.label} → ${imageModel.label}`,
    },
  };
}
