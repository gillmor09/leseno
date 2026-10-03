"use server";

/**
 * Admin Buch der Woche: save week, set current, generate IG image + caption.
 */

import { revalidatePath } from "next/cache";
import { denyUnlessAdmin } from "@/lib/auth/require-admin";
import { generateBuchDerWocheIgPost } from "@/lib/buch-der-woche/compose-ig-post";
import {
  getBuchDerWocheEntry,
  getBuchDerWocheSettings,
  getCurrentBuchDerWocheEntry,
  listBuchDerWocheEntries,
  setBuchDerWocheCurrent,
  upsertBuchDerWocheEntry,
} from "@/lib/buch-der-woche/repository";
import { slugifyBuchDerWocheTitle } from "@/lib/buch-der-woche/slug";
import type { BuchDerWocheEntry } from "@/lib/buch-der-woche/types";
import { listRomanKontexte } from "@/lib/roman/repository";
import type { ActionResult } from "@/lib/types/actions";
import {
  buchDerWocheGenerateIgSchema,
  buchDerWocheSaveIgSchema,
  buchDerWocheSaveSchema,
  buchDerWocheSetCurrentSchema,
} from "@/lib/validations/buch-der-woche-admin";

function revalidateBuchDerWoche(slug?: string) {
  revalidatePath("/admin/buch-der-woche");
  revalidatePath("/buch-der-woche");
  if (slug) revalidatePath(`/buch-der-woche/${slug}`);
}

export type CleverRomanOption = {
  id: string;
  title: string;
  hasCover: boolean;
  /** Editorial one-liner — preferred Teaser-Headline default. */
  einzeiler: string;
  /** Editorial blurb — preferred Teaser-Lead default (trimmed). */
  klappentext: string;
};

export async function loadBuchDerWocheAdminAction(): Promise<
  ActionResult<{
    currentSlug: string | null;
    entries: BuchDerWocheEntry[];
    cleverRomans: CleverRomanOption[];
    currentEntry: BuchDerWocheEntry | null;
  }>
> {
  const denied = await denyUnlessAdmin();
  if (denied) return { success: false, error: denied };

  try {
    const [settings, entries, romans, currentEntry] = await Promise.all([
      getBuchDerWocheSettings(),
      listBuchDerWocheEntries(),
      listRomanKontexte(),
      getCurrentBuchDerWocheEntry(),
    ]);

    const cleverRomans: CleverRomanOption[] = romans
      .filter((r) => r.editorial.buchTyp === "clever_erzaehlt")
      .map((r) => ({
        id: r.id,
        title: r.title,
        hasCover: Boolean(r.hasCover),
        einzeiler: (r.editorial.einzeiler ?? "").trim(),
        klappentext: (r.editorial.klappentext ?? "").trim(),
      }))
      .sort((a, b) => a.title.localeCompare(b.title, "de"));

    return {
      success: true,
      data: {
        currentSlug: settings.currentSlug,
        entries,
        cleverRomans,
        currentEntry,
      },
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Buch der Woche konnte nicht geladen werden.",
    };
  }
}

export async function saveBuchDerWocheEntryAction(
  input: unknown,
): Promise<
  ActionResult<{
    entry: BuchDerWocheEntry;
    currentSlug: string | null;
    liveSince: string | null;
  }>
> {
  const denied = await denyUnlessAdmin();
  if (denied) return { success: false, error: denied };

  const parsed = buchDerWocheSaveSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Eingabe ungültig." };
  }

  try {
    const roman = (await listRomanKontexte()).find(
      (r) => r.id === parsed.data.romanId,
    );
    if (!roman || roman.editorial.buchTyp !== "clever_erzaehlt") {
      return { success: false, error: "Bitte ein Clever-erzählt-Buch wählen." };
    }

    const entry = await upsertBuchDerWocheEntry({
      slug: parsed.data.slug,
      romanId: parsed.data.romanId,
      teaserHeadline: parsed.data.teaserHeadline,
      teaserLead: parsed.data.teaserLead,
      setPublished: Boolean(parsed.data.setCurrent),
    });

    let settings = await getBuchDerWocheSettings();
    if (parsed.data.setCurrent) {
      settings = await setBuchDerWocheCurrent(entry.slug);
    }

    revalidateBuchDerWoche(entry.slug);
    return {
      success: true,
      data: {
        entry,
        currentSlug: settings.currentSlug,
        liveSince: settings.currentSlug ? settings.updatedAt : null,
      },
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Speichern fehlgeschlagen.",
    };
  }
}

