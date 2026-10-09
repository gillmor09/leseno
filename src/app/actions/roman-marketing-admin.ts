"use server";

/**
 * Verkaufstexte (Klappentext + Einzeiler + Amazon-Keywords) + Titelei
 * (Titelseite, Copyright, Motto) — isolated from roman-admin.ts.
 */

import { z } from "zod";
import { denyUnlessAdmin } from "@/lib/auth/require-admin";
import {
  generateRomanMarketingCopy,
  normalizeAmazonKeywords,
} from "@/lib/roman/marketing-copy";
import {
  getRomanMarketingSource,
  patchRomanMarketingCopy,
  patchRomanVorsatzCopy,
} from "@/lib/roman/marketing-copy-store";
import {
  ROMAN_DEFAULT_AUTHOR,
  ROMAN_DEFAULT_IMPRINT,
  emptyBuchruecken,
  emptyVorsatz,
  generateRomanFrontMatter,
  mergeVorsatzFromUiFields,
  vorsatzToUiFields,
  type RomanVorsatzUiFields,
} from "@/lib/roman/front-matter";
import { revalidateRomanAdminLists } from "@/lib/roman/revalidate-admin";
import type { ActionResult } from "@/lib/types/actions";
import { firstZodMessage } from "@/lib/validations/roman-admin";

const generateSchema = z.object({
  romanId: z.string().uuid({ message: "Ungültige Roman-ID." }),
});

const vorsatzSaveSchema = z.object({
  titel: z.string().max(300),
  untertitel: z.string().max(400).optional().default(""),
  autor: z.string().max(200),
  imprint: z.string().max(200),
  copyrightHinweis: z.string().max(2_000),
  motto: z.string().max(1_200),
});

const saveSchema = z.object({
  romanId: z.string().uuid({ message: "Ungültige Roman-ID." }),
  klappentext: z.string().max(4_000),
  einzeiler: z.string().max(120),
  amazonKeywords: z.array(z.string().max(50)).max(7).default([]),
  vorsatz: vorsatzSaveSchema.optional(),
});

function alterLabelFromEditorial(ed: {
  zielAlterMin: number | null;
  zielAlterMax: number | null;
}): string {
  if (ed.zielAlterMin != null && ed.zielAlterMax != null) {
    return `${ed.zielAlterMin}–${ed.zielAlterMax} Jahre`;
  }
  if (ed.zielAlterMin != null) return `ab ${ed.zielAlterMin}`;
  if (ed.zielAlterMax != null) return `bis ${ed.zielAlterMax}`;
  return "";
}

export async function generateRomanMarketingCopyAction(
  input: unknown,
): Promise<
  ActionResult<{
    klappentext: string;
    einzeiler: string;
    amazonKeywords: string[];
    keywordsWarning?: string;
    autorName: string;
    vorsatz: RomanVorsatzUiFields;
  }>
