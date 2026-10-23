/**
 * Cover generation for Sachbuch: gpt-image-2.5-sunburst,
 * 1600×2400 JPEG RGB @ 300 ppi (canonical {@link ROMAN_COVER_SIZE}).
 */

import { generateOpenAiImage } from "@/lib/ai/openai-images";
import { ensureRomanCoverExactSize } from "@/lib/roman/cover-compress";
import {
  ROMAN_COVER_GENERATE_SIZE,
  romanCoverSizeLabel,
} from "@/lib/roman/cover-size";
import { SACHBUCH_COVER_MODEL_SLUG } from "@/lib/sachbuch/agent-defaults";
import { getSachbuchBookType } from "@/lib/sachbuch/book-types";
import { assertSachbuchGuideAllows } from "@/lib/sachbuch/guide";
import {
  getSachbuchKontext,
  upsertSachbuchExport,
} from "@/lib/sachbuch/repository";
import type { SachbuchKontext } from "@/lib/sachbuch/types";

/**
 * Bold nonfiction cover from Klappentext / UVP.
 * No title typography on the image — Titelei is separate.
 */
export function buildSachbuchCoverPrompt(input: {
  title: string;
  summary: string;
  bookTypeLabel: string;
  zielgruppe?: string;
}): string {
  return [
    `Bold commercial nonfiction book cover illustration, full-bleed portrait ${romanCoverSizeLabel()}.`,
    `Category: German Sachbuch / ${input.bookTypeLabel || "business / self-help"}.`,
    input.zielgruppe ? `Audience vibe: ${input.zielgruppe}.` : "",
    "Style: courageous, high-impact, cinematic lighting, strong focal metaphor, premium trade-paperback look.",
    "NO text, NO letters, NO title, NO author name, NO logos, NO barcodes, NO UI chrome.",
    "RGB color, photographic or painted realism with graphic punch — not pastel, not clipart.",
    `Book essence to visualize:\n${input.summary.trim().slice(0, 1_200)}`,
    `Working title (do not paint as text): ${input.title}`,
  ]
    .filter(Boolean)
    .join("\n");
}

export async function generateSachbuchCoverImage(
  book: SachbuchKontext,
): Promise<{ dataUrl: string; prompt: string; modelSlug: string }> {
  const summary =
    book.export.summary.trim() ||
    book.idee.unpopularOpinion.trim() ||
    book.idee.briefing.trim().slice(0, 1_200);
  if (summary.length < 40) {
    throw new Error(
      "Zuerst eine Zusammenfassung erzeugen (Export → Texte generieren).",
    );
  }
  const bookType = getSachbuchBookType(book.makro.bookTypeId);
  const title =
    book.export.suggestedTitle.trim() ||
    book.title.trim() ||
    "Sachbuch";
  const prompt = buildSachbuchCoverPrompt({
    title,
    summary,
    bookTypeLabel: bookType?.shortLabel ?? bookType?.name ?? book.makro.typ,
    zielgruppe: book.zielgruppe,
  });

  const result = await generateOpenAiImage({
    modelSlug: SACHBUCH_COVER_MODEL_SLUG,
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

/** Generate cover and persist on sachbuch_kontext. */
export async function runSachbuchCoverGenerate(
  sachbuchId: string,
): Promise<SachbuchKontext> {
  const book = await getSachbuchKontext(sachbuchId);
  if (!book) throw new Error("Sachbuch nicht gefunden.");
  assertSachbuchGuideAllows(book, "export");
  const cover = await generateSachbuchCoverImage(book);
  return upsertSachbuchExport({
    id: sachbuchId,
    coverImageDataUrl: cover.dataUrl,
    coverPrompt: cover.prompt,
  });
}
