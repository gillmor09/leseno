/**
 * Admin Sachbuch Hörbuch: tracks anlegen, Prefs, Listen, Löschen, ZIP-Meta.
 * Synthesis → `/api/admin/sachbuch/hoerbuch/track` + `/sample`.
 */

"use server";

import { z } from "zod";
import { denyUnlessAdmin } from "@/lib/auth/require-admin";
import { listTtsVoicesForProvider, type TtsVoiceOption } from "@/lib/ai/tts-voices";
import { assertSachbuchGuideAllows } from "@/lib/sachbuch/guide";
import {
  buildSachbuchHoerbuchTracks,
  emptySachbuchHoerbuchState,
  ensureSachbuchHoerbuchIntroOutroTracks,
  isSachbuchHoerbuchTtsProvider,
  mergeHoerbuchTrackAudio,
  SACHBUCH_HOERBUCH_DEFAULT_STYLE,
  SACHBUCH_HOERBUCH_DEFAULT_VOICE,
  toPersistedHoerbuchTracks,
} from "@/lib/sachbuch/hoerbuch";
import type { SachbuchHoerbuchTtsProvider } from "@/lib/sachbuch/types";
import {
  createSachbuchHoerbuchSignedUrl,
  deleteSachbuchHoerbuchObject,
  downloadSachbuchHoerbuchAudio,
} from "@/lib/sachbuch/hoerbuch-storage";
import { slimSachbuchKontextForAdminPage } from "@/lib/sachbuch/parse";
import {
  getSachbuchKontext,
  getSachbuchKontextAdminShell,
  patchSachbuchBook,
} from "@/lib/sachbuch/repository";
import type { ActionResult } from "@/lib/types/actions";
import { firstZodMessage } from "@/lib/validations/roman-admin";

export type SachbuchHoerbuchStoredTrack = {
  trackId: string;
  order: number;
  title: string;
  fileName: string;
  charCount: number;
  playUrl: string | null;
  byteSize: number;
  durationSec: number | null;
};

/**
 * Build / refresh Hörbuch Tracks at Kapitel level (Unterkapitel only if >~35 min).
 */
export async function buildSachbuchHoerbuchTracksAction(
  input: unknown,
): Promise<
  ActionResult<{
    trackCount: number;
    withAudio: number;
    book: Awaited<ReturnType<typeof getSachbuchKontext>>;
  }>
> {
  const denied = await denyUnlessAdmin();
  if (denied) return { success: false, error: denied };

  const parsed = z.object({ sachbuchId: z.string().uuid() }).safeParse(input);
  if (!parsed.success) {
    return { success: false, error: firstZodMessage(parsed.error) };
  }

  const book = await getSachbuchKontext(parsed.data.sachbuchId);
  if (!book) return { success: false, error: "Sachbuch nicht gefunden." };
  try {
    assertSachbuchGuideAllows(book, "hoerbuch");
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "Hörbuch gesperrt.",
    };
  }

  const built = buildSachbuchHoerbuchTracks(book);
  if (!built.length) {
    return {
      success: false,
      error:
        "Kein Kapiteltext fürs Hörbuch — zuerst Schreiben/Manuskript/Herstellung füllen.",
    };
  }

  const prev = book.idee.hoerbuch ?? emptySachbuchHoerbuchState();
  const tracks = toPersistedHoerbuchTracks(
    mergeHoerbuchTrackAudio(prev.tracks, built),
  );
  await patchSachbuchBook(book.id, {
    idee: {
      ...book.idee,
      hoerbuch: {
        ...prev,
        voiceId: prev.voiceId || SACHBUCH_HOERBUCH_DEFAULT_VOICE,
        style: prev.style || SACHBUCH_HOERBUCH_DEFAULT_STYLE,
        tracks,
        tracksBuiltAt: new Date().toISOString(),
      },
    },
  });

  const shell = await getSachbuchKontextAdminShell(book.id);
  return {
    success: true,
    data: {
      trackCount: tracks.length,
      withAudio: tracks.filter((t) => t.audio).length,
      book: shell ? slimSachbuchKontextForAdminPage(shell) : null,
    },
  };
}

