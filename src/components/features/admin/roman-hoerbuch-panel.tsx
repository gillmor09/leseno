"use client";

/**
 * Dedicated Hörbuch tab: per-chapter TTS / casting, Storage-backed MP3s.
 * Export tab stays PDF/EPUB/marketing only.
 */

import { useEffect, useMemo, useState } from "react";
import JSZip from "jszip";
import { toast } from "sonner";
import {
  listRomanHoerbuchStoredAction,
  saveRomanHoerbuchPrefsAction,
} from "@/app/actions/roman-hoerbuch";
import { RomanSceneWaitDialog } from "@/components/features/admin/roman-scene-wait-dialog";
import { TtsVoicePicker } from "@/components/features/admin/tts-voice-picker";
import type { TtsVoiceOption } from "@/lib/ai/tts-voices";
import type {
  RomanEditorial,
  RomanHoerbuchPrefs,
} from "@/lib/roman/editorial";
import {
  isRomanHoerbuchLanguageCode,
  ROMAN_HOERBUCH_LANGUAGES,
  romanHoerbuchZipFilename,
  type RomanHoerbuchLanguageCode,
} from "@/lib/roman/export-roman-hoerbuch";
import {
  listRomanHoerbuchCastingRoles,
  ROMAN_HOERBUCH_MAX_VOICES,
  ROMAN_HOERBUCH_NARRATOR_KEY,
  ROMAN_HOERBUCH_UNKNOWN_KEY,
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
        const response = await fetch(result.url);
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

  async function downloadZipOfDone() {
    const zip = new JSZip();
    let added = 0;
    for (const chapter of chapters) {
      const item = runtimeByNumber[chapter.number]?.audio;
      if (!item) continue;
      const response = await fetch(item.url);
      if (!response.ok) continue;
      zip.file(item.fileName, await response.arrayBuffer());
      added += 1;
    }
    if (added === 0) {
      toast.error("Noch keine fertigen Kapitel.");
      return;
    }
    const blob = await zip.generateAsync({ type: "blob" });
    downloadBlob(blob, romanHoerbuchZipFilename(roman.title, lang));
    toast.success(`ZIP mit ${added} Kapitel heruntergeladen.`);
  }

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
      <p className="text-sm font-semibold text-zinc-600">
        Jedes Kapitel einzeln erzeugen — MP3s und Stimmenauswahl bleiben
        gespeichert. ZIP optional aus den fertigen Kapiteln.
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
              ZIP der fertigen ({doneCount})
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
                <button
                  type="button"
                  disabled={busy || prefsSaving}
                  onClick={() => void persistPrefs()}
                  className="rounded-full bg-orange-700 px-4 py-2 text-xs font-bold text-white hover:bg-orange-800 disabled:opacity-50"
                >
                  {prefsSaving ? "Speichert …" : "Stimmen speichern"}
                </button>
              </div>
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
                      disabled={busy || prefsSaving}
                      loading={voicesLoading}
                      allowEmpty={role.key !== ROMAN_HOERBUCH_NARRATOR_KEY}
                      onChange={(voiceId) => setCastVoice(role.key, voiceId)}
                    />
                  </div>
                ))}
              </div>
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
                  {runtime.audio ? (
                    <div className="space-y-2">
                      <audio
                        controls
                        preload="metadata"
                        src={runtime.audio.url}
                        className="w-full"
                      />
                      <a
                        href={runtime.audio.url}
                        download={runtime.audio.fileName}
                        className="inline-flex text-xs font-bold text-orange-800 hover:underline"
                      >
                        MP3 laden ({runtime.audio.fileName})
                      </a>
                    </div>
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
