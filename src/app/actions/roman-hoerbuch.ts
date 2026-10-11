/**
 * Admin Hörbuch: list chapters + load stored MP3 signed URLs.
 * Synthesis runs via `/api/admin/roman-hoerbuch/chapter` (Storage upload).
 */

"use server";

import { z } from "zod";
import { denyUnlessAdmin } from "@/lib/auth/require-admin";
import {
  ensureElevenLabsSharedVoice,
  listTtsVoicesForProvider,
  searchElevenLabsSharedVoices,
  type TtsVoiceOption,
} from "@/lib/ai/tts-voices";
import type {
  RomanHoerbuchAudioChapter,
  RomanHoerbuchPrefs,
} from "@/lib/roman/editorial";
import {
  castingFromScreenshotHints,
  hintSearchQueries,
  HOERBUCH_SCREENSHOT_VOICE_OPTIONS,
} from "@/lib/roman/hoerbuch-casting-hints";
import {
  listRomanHoerbuchCastingRoles,
  type RomanHoerbuchCasting,
} from "@/lib/roman/hoerbuch-dialogue";
import {
  createRomanHoerbuchSignedUrl,
  deleteRomanHoerbuchObject,
  romanHoerbuchObjectPath,
} from "@/lib/roman/hoerbuch-storage";
import {
  isRomanHoerbuchLanguageCode,
  romanChapterSpokenText,
} from "@/lib/roman/export-roman-hoerbuch";
import {
  collectExportChaptersFromEditorial,
  type RomanExportProseSource,
} from "@/lib/roman/export-roman-pdf";
import { getRomanKontext, setRomanEditorial } from "@/lib/roman/repository";
import type { ActionResult } from "@/lib/types/actions";
import { firstZodMessage } from "@/lib/validations/roman-admin";

export type RomanHoerbuchStoredChapter = RomanHoerbuchAudioChapter & {
  chapterNumber: number;
  playUrl: string;
};

/**
 * Lists chapter numbers/titles available for Hörbuch export (no audio).
 */
export async function listRomanHoerbuchChaptersAction(
  input: unknown,
): Promise<
  ActionResult<{
    chapters: Array<{ number: number; title: string; charCount: number }>;
    title: string;
  }>
> {
  const denied = await denyUnlessAdmin();
  if (denied) return { success: false, error: denied };

  const parsed = z
    .object({
      romanId: z.string().uuid(),
      proseSource: z.enum(["manuskript", "roman"]).optional(),
    })
    .safeParse(input);
  if (!parsed.success) {
    return { success: false, error: firstZodMessage(parsed.error) };
  }

  const roman = await getRomanKontext(parsed.data.romanId, { omitCover: true });
  if (!roman) return { success: false, error: "Roman nicht gefunden." };

  const hasRoman = (roman.editorial.romanText ?? "").trim().length >= 40;
  const source: RomanExportProseSource =
    roman.editorial.buchTyp === "clever_erzaehlt"
      ? "manuskript"
      : parsed.data.proseSource === "roman" ||
          parsed.data.proseSource === "manuskript"
        ? parsed.data.proseSource === "roman" && !hasRoman
          ? "manuskript"
          : parsed.data.proseSource
        : hasRoman
          ? "roman"
          : "manuskript";
  const chapters = collectExportChaptersFromEditorial(roman.editorial, {
    source,
  });
  if (!chapters.length) {
    return {
      success: false,
      error: "Kein Manuskript/Roman-Text fürs Hörbuch.",
    };
  }

  return {
    success: true,
    data: {
      title: roman.title.trim() || "Roman",
      chapters: chapters.map((c) => ({
        number: c.number,
        title: c.title,
        charCount: romanChapterSpokenText(c).length,
      })),
    },
  };
}

/**
 * Loads persisted Hörbuch chapters with fresh signed playback URLs.
 */
