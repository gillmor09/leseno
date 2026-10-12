"use client";

/**
 * Dedicated Hörbuch tab: per-chapter TTS / casting, Storage-backed MP3s.
 * Export tab stays PDF/EPUB/marketing only.
 */

import { useEffect, useMemo, useState } from "react";
import JSZip from "jszip";
import { toast } from "sonner";
import {
  applyRomanHoerbuchScreenshotCastingAction,
  deleteRomanHoerbuchChapterAction,
  listRomanHoerbuchStoredAction,
  saveRomanHoerbuchPrefsAction,
} from "@/app/actions/roman-hoerbuch";
import { HoerbuchAudioPlayer } from "@/components/features/admin/hoerbuch-audio-player";
import { RomanSceneWaitDialog } from "@/components/features/admin/roman-scene-wait-dialog";
import { TtsVoicePicker } from "@/components/features/admin/tts-voice-picker";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import type { TtsVoiceOption } from "@/lib/ai/tts-voices";
import type {
  RomanEditorial,
  RomanHoerbuchPrefs,
} from "@/lib/roman/editorial";
import {
  isRomanHoerbuchLanguageCode,
  ROMAN_HOERBUCH_LANGUAGES,
  romanChapterSpokenText,
  romanHoerbuchZipFilename,
  type RomanHoerbuchLanguageCode,
} from "@/lib/roman/export-roman-hoerbuch";
import {
  listRomanHoerbuchCastingRoles,
  ROMAN_HOERBUCH_MAX_VOICES,
  ROMAN_HOERBUCH_NARRATOR_KEY,
  ROMAN_HOERBUCH_UNKNOWN_KEY,
  splitChapterIntoDialogueTurns,
  validateRomanHoerbuchCasting,
  type RomanHoerbuchCasting,
} from "@/lib/roman/hoerbuch-dialogue";
import {
  collectExportChaptersFromEditorial,
  type RomanExportProseSource,
} from "@/lib/roman/export-roman-pdf";
import { hasFilledManuskript } from "@/lib/roman/suggest-manuskript";
import type { RomanKontext } from "@/lib/roman/types";
import { cn } from "@/lib/utils";

const HOERBUCH_WAIT_STEPS = [
  "Kapiteltext vorbereiten",
  "ElevenLabs spricht vor",
  "MP3 in Storage speichern",
  "Wiedergabe bereit",
] as const;

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Stable admin play URL (sanitized MP3 + ranges) — not time-limited signed URLs. */
function hoerbuchPlayPath(
  romanId: string,
  chapterNumber: number,
  byteSize?: number,
  opts?: { tolino?: boolean },
): string {
  const params = new URLSearchParams();
  if (byteSize && byteSize > 0) params.set("v", String(byteSize));
  if (opts?.tolino) params.set("tolino", "1");
  const q = params.toString();
  return `/api/admin/roman-hoerbuch/play/${romanId}/${chapterNumber}${q ? `?${q}` : ""}`;
}

type ChapterAudio = {
  fileName: string;
  url: string;
  bytes: number;
  languageCode?: string;
};

type ChapterRuntime = {
  status: "idle" | "running" | "done" | "error";
  progress: string | null;
  error: string | null;
  audio: ChapterAudio | null;
};

function emptyRuntime(): ChapterRuntime {
  return { status: "idle", progress: null, error: null, audio: null };
}

type ChapterApiResult = {
  success?: boolean;
  error?: string;
  data?: {
    chapterNumber: number;
    fileName: string;
    playUrl: string;
    byteSize: number;
    languageCode: string;
  };
};