/**
 * Add Intro (0) + Outro only — keeps every existing Kapitel track and its audio.
 */
export async function ensureSachbuchHoerbuchIntroOutroAction(
  input: unknown,
): Promise<
  ActionResult<{
    addedIntro: boolean;
    addedOutro: boolean;
    updatedIntro: boolean;
    trackCount: number;
    book: Awaited<ReturnType<typeof getSachbuchKontext>>;
  }>
> {
  const denied = await denyUnlessAdmin();
  if (denied) return { success: false, error: denied };

  const parsed = z.object({ sachbuchId: z.string().uuid() }).safeParse(input);
  if (!parsed.success) {
    return { success: false, error: firstZodMessage(parsed.error) };
  }

  const book = await getSachbuchKontext(parsed.data.sachbuchId);
  if (!book) return { success: false, error: "Sachbuch nicht gefunden." };
  try {
    assertSachbuchGuideAllows(book, "hoerbuch");
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "Hörbuch gesperrt.",
    };
  }

  const prev = book.idee.hoerbuch ?? emptySachbuchHoerbuchState();
  if (!prev.tracks.length) {
    return {
      success: false,
      error: "Noch keine Tracks — zuerst Kapitel-Tracks anlegen.",
    };
  }

  const { tracks, addedIntro, addedOutro, updatedIntro } =
    ensureSachbuchHoerbuchIntroOutroTracks(book, prev.tracks);
  if (!addedIntro && !addedOutro && !updatedIntro) {
    const shell = await getSachbuchKontextAdminShell(book.id);
    return {
      success: true,
      data: {
        addedIntro: false,
        addedOutro: false,
        updatedIntro: false,
        trackCount: prev.tracks.length,
        book: shell ? slimSachbuchKontextForAdminPage(shell) : null,
      },
    };
  }

  await patchSachbuchBook(book.id, {
    idee: {
      ...book.idee,
      hoerbuch: {
        ...prev,
        tracks: toPersistedHoerbuchTracks(tracks),
      },
    },
  });

  const shell = await getSachbuchKontextAdminShell(book.id);
  return {
    success: true,
    data: {
      addedIntro,
      addedOutro,
      updatedIntro,
      trackCount: tracks.length,
      book: shell ? slimSachbuchKontextForAdminPage(shell) : null,
    },
  };
}

export async function saveSachbuchHoerbuchPrefsAction(
  input: unknown,
): Promise<ActionResult<{ book: Awaited<ReturnType<typeof getSachbuchKontext>> }>> {
  const denied = await denyUnlessAdmin();
  if (denied) return { success: false, error: denied };

  const parsed = z
    .object({
      sachbuchId: z.string().uuid(),
      provider: z.enum(["gemini-tts", "elevenlabs"]).optional(),
      voiceId: z.string().trim().min(1).max(120),
      style: z.string().trim().max(500).optional(),
    })
    .safeParse(input);
  if (!parsed.success) {
    return { success: false, error: firstZodMessage(parsed.error) };
  }

  const book = await getSachbuchKontext(parsed.data.sachbuchId);
  if (!book) return { success: false, error: "Sachbuch nicht gefunden." };

  const prev = book.idee.hoerbuch ?? emptySachbuchHoerbuchState();
  const provider: SachbuchHoerbuchTtsProvider =
    parsed.data.provider && isSachbuchHoerbuchTtsProvider(parsed.data.provider)
      ? parsed.data.provider
      : prev.provider;
  await patchSachbuchBook(book.id, {
    idee: {
      ...book.idee,
      hoerbuch: {
        ...prev,
        tracks: toPersistedHoerbuchTracks(prev.tracks),
        provider,
        voiceId: parsed.data.voiceId,
        style: (parsed.data.style ?? prev.style).trim() ||
          SACHBUCH_HOERBUCH_DEFAULT_STYLE,
      },
    },
  });

  const shell = await getSachbuchKontextAdminShell(book.id);
  return {
    success: true,
    data: {
      book: shell ? slimSachbuchKontextForAdminPage(shell) : null,
    },
  };
}