> {
  const denied = await denyUnlessAdmin();
  if (denied) return { success: false, error: denied };

  const parsed = generateSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: firstZodMessage(parsed.error) };
  }

  try {
    const roman = await getRomanMarketingSource(parsed.data.romanId);
    if (!roman) {
      return { success: false, error: "Roman nicht gefunden." };
    }

    const prose = (roman.editorial.manuskriptText ?? "").trim();
    const previousKeywords = normalizeAmazonKeywords(
      roman.editorial.amazonKeywords ?? [],
    );
    const copy = await generateRomanMarketingCopy({
      title: roman.title,
      genre: roman.genre,
      praemisse: roman.praemisse,
      tonalitaet: roman.tonalitaet,
      ideeKurz: roman.editorial.ideeKurz ?? "",
      alterLabel: alterLabelFromEditorial(roman.editorial),
      charaktere: roman.charaktere,
      manuskriptExcerpt: prose || roman.manuskriptRaw,
      cleverUnterthemen: roman.editorial.cleverUnterthemen ?? null,
      buchTyp: roman.editorial.buchTyp ?? "unbekannt",
    });

    // Keep stored keywords when this run failed — do not wipe them with [].
    const amazonKeywords = copy.amazonKeywords.length
      ? copy.amazonKeywords
      : previousKeywords;

    await patchRomanMarketingCopy({
      id: roman.id,
      klappentext: copy.klappentext,
      einzeiler: copy.einzeiler,
      amazonKeywords,
    });

    const front = await generateRomanFrontMatter({
      title: roman.title,
      autorName: ROMAN_DEFAULT_AUTHOR,
      genre: roman.genre,
      praemisse: roman.praemisse || roman.editorial.ideeKurz || "",
      tonalitaet: roman.tonalitaet,
      manuskriptRaw: prose || roman.manuskriptRaw,
      aktuelleZusammenfassung: roman.editorial.ideeKurz ?? "",
    });

    if (!front.vorsatz.titelseite.titel.trim()) {
      front.vorsatz.titelseite.titel =
        roman.title.trim() || "Unbenannter Roman";
    }
    const buchruecken = {
      ...emptyBuchruecken(),
      ...front.buchruecken,
      autorZeile: ROMAN_DEFAULT_AUTHOR,
      verlagZeile: ROMAN_DEFAULT_IMPRINT,
    };

    await patchRomanVorsatzCopy({
      id: roman.id,
      autorName: ROMAN_DEFAULT_AUTHOR,
      buchruecken,
      vorsatz: front.vorsatz,
    });

    revalidateRomanAdminLists();

    return {
      success: true,
      data: {
        klappentext: copy.klappentext,
        einzeiler: copy.einzeiler,
        amazonKeywords,
        keywordsWarning: copy.keywordsWarning,
        autorName: ROMAN_DEFAULT_AUTHOR,
        vorsatz: vorsatzToUiFields(front.vorsatz, roman.title),
      },
    };
  } catch (error) {
    console.error("[generateRomanMarketingCopyAction]", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Marketing-Text fehlgeschlagen.",
    };
  }
}

export async function saveRomanMarketingCopyAction(
  input: unknown,
): Promise<ActionResult<{ saved: boolean }>> {
  const denied = await denyUnlessAdmin();
  if (denied) return { success: false, error: denied };

  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: firstZodMessage(parsed.error) };
  }

  try {
    await patchRomanMarketingCopy({
      id: parsed.data.romanId,
      klappentext: parsed.data.klappentext,
      einzeiler: parsed.data.einzeiler,
      amazonKeywords: normalizeAmazonKeywords(parsed.data.amazonKeywords),
    });

    if (parsed.data.vorsatz) {
      const roman = await getRomanMarketingSource(parsed.data.romanId);
      if (!roman) throw new Error("Roman nicht gefunden.");
      const previous = roman.vorsatz ?? emptyVorsatz();
      const vorsatz = mergeVorsatzFromUiFields(previous, {
        titel: parsed.data.vorsatz.titel,
        untertitel: parsed.data.vorsatz.untertitel ?? "",
        autor: parsed.data.vorsatz.autor,
        imprint: parsed.data.vorsatz.imprint,
        copyrightHinweis: parsed.data.vorsatz.copyrightHinweis,
        motto: parsed.data.vorsatz.motto,
      });
      const buchruecken = {
        ...(roman.buchruecken ?? emptyBuchruecken()),
        autorZeile: vorsatz.titelseite.autor,
        verlagZeile: vorsatz.titelseite.imprint,
        titelKurz:
          (roman.buchruecken?.titelKurz ?? "").trim() ||
          vorsatz.titelseite.titel.slice(0, 40),
      };
      await patchRomanVorsatzCopy({
        id: parsed.data.romanId,
        autorName: vorsatz.titelseite.autor,
        buchruecken,
        vorsatz,
      });
    }

    revalidateRomanAdminLists();
    return { success: true, data: { saved: true } };
  } catch (error) {
    console.error("[saveRomanMarketingCopyAction]", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Verkaufstexte speichern fehlgeschlagen.",
    };
  }
}
