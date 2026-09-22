"use server";

/**
 * Verkaufstexte (Klappentext + Einzeiler + Amazon-Keywords) — isolated from
 * roman-admin.ts so Turbopack/cover payload issues cannot break this path.
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
} from "@/lib/roman/marketing-copy-store";
import { revalidateRomanAdminLists } from "@/lib/roman/revalidate-admin";
import type { ActionResult } from "@/lib/types/actions";
import { firstZodMessage } from "@/lib/validations/roman-admin";

const generateSchema = z.object({
  romanId: z.string().uuid({ message: "Ungültige Roman-ID." }),
});

const saveSchema = z.object({
  romanId: z.string().uuid({ message: "Ungültige Roman-ID." }),
  klappentext: z.string().max(4_000),
  einzeiler: z.string().max(120),
  amazonKeywords: z.array(z.string().max(50)).max(7).default([]),
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

    await patchRomanMarketingCopy({
      id: roman.id,
      klappentext: copy.klappentext,
      einzeiler: copy.einzeiler,
      amazonKeywords: copy.amazonKeywords,
    });
    revalidateRomanAdminLists();

    return {
      success: true,
      data: {
        klappentext: copy.klappentext,
        einzeiler: copy.einzeiler,
        amazonKeywords: copy.amazonKeywords,
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