export async function listSachbuchHoerbuchVoicesAction(): Promise<
  ActionResult<{
    gemini: TtsVoiceOption[];
    elevenlabs: TtsVoiceOption[];
    /** @deprecated use `gemini` — kept for older clients */
    voices: TtsVoiceOption[];
  }>
> {
  const denied = await denyUnlessAdmin();
  if (denied) return { success: false, error: denied };
  const [gemini, elevenRaw] = await Promise.all([
    listTtsVoicesForProvider("gemini-tts"),
    listTtsVoicesForProvider("elevenlabs"),
  ]);
  // Prefer the known Sachbuch narrator even if the API listing omits it.
  const { SACHBUCH_HOERBUCH_ELEVENLABS_PREFERRED_VOICE_ID } = await import(
    "@/lib/sachbuch/hoerbuch"
  );
  const preferredId = SACHBUCH_HOERBUCH_ELEVENLABS_PREFERRED_VOICE_ID;
  const elevenlabs = [
    {
      id: preferredId,
      label: "Helmut",
      description: "Bevorzugte Sachbuch-Erzählstimme",
    },
    ...elevenRaw.filter((v) => v.id !== preferredId),
  ];
  return {
    success: true,
    data: {
      gemini,
      elevenlabs,
      voices: gemini,
    },
  };
}

export async function listSachbuchHoerbuchStoredAction(
  input: unknown,
): Promise<
  ActionResult<{
    tracks: SachbuchHoerbuchStoredTrack[];
    sample: {
      fileName: string;
      playUrl: string;
      byteSize: number;
      durationSec: number;
    } | null;
  }>
> {
  const denied = await denyUnlessAdmin();
  if (denied) return { success: false, error: denied };

  const parsed = z.object({ sachbuchId: z.string().uuid() }).safeParse(input);
  if (!parsed.success) {
    return { success: false, error: firstZodMessage(parsed.error) };
  }

  const book = await getSachbuchKontext(parsed.data.sachbuchId);
  if (!book) return { success: false, error: "Sachbuch nicht gefunden." };
  const state = book.idee.hoerbuch ?? emptySachbuchHoerbuchState();

  const tracks: SachbuchHoerbuchStoredTrack[] = [];
  for (const t of state.tracks) {
    let playUrl: string | null = null;
    if (t.audio?.storagePath) {
      try {
        playUrl = await createSachbuchHoerbuchSignedUrl(t.audio.storagePath);
      } catch {
        playUrl = null;
      }
    }
    tracks.push({
      trackId: t.id,
      order: t.order,
      title: t.title,
      fileName: t.fileName,
      charCount: t.charCount,
      playUrl,
      byteSize: t.audio?.byteSize ?? 0,
      durationSec: t.audio?.durationSec ?? null,
    });
  }

  let sample: {
    fileName: string;
    playUrl: string;
    byteSize: number;
    durationSec: number;
  } | null = null;
  if (state.sample?.storagePath) {
    try {
      const playUrl = await createSachbuchHoerbuchSignedUrl(
        state.sample.storagePath,
      );
      sample = {
        fileName: state.sample.fileName,
        playUrl,
        byteSize: state.sample.byteSize,
        durationSec: state.sample.durationSec,
      };
    } catch {
      sample = null;
    }
  }

  return { success: true, data: { tracks, sample } };
}

/**
 * Trim existing Hörprobe to Tolino max (~3:00) without re-running TTS.
 */
export async function trimSachbuchHoerbuchSampleAction(
  input: unknown,
): Promise<
  ActionResult<{
    fileName: string;
    playUrl: string;
    byteSize: number;
    durationSec: number;
    trimmed: boolean;
    book: Awaited<ReturnType<typeof getSachbuchKontext>>;
  }>
