/**
 * Cover generation for greenfield novels: gpt-image-2.5-sunburst,
 * 1600×2400 JPEG RGB @ 300 ppi (canonical {@link ROMAN_COVER_SIZE}).
 */

import { generateOpenAiImage } from "@/lib/ai/openai-images";
import { ensureRomanCoverExactSize } from "@/lib/roman/cover-compress";
import {
  ROMAN_COVER_GENERATE_SIZE,
  romanCoverSizeLabel,
} from "@/lib/roman/cover-size";
import type { NovelBundle } from "@/lib/novel/types";

export const NOVEL_COVER_MODEL_SLUG = "gpt-image-2.5-sunburst";

/**
 * Bold genre-faithful cover from summary (not the full manuscript).
 * No title typography on the image — PDF/ePub add Titelei separately.
 */
export function buildNovelCoverPrompt(input: {
  title: string;
  summary: string;
  genre: string;
  subgenre?: string;
  tone?: string;
}): string {
  const genreLine = [input.genre, input.subgenre].filter(Boolean).join(" / ");
  return [
    `Bold commercial fiction book cover illustration, full-bleed portrait ${romanCoverSizeLabel()}.`,
    `Genre: ${genreLine || "literary fiction"}.`,
    input.tone ? `Mood / tone: ${input.tone}.` : "",
    "Style: courageous, high-impact, cinematic lighting, strong focal subject, premium trade-paperback look.",
    "NO text, NO letters, NO title, NO author name, NO logos, NO barcodes, NO UI chrome.",
    "RGB color, photographic or painted realism with graphic punch — not pastel, not clipart.",
    `Story essence to visualize:\n${input.summary.trim().slice(0, 1_200)}`,
    `Working title (do not paint as text): ${input.title}`,
  ]
    .filter(Boolean)
    .join("\n");
}

export async function generateNovelCoverImage(
  bundle: NovelBundle,
): Promise<{ dataUrl: string; prompt: string; modelSlug: string }> {
  const summary =
    bundle.novel.summary.trim() ||
    bundle.novel.highConceptIdea.trim().slice(0, 1_200);
  if (summary.length < 40) {
    throw new Error(
      "Zuerst eine Zusammenfassung erzeugen (Export → Texte generieren).",
    );
  }
  const prompt = buildNovelCoverPrompt({
    title: bundle.novel.title,
    summary,
    genre: bundle.styleGuide?.genre ?? "",
    subgenre: bundle.styleGuide?.subgenre,
    tone: bundle.styleGuide?.primaryTone,
  });

  const result = await generateOpenAiImage({
    modelSlug: NOVEL_COVER_MODEL_SLUG,
    prompt,
    size: ROMAN_COVER_GENERATE_SIZE,
    quality: "high",
    outputFormat: "jpeg",
  });

  const dataUrl = await ensureRomanCoverExactSize(result.dataUrl);
  return {
    dataUrl,
    prompt,
    modelSlug: result.modelSlug,
  };
}