export function RomanHoerbuchPanel({
  roman,
  editorial,
  disabled,
  onHoerbuchPrefsSaved,
}: {
  roman: RomanKontext;
  editorial: RomanEditorial;
  disabled?: boolean;
  onHoerbuchPrefsSaved?: (prefs: RomanHoerbuchPrefs) => void;
}) {
  const isClever = editorial.buchTyp === "clever_erzaehlt";
  const hasRomanProse = hasFilledManuskript(editorial.romanText ?? "");
  const hasManuskriptProse = hasFilledManuskript(editorial.manuskriptText ?? "");
  const savedPrefs = editorial.hoerbuchPrefs;
  const [proseSource, setProseSource] = useState<RomanExportProseSource>(() => {
    if (isClever) return "manuskript";
    if (savedPrefs?.proseSource === "roman" && hasRomanProse) return "roman";
    if (savedPrefs?.proseSource === "manuskript" && hasManuskriptProse) {
      return "manuskript";
    }
    return !isClever && hasRomanProse ? "roman" : "manuskript";
  });
  const [lang, setLang] = useState<RomanHoerbuchLanguageCode>(() =>
    savedPrefs?.languageCode &&
    isRomanHoerbuchLanguageCode(savedPrefs.languageCode)
      ? savedPrefs.languageCode
      : "de",
  );
  const [mode, setMode] = useState<"single" | "cast">(
    () => savedPrefs?.mode ?? "single",
  );
  const [voices, setVoices] = useState<TtsVoiceOption[]>([]);
  const [voicesLoading, setVoicesLoading] = useState(false);
  const [casting, setCasting] = useState<RomanHoerbuchCasting>(
    () => ({ ...(savedPrefs?.casting ?? {}) }),
  );
  const [prefsSaving, setPrefsSaving] = useState(false);
  const [hintApplying, setHintApplying] = useState(false);
  const [busyChapter, setBusyChapter] = useState<number | null>(null);
  const [busyAll, setBusyAll] = useState(false);
  const [storedLoading, setStoredLoading] = useState(true);
  const [runtimeByNumber, setRuntimeByNumber] = useState<
    Record<number, ChapterRuntime>
  >({});
  const [waitOpen, setWaitOpen] = useState(false);
  const [waitTitle, setWaitTitle] = useState("Hörbuch-Kapitel erzeugen");
  const [waitProgress, setWaitProgress] = useState<string | null>(null);
  const [waitStepIndex, setWaitStepIndex] = useState<number | null>(null);
  const [previewChapterNumber, setPreviewChapterNumber] = useState<number | null>(
    null,
  );
  const [previewExpanded, setPreviewExpanded] = useState(false);
  const [deleteChapterNumber, setDeleteChapterNumber] = useState<number | null>(
    null,
  );
  const [deletePending, setDeletePending] = useState(false);

  const effectiveSource: RomanExportProseSource = isClever
    ? "manuskript"
    : proseSource === "roman" && hasRomanProse
      ? "roman"
      : "manuskript";

  const chapters = useMemo(
    () =>
      collectExportChaptersFromEditorial(editorial, {
        source: effectiveSource,
      }),
    [
      editorial.buchTyp,
      editorial.manuskriptText,
      editorial.romanText,
      editorial.cleverUnterthemen,
      effectiveSource,
    ],
  );

  const castingRoles = listRomanHoerbuchCastingRoles(roman.charaktere ?? []);
  const uniqueCastVoices = new Set(
    Object.values(casting)
      .map((v) => v.trim())
      .filter(Boolean),
  ).size;
  const busy = Boolean(disabled || busyAll || busyChapter != null);
  const doneCount = chapters.filter(
    (c) => runtimeByNumber[c.number]?.status === "done",
  ).length;

  const effectivePreviewNumber =
    previewChapterNumber &&
    chapters.some((c) => c.number === previewChapterNumber)
      ? previewChapterNumber
      : (chapters[0]?.number ?? null);

  const speakerPreview = useMemo(() => {
    if (effectivePreviewNumber == null) return null;
    const chapter = chapters.find((c) => c.number === effectivePreviewNumber);
    if (!chapter) return null;
    const spoken = romanChapterSpokenText(chapter);
    const turns = splitChapterIntoDialogueTurns({
      spokenText: spoken,
      charaktere: roman.charaktere ?? [],
    });
    const counts = new Map<string, number>();
    for (const turn of turns) {
      counts.set(turn.speakerKey, (counts.get(turn.speakerKey) ?? 0) + 1);
    }
    const roleLabel = (key: string) =>
      castingRoles.find((r) => r.key === key)?.label ?? key;
    const voiceLabel = (key: string) => {
      const id = casting[key]?.trim();
      if (!id) {
        if (key === ROMAN_HOERBUCH_NARRATOR_KEY) return "— keine Stimme —";
        return "Wie Erzähler / Unbekannt";
      }
      return voices.find((v) => v.id === id)?.label ?? id;
    };
    return {
      chapter,
      turns,
      counts,
      roleLabel,
      voiceLabel,
      totalTurns: turns.length,
      dialogueTurns: turns.filter(
        (t) => t.speakerKey !== ROMAN_HOERBUCH_NARRATOR_KEY,
      ).length,
      uniqueSpeakers: [...counts.keys()].filter(
        (k) =>
          k !== ROMAN_HOERBUCH_NARRATOR_KEY && k !== ROMAN_HOERBUCH_UNKNOWN_KEY,
      ).length,
    };
  }, [
    effectivePreviewNumber,
    chapters,
    roman.charaktere,
    castingRoles,
    casting,
    voices,
  ]);

  useEffect(() => {
    let cancelled = false;
    setStoredLoading(true);
    void listRomanHoerbuchStoredAction({ romanId: roman.id })
      .then((result) => {
        if (cancelled) return;
        if (!result.success || !result.data) return;
        setRuntimeByNumber((prev) => {
          const next = { ...prev };
          for (const item of result.data!.chapters) {
            const existing = next[item.chapterNumber];
            if (existing?.status === "running") continue;
            next[item.chapterNumber] = {
              status: "done",
              progress: null,
              error: null,
              audio: {
                fileName: item.fileName,
                url: item.playUrl,
                bytes: item.byteSize,
                languageCode: item.languageCode,
              },
            };
          }
          return next;
        });
      })
      .finally(() => {
        if (!cancelled) setStoredLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [roman.id]);

  useEffect(() => {
    if (mode !== "cast") return;
    const controller = new AbortController();
    setVoicesLoading(true);
    void fetch("/api/admin/tts-voices?provider=elevenlabs", {
      signal: controller.signal,
      cache: "no-store",
    })
      .then(async (response) => {
        const payload = (await response.json()) as {
          voices?: TtsVoiceOption[];
          error?: string;
        };
        if (!response.ok) {
          throw new Error(
            payload.error ?? "ElevenLabs-Stimmen konnten nicht geladen werden.",
          );
        }
        const nextVoices = payload.voices ?? [];
        setVoices(nextVoices);
        // Keep saved casting; only fill empty narrator/unknown defaults.
        setCasting((prev) => {
          if (prev[ROMAN_HOERBUCH_NARRATOR_KEY]?.trim()) {
            if (prev[ROMAN_HOERBUCH_UNKNOWN_KEY]?.trim()) return prev;
            return {
              ...prev,
              [ROMAN_HOERBUCH_UNKNOWN_KEY]: prev[ROMAN_HOERBUCH_NARRATOR_KEY]!,
            };
          }
          const defaultVoice = nextVoices[0]?.id ?? "";
          if (!defaultVoice) return prev;
          return {
            ...prev,
            [ROMAN_HOERBUCH_NARRATOR_KEY]: defaultVoice,
            [ROMAN_HOERBUCH_UNKNOWN_KEY]:
              prev[ROMAN_HOERBUCH_UNKNOWN_KEY] || defaultVoice,
          };
        });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        toast.error(
          error instanceof Error
            ? error.message
            : "ElevenLabs-Stimmen konnten nicht geladen werden.",
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setVoicesLoading(false);
      });
    return () => controller.abort();
  }, [mode, roman.id]);

  function patchRuntime(chapterNumber: number, patch: Partial<ChapterRuntime>) {
    setRuntimeByNumber((prev) => {
      const current = prev[chapterNumber] ?? emptyRuntime();
      return {
        ...prev,
        [chapterNumber]: { ...current, ...patch },
      };
    });
  }

  function setCastVoice(roleKey: string, voiceId: string) {
    setCasting((prev) => {
      const next = { ...prev };
      if (!voiceId.trim()) {
        if (roleKey !== ROMAN_HOERBUCH_NARRATOR_KEY) delete next[roleKey];
        return next;
      }
      next[roleKey] = voiceId;
      if (
        roleKey === ROMAN_HOERBUCH_NARRATOR_KEY &&
        !next[ROMAN_HOERBUCH_UNKNOWN_KEY]
      ) {
        next[ROMAN_HOERBUCH_UNKNOWN_KEY] = voiceId;
      }
      return next;
    });
  }

  async function applyScreenshotCasting() {
    if (busy || hintApplying) return;
    setHintApplying(true);
    setMode("cast");
    try {
      const result = await applyRomanHoerbuchScreenshotCastingAction({
        romanId: roman.id,
      });
      if (!result.success || !result.data) {
        toast.error(
          result.error ?? "Screenshot-Stimmen konnten nicht zugeordnet werden.",
        );
        return;
      }
      const nextCasting = { ...casting, ...result.data.casting };
      setVoices((prev) => {
        const map = new Map(prev.map((v) => [v.id, v]));
        for (const voice of result.data!.voices) map.set(voice.id, voice);
        return [...map.values()];
      });
      setCasting(nextCasting);
      const saved = await saveRomanHoerbuchPrefsAction({
        romanId: roman.id,
        languageCode: lang,
        proseSource: effectiveSource,
        mode: "cast",
        casting: nextCasting,
      });
      if (saved.success && saved.data) {
        onHoerbuchPrefsSaved?.(saved.data.prefs);
      }
      const n = result.data.matched.length;
      const missing = result.data.missing;
      toast.success(
        missing.length
          ? `${n} Stimmen zugeordnet · ${missing.length} Figur(en) ohne Treffer`
          : `${n} Screenshot-Stimmen zugeordnet und gespeichert.`,
      );
    } finally {
      setHintApplying(false);
    }
  }

  async function persistPrefs(options?: {
    quiet?: boolean;
  }): Promise<RomanHoerbuchPrefs | null> {
    if (mode === "cast") {
      const castError = validateRomanHoerbuchCasting(
        casting,
        castingRoles.map((r) => r.key),
      );
      if (castError) {
        if (!options?.quiet) toast.error(castError);
        return null;
      }
    }
    setPrefsSaving(true);
    try {
      const result = await saveRomanHoerbuchPrefsAction({
        romanId: roman.id,
        languageCode: lang,
        proseSource: effectiveSource,
        mode,
        casting: mode === "cast" ? casting : {},
      });
      if (!result.success || !result.data) {
        if (!options?.quiet) {
          toast.error(
            result.error ?? "Hörbuch-Einstellungen konnten nicht gespeichert werden.",
          );
        }
        return null;
      }
      onHoerbuchPrefsSaved?.(result.data.prefs);
      if (!options?.quiet) {
        toast.success(
          mode === "cast"
            ? "Stimmen gespeichert."
            : "Hörbuch-Einstellungen gespeichert.",
        );
      }
      return result.data.prefs;
    } finally {
      setPrefsSaving(false);
    }
  }

  function setWaitStatus(input: {
    title?: string;
    progress: string;
    stepIndex: number;
  }) {
    if (input.title) setWaitTitle(input.title);
    setWaitProgress(input.progress);
    setWaitStepIndex(input.stepIndex);
  }

  async function synthesizeChapter(
    chapterNumber: number,
    batch?: { index: number; total: number },
  ): Promise<{ fileName: string; url: string; bytes: number } | null> {
    const chapter = chapters.find((c) => c.number === chapterNumber);
    if (!chapter) return null;
    if (mode === "cast") {
      const castError = validateRomanHoerbuchCasting(
        casting,
        castingRoles.map((r) => r.key),
      );
      if (castError) {
        toast.error(castError);
        return null;
      }
    }

    const chapterLabel = chapter.title || `Kapitel ${chapter.number}`;
    const batchPrefix = batch
      ? `Kapitel ${batch.index}/${batch.total} — `
      : "";
    const progressPrefix = `${batchPrefix}${chapterLabel}`;

    patchRuntime(chapterNumber, {
      status: "running",
      progress: "Kapiteltext vorbereiten …",
      error: null,
    });
    setWaitStatus({
      progress: `${progressPrefix}: Kapiteltext vorbereiten …`,
      stepIndex: 0,
    });

    try {
      patchRuntime(chapterNumber, {
        status: "running",
        progress:
          mode === "cast"
            ? "ElevenLabs Dialog spricht vor …"
            : "ElevenLabs spricht vor …",
        error: null,
      });
      setWaitStatus({
        progress: `${progressPrefix}: ${
          mode === "cast"
            ? "ElevenLabs Dialog spricht vor …"
            : "ElevenLabs spricht vor …"
        }`,
        stepIndex: 1,
      });

      const response = await fetch("/api/admin/roman-hoerbuch/chapter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          romanId: roman.id,
          chapterNumber,
          languageCode: lang,
          proseSource: effectiveSource,
          mode,
          casting: mode === "cast" ? casting : undefined,
        }),
      });

      setWaitStatus({
        progress: `${progressPrefix}: MP3 in Storage speichern …`,
        stepIndex: 2,
      });
      patchRuntime(chapterNumber, {
        status: "running",
        progress: "MP3 in Storage speichern …",
        error: null,
      });

      const payload = (await response.json()) as ChapterApiResult;
      if (!response.ok || !payload.success || !payload.data) {
        const message =
          payload.error ?? `Kapitel ${chapterNumber} fehlgeschlagen.`;
        patchRuntime(chapterNumber, {
          status: "error",
          progress: null,
          error: message,
        });
        toast.error(message);
        return null;
      }

      const { fileName, playUrl, byteSize, languageCode } = payload.data;
      setWaitStatus({
        progress: `${progressPrefix}: fertig (${Math.max(1, Math.round(byteSize / 1024))} KB)`,
        stepIndex: 3,
      });
      patchRuntime(chapterNumber, {
        status: "done",
        progress: null,
        error: null,
        audio: {
          fileName,
          url: playUrl,
          bytes: byteSize,
          languageCode,
        },
      });
      toast.success(
        `${chapterLabel} fertig — ${Math.max(1, Math.round(byteSize / 1024))} KB (gespeichert)`,
      );
      // Remember casting / language used for this run.
      void persistPrefs({ quiet: true });
      return { fileName, url: playUrl, bytes: byteSize };
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : `Kapitel ${chapterNumber} fehlgeschlagen.`;
      patchRuntime(chapterNumber, {
        status: "error",
        progress: null,
        error: message,
      });
      toast.error(message);
      return null;
    }
  }

  async function runOne(chapterNumber: number) {
    if (busy || chapters.length === 0) return;
    const chapter = chapters.find((c) => c.number === chapterNumber);
    const label = chapter?.title
      ? `Kapitel ${chapterNumber} — ${chapter.title}`
      : `Kapitel ${chapterNumber}`;
    setBusyChapter(chapterNumber);
    setWaitTitle(label);
    setWaitProgress("Startet …");
    setWaitStepIndex(0);
    setWaitOpen(true);
    try {
      await synthesizeChapter(chapterNumber);
    } finally {
      setBusyChapter(null);
      setWaitOpen(false);
      setWaitProgress(null);
      setWaitStepIndex(null);
    }
  }

  async function runAll() {
    if (busy || chapters.length === 0) return;
    if (mode === "cast") {
      const castError = validateRomanHoerbuchCasting(
        casting,
        castingRoles.map((r) => r.key),
      );
      if (castError) {
        toast.error(castError);
        return;
      }
    }
    setBusyAll(true);
    setWaitTitle("Alle Hörbuch-Kapitel erzeugen");
    setWaitProgress("Startet …");
    setWaitStepIndex(0);
    setWaitOpen(true);
    try {
      const zip = new JSZip();
      let ok = 0;
      const total = chapters.length;
      for (let i = 0; i < chapters.length; i += 1) {
        const chapter = chapters[i]!;
        const result = await synthesizeChapter(chapter.number, {
          index: i + 1,
          total,
        });
        if (!result) return;
        setWaitStatus({
          progress: `Kapitel ${i + 1}/${total}: ZIP vorbereiten …`,
          stepIndex: 3,
        });
        const response = await fetch(
          hoerbuchPlayPath(roman.id, chapter.number, result.bytes, {
            tolino: true,
          }),
        );
        if (!response.ok) {
          toast.error(
            `Kapitel ${chapter.number}: Download aus Storage fehlgeschlagen.`,
          );
          return;
        }
        zip.file(result.fileName, await response.arrayBuffer());
        ok += 1;
      }
      setWaitStatus({
        progress: `ZIP mit ${ok} Kapitel erzeugen …`,
        stepIndex: 3,
      });
      const blob = await zip.generateAsync({ type: "blob" });
      downloadBlob(blob, romanHoerbuchZipFilename(roman.title, lang));
      toast.success(`Alle ${ok} Kapitel erzeugt — ZIP heruntergeladen.`);
    } finally {
      setBusyAll(false);
      setWaitOpen(false);
      setWaitProgress(null);
      setWaitStepIndex(null);
    }
  }

  async function confirmDeleteChapter() {
    if (deleteChapterNumber == null || deletePending) return;
    const chapterNumber = deleteChapterNumber;
    setDeletePending(true);
    try {
      const result = await deleteRomanHoerbuchChapterAction({
        romanId: roman.id,
        chapterNumber,
      });
      if (!result.success) {
        toast.error(
          result.error ?? `Kapitel ${chapterNumber} konnte nicht gelöscht werden.`,
        );
        return;
      }
      patchRuntime(chapterNumber, emptyRuntime());
      setDeleteChapterNumber(null);
      toast.success(`Hörbuch-Kapitel ${chapterNumber} gelöscht.`);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : `Kapitel ${chapterNumber} konnte nicht gelöscht werden.`,
      );
    } finally {
      setDeletePending(false);
    }
  }

  async function downloadZipOfDone() {
    // Prefer fresh Storage list — client signed URLs expire after 2h and were
    // silently skipped, which looked like „only chapter 9+ in the ZIP“.
    const stored = await listRomanHoerbuchStoredAction({ romanId: roman.id });
    const fromStorage =
      stored.success && stored.data
        ? stored.data.chapters
        : chapters
            .map((c) => {
              const audio = runtimeByNumber[c.number]?.audio;
              if (!audio) return null;
              return {
                chapterNumber: c.number,
                fileName: audio.fileName,
                byteSize: audio.bytes,
              };
            })
            .filter(
              (
                row,
              ): row is {
                chapterNumber: number;
                fileName: string;
                byteSize: number;
              } => row != null,
            );

    if (fromStorage.length === 0) {
      toast.error(
        stored.success === false
          ? (stored.error ?? "Gespeicherte Kapitel konnten nicht geladen werden.")
          : "Noch keine fertigen Kapitel.",
      );
      return;
    }

    const zip = new JSZip();
    const failed: number[] = [];
    let firstErrorHint: string | null = null;
    let added = 0;
    for (const item of fromStorage) {
      const response = await fetch(
        hoerbuchPlayPath(roman.id, item.chapterNumber, item.byteSize, {
          tolino: true,
        }),
      );
      if (!response.ok) {
        failed.push(item.chapterNumber);
        if (!firstErrorHint) {
          const body = (await response.text().catch(() => "")).trim();
          firstErrorHint =
            body.slice(0, 160) || `HTTP ${response.status}`;
        }
        continue;
      }
      zip.file(item.fileName, await response.arrayBuffer());
      added += 1;
    }
    if (added === 0) {
      toast.error(
        failed.length
          ? `Kein Kapitel ladbar (u. a. Kap. ${failed.slice(0, 5).join(", ")})${
              firstErrorHint ? `: ${firstErrorHint}` : "."
            }`
          : "Noch keine fertigen Kapitel.",
      );
      return;
    }
    const blob = await zip.generateAsync({ type: "blob" });
    downloadBlob(blob, romanHoerbuchZipFilename(roman.title, lang));
    if (failed.length) {
      toast.success(
        `ZIP mit ${added} Kapitel — fehlgeschlagen: ${failed.join(", ")}`,
      );
    } else {
      toast.success(`ZIP mit ${added} Kapitel heruntergeladen.`);
    }
  }

  const deleteChapter = chapters.find((c) => c.number === deleteChapterNumber);
  const deleteLabel = deleteChapter
    ? `Kapitel ${deleteChapter.number}${
        deleteChapter.title ? ` — ${deleteChapter.title}` : ""
      }`
    : deleteChapterNumber != null
      ? `Kapitel ${deleteChapterNumber}`
      : "Kapitel";

  return (
    <div className="space-y-6">
      <RomanSceneWaitDialog
        open={waitOpen}
        variant="export-file"
        contextLabel="Hörbuch"
        title={waitTitle}
        progressLabel={waitProgress}
        activeStepIndex={waitStepIndex}
        steps={HOERBUCH_WAIT_STEPS}
        footer={
          mode === "cast"
            ? "Mehrere Stimmen — längere Kapitel können mehrere Minuten brauchen."
            : "Längere Kapitel können mehrere Minuten brauchen."
        }
        agentInfo={{
          roleLabel: mode === "cast" ? "ElevenLabs Dialog" : "ElevenLabs TTS",
          modelLabel: "eleven_v4",
        }}
      />
      <ConfirmDeleteDialog
        open={deleteChapterNumber != null}
        title="Hörbuch-Kapitel löschen?"
        description={`${deleteLabel}: Die MP3-Datei wird aus dem Supabase-Speicher entfernt. Manuskript- und Roman-Text bleiben unverändert. Du kannst das Kapitel später neu erzeugen.`}
        confirmLabel="Kapitel-Audio löschen"
        pending={deletePending}
        onCancel={() => {
          if (!deletePending) setDeleteChapterNumber(null);
        }}
        onConfirm={() => void confirmDeleteChapter()}
      />
      <p className="text-sm font-semibold text-zinc-600">
        Jedes Kapitel einzeln erzeugen — MP3s und Stimmenauswahl bleiben
        gespeichert. ZIP liefert Tolino-taugliche Stereo-128-kbps-Dateien.
      </p>

      {!isClever ? (
        <fieldset className="space-y-2">
          <legend className="text-sm font-extrabold text-zinc-950">
            Textquelle
          </legend>
          <div className="flex flex-wrap gap-3">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-bold text-zinc-800 ring-1 ring-zinc-950/10">
              <input
                type="radio"
                name="hoerbuch-prose-source"
                checked={proseSource === "manuskript"}
                disabled={busy || !hasManuskriptProse}
                onChange={() => setProseSource("manuskript")}
                className="accent-orange-700"
              />
              Manuskript
              {!hasManuskriptProse ? " (leer)" : ""}
            </label>
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-bold text-zinc-800 ring-1 ring-zinc-950/10">
              <input
                type="radio"
                name="hoerbuch-prose-source"
                checked={proseSource === "roman"}
                disabled={busy || !hasRomanProse}
                onChange={() => setProseSource("roman")}
                className="accent-orange-700"
              />
              Roman
              {!hasRomanProse ? " (noch kein Feinschliff)" : ""}
            </label>
          </div>
        </fieldset>
      ) : null}

      {chapters.length === 0 ? (
        <p className="rounded-2xl bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-950 ring-1 ring-amber-200">
          {isClever
            ? "Zuerst Geschichten im Tab Geschichten erzeugen."
            : proseSource === "roman"
              ? "Zuerst im Tab Roman verbessern — oder Manuskript als Quelle wählen."
              : "Zuerst ein Manuskript im Tab Manuskript erzeugen."}
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-3">
            <label className="block space-y-1.5">
              <span className="text-[10px] font-bold tracking-wide text-zinc-400 uppercase">
                Sprache
              </span>
              <select
                value={lang}
                disabled={busy}
                onChange={(e) =>
                  setLang(e.target.value as RomanHoerbuchLanguageCode)
                }
                className="min-w-[12rem] rounded-xl bg-gray-100 px-3 py-2 text-sm font-semibold text-zinc-950 outline-none ring-1 ring-zinc-950/10 focus:bg-white focus:ring-2 focus:ring-orange-700 disabled:opacity-50"
              >
                {ROMAN_HOERBUCH_LANGUAGES.map((item) => (
                  <option key={item.code} value={item.code}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <fieldset className="space-y-1.5">
              <legend className="text-[10px] font-bold tracking-wide text-zinc-400 uppercase">
                Stimmen
              </legend>
              <div className="flex flex-wrap gap-2">
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-full bg-gray-100 px-3 py-2 text-sm font-bold text-zinc-800 ring-1 ring-zinc-950/10">
                  <input
                    type="radio"
                    name="hoerbuch-tab-mode"
                    checked={mode === "single"}
                    disabled={busy}
                    onChange={() => setMode("single")}
                    className="accent-orange-700"
                  />
                  Eine Stimme
                </label>
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-full bg-gray-100 px-3 py-2 text-sm font-bold text-zinc-800 ring-1 ring-zinc-950/10">
                  <input
                    type="radio"
                    name="hoerbuch-tab-mode"
                    checked={mode === "cast"}
                    disabled={busy}
                    onChange={() => setMode("cast")}
                    className="accent-orange-700"
                  />
                  Mehrere Charaktere
                </label>
              </div>
            </fieldset>
            <button
              type="button"
              disabled={busy}
              onClick={() => void runAll()}
              className="rounded-full bg-orange-700 px-5 py-2.5 text-sm font-bold text-white hover:bg-orange-800 disabled:opacity-50"
            >
              {busyAll ? "Alle laufen …" : "Alle Kapitel erzeugen"}
            </button>
            <button
              type="button"
              disabled={busy || doneCount === 0}
              onClick={() => void downloadZipOfDone()}
              className="rounded-full bg-white px-5 py-2.5 text-sm font-bold text-zinc-950 ring-1 ring-zinc-950/15 hover:bg-zinc-50 disabled:opacity-50"
            >
              Tolino-ZIP ({doneCount})
            </button>
          </div>

          {mode === "cast" ? (
            <div className="space-y-3 rounded-2xl bg-white px-4 py-4 ring-1 ring-zinc-950/10">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-semibold text-zinc-500">
                  {uniqueCastVoices}/{ROMAN_HOERBUCH_MAX_VOICES} Stimmen
                  {voicesLoading
                    ? " · laden …"
                    : ` · ${voices.length} verfügbar`}
                  {savedPrefs?.mode === "cast" &&
                  Object.keys(savedPrefs.casting).length > 0
                    ? " · gespeichert"
                    : ""}
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busy || hintApplying || prefsSaving}
                    onClick={() => void applyScreenshotCasting()}
                    className="rounded-full bg-white px-4 py-2 text-xs font-bold text-zinc-950 ring-1 ring-zinc-950/15 hover:bg-zinc-50 disabled:opacity-50"
                  >
                    {hintApplying
                      ? "Stimmen zuordnen …"
                      : "Screenshot-Stimmen zuordnen"}
                  </button>
                  <button
                    type="button"
                    disabled={busy || prefsSaving || hintApplying}
                    onClick={() => void persistPrefs()}
                    className="rounded-full bg-orange-700 px-4 py-2 text-xs font-bold text-white hover:bg-orange-800 disabled:opacity-50"
                  >
                    {prefsSaving ? "Speichert …" : "Stimmen speichern"}
                  </button>
                </div>
              </div>
              <p className="text-[11px] font-semibold text-zinc-400">
                Ordnet Lucius (Erzähler), Leo liest, Lennart, Emilia, Torsten,
                Rebecca Green und Voice of Gad den Spec-Figuren zu.
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                {castingRoles.map((role) => (
                  <div key={role.key} className="space-y-1">
                    <span className="text-[10px] font-bold tracking-wide text-zinc-400 uppercase">
                      {role.label}
                      {role.hint ? (
                        <span className="ml-1 font-semibold normal-case text-zinc-400">
                          · {role.hint}
                        </span>
                      ) : null}
                    </span>
                    <TtsVoicePicker
                      voices={voices}
                      value={casting[role.key] ?? ""}
                      disabled={busy || prefsSaving || hintApplying}
                      loading={voicesLoading}
                      allowEmpty={role.key !== ROMAN_HOERBUCH_NARRATOR_KEY}
                      onChange={(voiceId) => setCastVoice(role.key, voiceId)}
                    />
                  </div>
                ))}
              </div>

              {speakerPreview ? (
                <div className="space-y-2 border-t border-zinc-100 pt-3">
                  <div className="flex flex-wrap items-end justify-between gap-2">
                    <div className="space-y-1">
                      <p className="text-[10px] font-bold tracking-wide text-zinc-400 uppercase">
                        Sprecher-Vorschau
                      </p>
                      <p className="text-xs font-semibold text-zinc-500">
                        {speakerPreview.totalTurns} Turns ·{" "}
                        {speakerPreview.dialogueTurns} Dialog ·{" "}
                        {speakerPreview.uniqueSpeakers} Figuren erkannt
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <select
                        value={effectivePreviewNumber ?? ""}
                        disabled={busy}
                        onChange={(e) =>
                          setPreviewChapterNumber(Number(e.target.value))
                        }
                        className="rounded-lg bg-gray-100 px-2 py-1.5 text-xs font-semibold text-zinc-950 outline-none ring-1 ring-zinc-950/10"
                      >
                        {chapters.map((c) => (
                          <option key={c.number} value={c.number}>
                            Kap. {c.number}
                            {c.title ? ` — ${c.title}` : ""}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => setPreviewExpanded((v) => !v)}
                        className="rounded-full bg-zinc-900 px-3 py-1.5 text-xs font-bold text-white hover:bg-zinc-800 disabled:opacity-50"
                      >
                        {previewExpanded ? "Vorschau schließen" : "Vorschau zeigen"}
                      </button>
                    </div>
                  </div>
                  {previewExpanded ? (
                    <ul className="max-h-80 space-y-2 overflow-y-auto rounded-xl bg-zinc-50 px-3 py-3 ring-1 ring-zinc-950/5">
                      {speakerPreview.turns.slice(0, 40).map((turn, index) => (
                        <li
                          key={`${turn.speakerKey}-${index}`}
                          className="space-y-0.5"
                        >
                          <p className="text-[11px] font-extrabold text-zinc-900">
                            {speakerPreview.roleLabel(turn.speakerKey)}
                            <span className="ml-1 font-semibold text-zinc-400">
                              · {speakerPreview.voiceLabel(turn.speakerKey)}
                            </span>
                          </p>
                          <p className="text-xs font-semibold leading-snug text-zinc-600">
                            {turn.text.length > 160
                              ? `${turn.text.slice(0, 160)}…`
                              : turn.text}
                          </p>
                        </li>
                      ))}
                      {speakerPreview.turns.length > 40 ? (
                        <li className="text-xs font-semibold text-zinc-400">
                          … und {speakerPreview.turns.length - 40} weitere Turns
                        </li>
                      ) : null}
                    </ul>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-semibold text-zinc-500">
                Eine Stimme aus Admin → KI-Modelle → Vorlesen.
                {savedPrefs ? " · Sprache/Quelle gespeichert" : ""}
              </p>
              <button
                type="button"
                disabled={busy || prefsSaving}
                onClick={() => void persistPrefs()}
                className="rounded-full bg-white px-4 py-2 text-xs font-bold text-zinc-950 ring-1 ring-zinc-950/15 hover:bg-zinc-50 disabled:opacity-50"
              >
                {prefsSaving ? "Speichert …" : "Einstellungen speichern"}
              </button>
            </div>
          )}

          {storedLoading ? (
            <p className="text-xs font-semibold text-zinc-500">
              Gespeicherte Kapitel laden …
            </p>
          ) : null}

          <ul className="space-y-3">
            {chapters.map((chapter) => {
              const runtime = runtimeByNumber[chapter.number] ?? emptyRuntime();
              const isThisBusy = busyChapter === chapter.number || busyAll;
              return (
                <li
                  key={chapter.number}
                  className={cn(
                    "space-y-3 rounded-2xl px-4 py-4 ring-1",
                    runtime.status === "done"
                      ? "bg-emerald-50/80 ring-emerald-200"
                      : runtime.status === "error"
                        ? "bg-amber-50 ring-amber-200"
                        : runtime.status === "running"
                          ? "bg-orange-50 ring-orange-200"
                          : "bg-white ring-zinc-950/10",
                  )}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1">
                      <p className="text-sm font-extrabold text-zinc-950">
                        Kapitel {chapter.number}
                        {chapter.title ? ` — ${chapter.title}` : ""}
                      </p>
                      <p className="text-xs font-semibold text-zinc-500">
                        {chapter.body.trim().length.toLocaleString("de-DE")}{" "}
                        Zeichen
                        {runtime.status === "idle"
                          ? " · noch nicht erzeugt"
                          : ""}
                        {runtime.status === "running" && runtime.progress
                          ? ` · ${runtime.progress}`
                          : ""}
                        {runtime.status === "done" && runtime.audio
                          ? ` · gespeichert · ${Math.max(1, Math.round(runtime.audio.bytes / 1024))} KB${
                              runtime.audio.languageCode
                                ? ` · ${runtime.audio.languageCode}`
                                : ""
                            }`
                          : ""}
                        {runtime.status === "error" && runtime.error
                          ? ` · ${runtime.error}`
                          : ""}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {runtime.audio || runtime.status === "done" ? (
                        <button
                          type="button"
                          disabled={busy || deletePending}
                          onClick={() => setDeleteChapterNumber(chapter.number)}
                          className="rounded-full bg-white px-4 py-2 text-xs font-bold text-red-800 ring-1 ring-red-200 hover:bg-red-50 disabled:opacity-50"
                        >
                          Löschen
                        </button>
                      ) : null}
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void runOne(chapter.number)}
                        className="rounded-full bg-zinc-900 px-4 py-2 text-xs font-bold text-white hover:bg-zinc-800 disabled:opacity-50"
                      >
                        {isThisBusy && runtime.status === "running"
                          ? "Erzeugt …"
                          : runtime.status === "done"
                            ? "Erneut erzeugen"
                            : "Dieses Kapitel erzeugen"}
                      </button>
                    </div>
                  </div>
                  {runtime.audio ? (
                    <HoerbuchAudioPlayer
                      romanId={roman.id}
                      chapterNumber={chapter.number}
                      fileName={runtime.audio.fileName}
                      byteSize={runtime.audio.bytes}
                      fallbackUrl={runtime.audio.url}
                    />
                  ) : null}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