export async function listRomanHoerbuchStoredAction(
  input: unknown,
): Promise<ActionResult<{ chapters: RomanHoerbuchStoredChapter[] }>> {
  const denied = await denyUnlessAdmin();
  if (denied) return { success: false, error: denied };

  const parsed = z.object({ romanId: z.string().uuid() }).safeParse(input);
  if (!parsed.success) {
    return { success: false, error: firstZodMessage(parsed.error) };
  }

  const roman = await getRomanKontext(parsed.data.romanId, { omitCover: true });
  if (!roman) return { success: false, error: "Roman nicht gefunden." };

  const stored = roman.editorial.hoerbuchAudio ?? {};
  const chapters: RomanHoerbuchStoredChapter[] = [];

  for (const [key, meta] of Object.entries(stored)) {
    const chapterNumber = Number(key);
    if (!Number.isFinite(chapterNumber) || chapterNumber < 1) continue;
    try {
      const playUrl = await createRomanHoerbuchSignedUrl(meta.storagePath);
      chapters.push({
        ...meta,
        chapterNumber: Math.floor(chapterNumber),
        playUrl,
      });
    } catch (error) {
      console.warn(
        `[listRomanHoerbuchStoredAction] signed URL kapitel ${key}`,
        error,
      );
    }
  }

  chapters.sort((a, b) => a.chapterNumber - b.chapterNumber);
  return { success: true, data: { chapters } };
}

/**
 * Deletes one chapter MP3 from Storage and clears editorial.hoerbuchAudio meta.
 * Manuskript / Roman text is untouched.
 */
export async function deleteRomanHoerbuchChapterAction(
  input: unknown,
): Promise<ActionResult<{ chapterNumber: number }>> {
  const denied = await denyUnlessAdmin();
  if (denied) return { success: false, error: denied };

  const parsed = z
    .object({
      romanId: z.string().uuid(),
      chapterNumber: z.number().int().positive(),
    })
    .safeParse(input);
  if (!parsed.success) {
    return { success: false, error: firstZodMessage(parsed.error) };
  }

  const roman = await getRomanKontext(parsed.data.romanId, { omitCover: true });
  if (!roman) return { success: false, error: "Roman nicht gefunden." };

  const key = String(parsed.data.chapterNumber);
  const meta = roman.editorial.hoerbuchAudio?.[key] ?? null;
  const storagePath =
    meta?.storagePath?.trim() ||
    romanHoerbuchObjectPath(parsed.data.romanId, parsed.data.chapterNumber);

  try {
    await deleteRomanHoerbuchObject(storagePath);
  } catch (error) {
    console.warn("[deleteRomanHoerbuchChapterAction] storage", error);
  }

  const nextAudio = { ...(roman.editorial.hoerbuchAudio ?? {}) };
  delete nextAudio[key];
  const hoerbuchAudio =
    Object.keys(nextAudio).length > 0 ? nextAudio : null;

  try {
    await setRomanEditorial(parsed.data.romanId, {
      ...roman.editorial,
      hoerbuchAudio,
    });
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Hörbuch-Kapitel konnte nicht gelöscht werden.",
    };
  }

  return {
    success: true,
    data: { chapterNumber: parsed.data.chapterNumber },
  };
}

const castingSchema = z.record(z.string(), z.string().trim().min(1).max(120));

const prefsSchema = z.object({
  romanId: z.string().uuid(),
  languageCode: z.string().trim().min(2).max(8),
  proseSource: z.enum(["manuskript", "roman"]),
  mode: z.enum(["single", "cast"]),
  casting: castingSchema.default({}),
});

/**
 * Persists Hörbuch language / mode / casting on editorial.hoerbuchPrefs.
 */