export async function setBuchDerWocheCurrentAction(
  input: unknown,
): Promise<
  ActionResult<{ currentSlug: string | null; liveSince: string | null }>
> {
  const denied = await denyUnlessAdmin();
  if (denied) return { success: false, error: denied };

  const parsed = buchDerWocheSetCurrentSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Eingabe ungültig." };
  }

  try {
    const settings = await setBuchDerWocheCurrent(parsed.data.slug);
    revalidateBuchDerWoche(parsed.data.slug);
    return {
      success: true,
      data: {
        currentSlug: settings.currentSlug,
        liveSince: settings.currentSlug ? settings.updatedAt : null,
      },
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Aktuelles Buch konnte nicht gesetzt werden.",
    };
  }
}

export async function generateBuchDerWocheIgAction(
  input: unknown,
): Promise<
  ActionResult<{ imageDataUrl: string; caption: string; slug: string }>
> {
  const denied = await denyUnlessAdmin();
  if (denied) return { success: false, error: denied };

  const parsed = buchDerWocheGenerateIgSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Eingabe ungültig." };
  }

  try {
    const entry = await getBuchDerWocheEntry(parsed.data.slug);
    if (!entry) {
      return { success: false, error: "Eintrag fehlt — zuerst speichern." };
    }

    const { getRomanKontext } = await import("@/lib/roman/repository");
    const { collectExportChaptersFromEditorial } = await import(
      "@/lib/roman/export-roman-pdf"
    );
    const roman = await getRomanKontext(entry.romanId);
    if (!roman || roman.editorial.buchTyp !== "clever_erzaehlt") {
      return { success: false, error: "Clever-erzählt-Buch nicht gefunden." };
    }
    const cover = (roman.coverImageDataUrl ?? "").trim();
    if (!cover.startsWith("data:image/")) {
      return {
        success: false,
        error: "Cover fehlt — bitte im Clever-erzählt-Admin erzeugen.",
      };
    }

    const chapters = collectExportChaptersFromEditorial(roman.editorial);
    const teaserLead =
      entry.teaserLead.trim() ||
      roman.editorial.einzeiler.trim() ||
      `Kurzgeschichten aus „${roman.title.trim()}“.`;

    const { imageDataUrl, caption } = await generateBuchDerWocheIgPost({
      title: roman.title.trim() || entry.slug,
      teaserLead,
      chapterCount: chapters.length,
      coverImageDataUrl: cover,
    });

    return {
      success: true,
      data: { imageDataUrl, caption, slug: entry.slug },
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Instagram-Post konnte nicht erzeugt werden.",
    };
  }
}

export async function saveBuchDerWocheIgAction(
  input: unknown,
): Promise<ActionResult<{ entry: BuchDerWocheEntry }>> {
  const denied = await denyUnlessAdmin();
  if (denied) return { success: false, error: denied };

  const parsed = buchDerWocheSaveIgSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Eingabe ungültig." };
  }

  try {
    const existing = await getBuchDerWocheEntry(parsed.data.slug);
    if (!existing) {
      return { success: false, error: "Eintrag fehlt — zuerst speichern." };
    }

    const entry = await upsertBuchDerWocheEntry({
      slug: existing.slug,
      romanId: existing.romanId,
      teaserHeadline: existing.teaserHeadline,
      teaserLead: existing.teaserLead,
      igImageDataUrl: parsed.data.igImageDataUrl,
      igCaption: parsed.data.igCaption,
    });

    revalidateBuchDerWoche(entry.slug);
    return { success: true, data: { entry } };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Instagram-Post konnte nicht gespeichert werden.",
    };
  }
}

/** Suggest slug from a Clever title (client convenience via action). */
export async function suggestBuchDerWocheSlugAction(
  title: string,
): Promise<ActionResult<{ slug: string }>> {
  const denied = await denyUnlessAdmin();
  if (denied) return { success: false, error: denied };
  return { success: true, data: { slug: slugifyBuchDerWocheTitle(title) } };
}