> {
  const denied = await denyUnlessAdmin();
  if (denied) return { success: false, error: denied };

  const parsed = z.object({ sachbuchId: z.string().uuid() }).safeParse(input);
  if (!parsed.success) {
    return { success: false, error: firstZodMessage(parsed.error) };
  }

  const book = await getSachbuchKontext(parsed.data.sachbuchId);
  if (!book) return { success: false, error: "Sachbuch nicht gefunden." };
  try {
    assertSachbuchGuideAllows(book, "hoerbuch");
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "Hörbuch gesperrt.",
    };
  }

  try {
    const { trimExistingSachbuchHoerbuchSample } = await import(
      "@/lib/sachbuch/synthesize-hoerbuch-track"
    );
    const data = await trimExistingSachbuchHoerbuchSample({
      sachbuchId: parsed.data.sachbuchId,
    });
    const shell = await getSachbuchKontextAdminShell(book.id);
    return {
      success: true,
      data: {
        ...data,
        book: shell ? slimSachbuchKontextForAdminPage(shell) : null,
      },
    };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "Hörprobe-Kürzung fehlgeschlagen.",
    };
  }
}

export async function deleteSachbuchHoerbuchTrackAction(
  input: unknown,
): Promise<ActionResult<{ book: Awaited<ReturnType<typeof getSachbuchKontext>> }>> {
  const denied = await denyUnlessAdmin();
  if (denied) return { success: false, error: denied };

  const parsed = z
    .object({
      sachbuchId: z.string().uuid(),
      trackId: z.string().trim().min(1),
    })
    .safeParse(input);
  if (!parsed.success) {
    return { success: false, error: firstZodMessage(parsed.error) };
  }

  const book = await getSachbuchKontext(parsed.data.sachbuchId);
  if (!book) return { success: false, error: "Sachbuch nicht gefunden." };
  const state = book.idee.hoerbuch ?? emptySachbuchHoerbuchState();
  const track = state.tracks.find((t) => t.id === parsed.data.trackId);
  if (!track) return { success: false, error: "Track nicht gefunden." };

  if (track.audio?.storagePath) {
    await deleteSachbuchHoerbuchObject(track.audio.storagePath);
  }

  await patchSachbuchBook(book.id, {
    idee: {
      ...book.idee,
      hoerbuch: {
        ...state,
        tracks: toPersistedHoerbuchTracks(
          state.tracks.map((t) =>
            t.id === track.id ? { ...t, audio: null } : t,
          ),
        ),
      },
    },
  });

  const shell = await getSachbuchKontextAdminShell(book.id);
  return {
    success: true,
    data: {
      book: shell ? slimSachbuchKontextForAdminPage(shell) : null,
    },
  };
}

/**
 * Pack all track MP3s (+ Hörprobe) as ZIP bytes (base64) for client download.
 */
export async function downloadSachbuchHoerbuchZipMetaAction(
  input: unknown,
): Promise<
  ActionResult<{
    files: Array<{ fileName: string; base64: string }>;
    zipName: string;
  }>
> {
  const denied = await denyUnlessAdmin();
  if (denied) return { success: false, error: denied };

  const parsed = z.object({ sachbuchId: z.string().uuid() }).safeParse(input);
  if (!parsed.success) {
    return { success: false, error: firstZodMessage(parsed.error) };
  }

  const book = await getSachbuchKontext(parsed.data.sachbuchId);
  if (!book) return { success: false, error: "Sachbuch nicht gefunden." };
  const state = book.idee.hoerbuch ?? emptySachbuchHoerbuchState();
  const withAudio = state.tracks.filter((t) => t.audio?.storagePath);
  if (!withAudio.length) {
    return { success: false, error: "Noch keine vertonten Tracks." };
  }

  const files: Array<{ fileName: string; base64: string }> = [];
  if (state.sample?.storagePath) {
    const buf = await downloadSachbuchHoerbuchAudio(state.sample.storagePath);
    files.push({
      fileName: state.sample.fileName,
      base64: buf.toString("base64"),
    });
  }
  for (const t of withAudio) {
    const buf = await downloadSachbuchHoerbuchAudio(t.audio!.storagePath);
    files.push({ fileName: t.fileName, base64: buf.toString("base64") });
  }

  const titleSlug = (book.export.suggestedTitle || book.title || "hoerbuch")
    .replace(/[^\w\-]+/g, "_")
    .slice(0, 40);
  return {
    success: true,
    data: {
      files,
      zipName: `${titleSlug}_Hoerbuch_Tolino.zip`,
    },
  };
}