export async function saveRomanHoerbuchPrefsAction(
  input: unknown,
): Promise<ActionResult<{ prefs: RomanHoerbuchPrefs }>> {
  const denied = await denyUnlessAdmin();
  if (denied) return { success: false, error: denied };

  const parsed = prefsSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: firstZodMessage(parsed.error) };
  }

  const lang = parsed.data.languageCode.toLowerCase();
  if (!isRomanHoerbuchLanguageCode(lang)) {
    return { success: false, error: "Diese Sprache ist nicht wählbar." };
  }

  const casting: Record<string, string> = {};
  for (const [key, value] of Object.entries(parsed.data.casting)) {
    const role = key.trim().slice(0, 120);
    const voiceId = value.trim().slice(0, 120);
    if (!role || !voiceId) continue;
    casting[role] = voiceId;
    if (Object.keys(casting).length >= 40) break;
  }

  if (parsed.data.mode === "cast" && !casting.narrator) {
    return {
      success: false,
      error: "Bitte zuerst eine Erzähler-Stimme wählen.",
    };
  }

  const roman = await getRomanKontext(parsed.data.romanId, { omitCover: true });
  if (!roman) return { success: false, error: "Roman nicht gefunden." };

  const prefs: RomanHoerbuchPrefs = {
    languageCode: lang,
    proseSource: parsed.data.proseSource,
    mode: parsed.data.mode,
    casting,
    updatedAt: new Date().toISOString(),
  };

  try {
    await setRomanEditorial(parsed.data.romanId, {
      ...roman.editorial,
      hoerbuchPrefs: prefs,
    });
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Hörbuch-Einstellungen konnten nicht gespeichert werden.",
    };
  }

  return { success: true, data: { prefs } };
}

/**
 * Resolve ElevenLabs Studio screenshot voices → casting for this roman's roles.
 * Searches Voice Library, seeds known ids, optionally adds library voices.
 */
export async function applyRomanHoerbuchScreenshotCastingAction(
  input: unknown,
): Promise<
  ActionResult<{
    casting: RomanHoerbuchCasting;
    voices: TtsVoiceOption[];
    matched: Array<{ roleKey: string; voiceLabel: string; voiceId: string }>;
    missing: string[];
  }>
> {
  const denied = await denyUnlessAdmin();
  if (denied) return { success: false, error: denied };

  const parsed = z.object({ romanId: z.string().uuid() }).safeParse(input);
  if (!parsed.success) {
    return { success: false, error: firstZodMessage(parsed.error) };
  }

  const roman = await getRomanKontext(parsed.data.romanId, { omitCover: true });
  if (!roman) return { success: false, error: "Roman nicht gefunden." };

  const roles = listRomanHoerbuchCastingRoles(roman.charaktere ?? []);
  const roleKeys = roles.map((r) => r.key);

  let voices: TtsVoiceOption[] = [];
  try {
    voices = await listTtsVoicesForProvider("elevenlabs");
  } catch (error) {
    console.warn("[applyRomanHoerbuchScreenshotCastingAction] list", error);
  }

  const searched: TtsVoiceOption[] = [];
  for (const query of hintSearchQueries()) {
    try {
      const hits = await searchElevenLabsSharedVoices(query, {
        language: "de",
        pageSize: 12,
      });
      searched.push(...hits);
    } catch {
      // API key may be invalid locally — known ids still apply.
    }
  }

  const mergedMap = new Map<string, TtsVoiceOption>();
  for (const voice of [
    ...voices,
    ...searched,
    ...HOERBUCH_SCREENSHOT_VOICE_OPTIONS,
  ]) {
    const prev = mergedMap.get(voice.id);
    if (!prev) {
      mergedMap.set(voice.id, voice);
      continue;
    }
    mergedMap.set(voice.id, {
      ...prev,
      ...voice,
      label: voice.label || prev.label,
      description: voice.description || prev.description,
      previewUrl: voice.previewUrl ?? prev.previewUrl,
      publicOwnerId: voice.publicOwnerId ?? prev.publicOwnerId,
    });
  }
  const merged = [...mergedMap.values()];

  const { casting, matched, missing } = castingFromScreenshotHints(
    roleKeys,
    merged,
  );

  for (const row of matched) {
    const voice = merged.find((v) => v.id === row.voiceId);
    if (voice?.publicOwnerId) {
      try {
        await ensureElevenLabsSharedVoice({
          voiceId: voice.id,
          publicOwnerId: voice.publicOwnerId,
        });
      } catch (error) {
        console.warn(
          "[applyRomanHoerbuchScreenshotCastingAction] ensure",
          row.voiceId,
          error,
        );
      }
    }
  }

  if (matched.length === 0) {
    return {
      success: false,
      error:
        "Keine Screenshot-Stimmen gefunden. ElevenLabs-API prüfen oder Stimmen manuell wählen.",
    };
  }

  return {
    success: true,
    data: {
      casting,
      voices: merged,
      matched,
      missing,
    },
  };
}
