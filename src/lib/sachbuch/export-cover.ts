/**
 * Cover generation for Sachbuch: gpt-image-2.5-sunburst,
 * 1600×2400 JPEG RGB @ 300 ppi (canonical {@link ROMAN_COVER_SIZE}).
 * Art has no painted letters; title + subtitle are composited (trade overlay).
 */

import { generateOpenAiImage } from "@/lib/ai/openai-images";
import { ensureRomanCoverExactSize } from "@/lib/roman/cover-compress";
import { coverFontFamilyForGenre } from "@/lib/roman/cover-fonts";
import {
  ROMAN_COVER_GENERATE_SIZE,
  romanCoverSizeLabel,
} from "@/lib/roman/cover-size";
import {
  defaultCoverTitleDesign,
  overlayCoverTitleByDesign,
} from "@/lib/roman/cover-title-overlay";
import { SACHBUCH_COVER_MODEL_SLUG } from "@/lib/sachbuch/agent-defaults";
import { getSachbuchBookType } from "@/lib/sachbuch/book-types";
import { assertSachbuchGuideAllows } from "@/lib/sachbuch/guide";
import {
  getSachbuchKontext,
  upsertSachbuchExport,
} from "@/lib/sachbuch/repository";
import type { SachbuchKontext } from "@/lib/sachbuch/types";

/**
 * Bold nonfiction art from Klappentext / UVP.
 * Leave a calm lower third — title/subtitle are overlaid in code (readable type).
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
    "Composition: keep the lower third relatively calm and uncluttered so typography can sit on it later.",
    "NO text, NO letters, NO title, NO subtitle, NO author name, NO logos, NO barcodes, NO UI chrome.",
    "RGB color, photographic or painted realism with graphic punch — not pastel, not clipart.",
    `Book essence to visualize:\n${input.summary.trim().slice(0, 1_200)}`,
    `Working title (mood only — do not paint as letters): ${input.title}`,
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

  let dataUrl = await ensureRomanCoverExactSize(result.dataUrl);
  const subtitle = book.export.subtitle.trim();
  const author = book.export.autorName.trim();
  const fontFamily = coverFontFamilyForGenre(
    `${bookType?.name ?? book.makro.typ} Wirtschaft Business`,
    book.zielgruppe,
  );
  dataUrl = await overlayCoverTitleByDesign({
    imageDataUrl: dataUrl,
    design: defaultCoverTitleDesign(title, fontFamily),
    author: author || undefined,
    subtitle: subtitle || undefined,
    lesenoMark: true,
  });
  dataUrl = await ensureRomanCoverExactSize(dataUrl);
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
