"use client";

/**
 * Tab 10 Hörbuch: Kapitel-Tracks anlegen, einzeln mit Gemini TTS vertonen,
 * Tolino-MP3 (44.1 kHz / 128 kbps) + Hörprobe + ZIP.
 */

import { useEffect, useMemo, useState } from "react";
import JSZip from "jszip";
import { toast } from "sonner";
import {
  buildSachbuchHoerbuchTracksAction,
  deleteSachbuchHoerbuchTrackAction,
  downloadSachbuchHoerbuchZipMetaAction,
  ensureSachbuchHoerbuchIntroOutroAction,
  listSachbuchHoerbuchStoredAction,
  listSachbuchHoerbuchVoicesAction,
  saveSachbuchHoerbuchPrefsAction,
  trimSachbuchHoerbuchSampleAction,
  type SachbuchHoerbuchStoredTrack,
} from "@/app/actions/sachbuch-hoerbuch";
import { SachbuchWaitDialog } from "@/components/features/admin/sachbuch-wait-dialog";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import type { TtsVoiceOption } from "@/lib/ai/tts-voices";
import {
  emptySachbuchHoerbuchState,
  estimateSpokenDurationSec,
  groupHoerbuchTracksByKapitel,
  SACHBUCH_HOERBUCH_DEFAULT_PROVIDER,
  SACHBUCH_HOERBUCH_DEFAULT_VOICE,
  SACHBUCH_HOERBUCH_ELEVENLABS_DEFAULT_VOICE,
  SACHBUCH_HOERBUCH_ELEVENLABS_MODEL_SLUG,
  SACHBUCH_HOERBUCH_MODEL_SLUG,
  SACHBUCH_HOERBUCH_SAMPLE_MIN_SEC,
  SACHBUCH_HOERBUCH_SAMPLE_MAX_SEC,
  sachbuchHoerbuchDefaultVoiceForProvider,
  sachbuchHoerbuchModelSlugForProvider,
} from "@/lib/sachbuch/hoerbuch";
import { mergeSachbuchProseFromPrevious } from "@/lib/sachbuch/parse";
import type {
  SachbuchHoerbuchTtsProvider,
  SachbuchKontext,
} from "@/lib/sachbuch/types";
import { cn } from "@/lib/utils";

function applySlimBook(
  onBookUpdate: (book: SachbuchKontext) => void,
  prev: SachbuchKontext,
  next: SachbuchKontext | null | undefined,
) {
  if (!next) return;
  onBookUpdate(mergeSachbuchProseFromPrevious(prev, next));
}

const WAIT_STEPS = [
  "Text vorbereiten",
  "TTS (Gemini oder ElevenLabs)",
  "Tolino-MP3 (44,1 kHz / 128 kbps)",
  "In Storage speichern",
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

function playPath(
  sachbuchId: string,
  trackId: string,
  byteSize: number,
): string {
  return `/api/admin/sachbuch/hoerbuch/play/${sachbuchId}/${encodeURIComponent(trackId)}?v=${byteSize}`;
}

type TrackRuntime = {
  status: "idle" | "running" | "done" | "error";
  error: string | null;
};

function emptyRuntime(): TrackRuntime {
  return { status: "idle", error: null };
}

export function SachbuchHoerbuchPanel({
  book,
  canSave,
  onBookUpdate,
}: {
  book: SachbuchKontext;
  canSave: boolean;
  onBookUpdate: (book: SachbuchKontext) => void;
}) {
  const hoerbuch = book.idee.hoerbuch ?? emptySachbuchHoerbuchState();
  const [provider, setProvider] = useState<SachbuchHoerbuchTtsProvider>(
    hoerbuch.provider || SACHBUCH_HOERBUCH_DEFAULT_PROVIDER,
  );
  const [voiceId, setVoiceId] = useState(
    hoerbuch.voiceId || SACHBUCH_HOERBUCH_DEFAULT_VOICE,
  );
  const [geminiVoiceId, setGeminiVoiceId] = useState(
    SACHBUCH_HOERBUCH_DEFAULT_VOICE,
  );
  const [elevenVoiceId, setElevenVoiceId] = useState(
    SACHBUCH_HOERBUCH_ELEVENLABS_DEFAULT_VOICE,
  );
  const [style, setStyle] = useState(hoerbuch.style);
  const [geminiVoices, setGeminiVoices] = useState<TtsVoiceOption[]>([]);
  const [elevenVoices, setElevenVoices] = useState<TtsVoiceOption[]>([]);
  const [stored, setStored] = useState<SachbuchHoerbuchStoredTrack[]>([]);
  const [samplePlay, setSamplePlay] = useState<{
    fileName: string;
    playUrl: string;
    byteSize: number;
    durationSec: number;
  } | null>(null);
  const [building, setBuilding] = useState(false);
  const [ensuringCredits, setEnsuringCredits] = useState(false);
  const [prefsSaving, setPrefsSaving] = useState(false);
  const [zipPending, setZipPending] = useState(false);
  const [trimSamplePending, setTrimSamplePending] = useState(false);
  const [runtimes, setRuntimes] = useState<Record<string, TrackRuntime>>({});
  const [waitOpen, setWaitOpen] = useState(false);
  const [waitLabel, setWaitLabel] = useState("");
  const [waitStartedAt, setWaitStartedAt] = useState<number | null>(null);
  const [deleteTrackId, setDeleteTrackId] = useState<string | null>(null);
  const [deletePending, setDeletePending] = useState(false);

  const groups = useMemo(
    () => groupHoerbuchTracksByKapitel(book, hoerbuch.tracks),
    [book, hoerbuch.tracks],
  );

  const doneCount = hoerbuch.tracks.filter((t) => t.audio).length;

  useEffect(() => {
    const nextProvider =
      hoerbuch.provider || SACHBUCH_HOERBUCH_DEFAULT_PROVIDER;
    const nextVoice =
      hoerbuch.voiceId || sachbuchHoerbuchDefaultVoiceForProvider(nextProvider);
    setProvider(nextProvider);
    setVoiceId(nextVoice);
    setStyle(hoerbuch.style);
    if (nextProvider === "elevenlabs") {
      setElevenVoiceId(nextVoice);
    } else {
      setGeminiVoiceId(nextVoice);
    }
  }, [hoerbuch.provider, hoerbuch.voiceId, hoerbuch.style]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [v, s] = await Promise.all([
        listSachbuchHoerbuchVoicesAction(),
        listSachbuchHoerbuchStoredAction({ sachbuchId: book.id }),
      ]);
      if (cancelled) return;
      if (v.success && v.data) {
        setGeminiVoices(v.data.gemini?.length ? v.data.gemini : v.data.voices);
        setElevenVoices(v.data.elevenlabs ?? []);
      }
      if (s.success && s.data) {
        setStored(s.data.tracks);
        setSamplePlay(s.data.sample);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [book.id, hoerbuch.tracksBuiltAt, doneCount]);

  function selectProvider(next: SachbuchHoerbuchTtsProvider) {
    setProvider(next);
    const remembered =
      next === "elevenlabs" ? elevenVoiceId : geminiVoiceId;
    setVoiceId(
      remembered || sachbuchHoerbuchDefaultVoiceForProvider(next),
    );
  }

  async function refreshBookFromServer() {
    const s = await listSachbuchHoerbuchStoredAction({ sachbuchId: book.id });
    if (s.success && s.data) {
      setStored(s.data.tracks);
      setSamplePlay(s.data.sample);
    }
  }

  async function onBuildTracks() {
    if (!canSave || building) return;
    setBuilding(true);
    try {
      const res = await buildSachbuchHoerbuchTracksAction({
        sachbuchId: book.id,
      });
      if (!res.success || !res.data) {
        toast.error(res.error ?? "Tracks anlegen fehlgeschlagen.");
        return;
      }
      applySlimBook(onBookUpdate, book, res.data.book);
      toast.success(
        `${res.data.trackCount} Kapitel-Tracks angelegt` +
          (res.data.withAudio
            ? ` (${res.data.withAudio} mit Audio behalten)`
            : ""),
      );
    } finally {
      setBuilding(false);
    }
  }

  /** Add Intro/Outro only — never rebuilds existing Kapitel tracks. */
  async function onEnsureIntroOutro() {
    if (!canSave || ensuringCredits || !hoerbuch.tracks.length) return;
    setEnsuringCredits(true);
    try {
      const res = await ensureSachbuchHoerbuchIntroOutroAction({
        sachbuchId: book.id,
      });
      if (!res.success || !res.data) {
        toast.error(res.error ?? "Intro/Outro ergänzen fehlgeschlagen.");
        return;
      }
      applySlimBook(onBookUpdate, book, res.data.book);
      if (
        !res.data.addedIntro &&
        !res.data.addedOutro &&
        !res.data.updatedIntro
      ) {
        toast.message("Intro und Outro sind schon vorhanden.");
        return;
      }
      if (res.data.updatedIntro && !res.data.addedIntro && !res.data.addedOutro) {
        toast.success(
          "Intro-Text aktualisiert — bitte Intro neu vertonen.",
        );
        return;
      }
      const bits = [
        res.data.addedIntro ? "Intro" : null,
        res.data.addedOutro ? "Outro" : null,
        res.data.updatedIntro ? "Intro-Text" : null,
      ].filter(Boolean);
      toast.success(
        `${bits.join(" + ")} — bestehende Kapitel-Vertonungen unverändert.`,
      );
    } finally {
      setEnsuringCredits(false);
    }
  }

  async function onSavePrefs() {
    if (!canSave || prefsSaving) return;
    setPrefsSaving(true);
    try {
      const res = await saveSachbuchHoerbuchPrefsAction({
        sachbuchId: book.id,
        provider,
        voiceId,
        style,
      });
      if (!res.success || !res.data) {
        toast.error(res.error ?? "Speichern fehlgeschlagen.");
        return;
      }
      applySlimBook(onBookUpdate, book, res.data.book);
      toast.success("Stimme gespeichert.");
    } finally {
      setPrefsSaving(false);
    }
  }

  async function synthesizeTrack(trackId: string) {
    if (!canSave) return;
    setRuntimes((m) => ({
      ...m,
      [trackId]: { status: "running", error: null },
    }));
    setWaitOpen(true);
    setWaitLabel(
      provider === "elevenlabs"
        ? "ElevenLabs v4 Turbo vertont …"
        : "Gemini TTS vertont …",
    );
    setWaitStartedAt(Date.now());
    try {
      const res = await fetch("/api/admin/sachbuch/hoerbuch/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sachbuchId: book.id,
          trackId,
          provider,
          voiceId,
          style,
        }),
      });
      const json = (await res.json()) as {
        success?: boolean;
        error?: string;
        data?: {
          fileName: string;
          byteSize: number;
          modelSlug?: string;
          provider?: SachbuchHoerbuchTtsProvider;
        };
      };
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Vertonung fehlgeschlagen.");
      }
      setRuntimes((m) => ({
        ...m,
        [trackId]: { status: "done", error: null },
      }));
      toast.success(`Fertig: ${json.data?.fileName ?? "Track"}`);
      onBookUpdate({
        ...book,
        idee: {
          ...book.idee,
          hoerbuch: {
            ...hoerbuch,
            provider,
            voiceId,
            style,
            tracks: hoerbuch.tracks.map((t) =>
              t.id === trackId
                ? {
                    ...t,
                    audio: {
                      storagePath: `${book.id}/${json.data?.fileName ?? t.fileName}`,
                      byteSize: json.data?.byteSize ?? 0,
                      durationSec: null,
                      modelSlug:
                        json.data?.modelSlug ||
                        sachbuchHoerbuchModelSlugForProvider(provider),
                      voiceId,
                      generatedAt: new Date().toISOString(),
                    },
                  }
                : t,
            ),
          },
        },
      });
      await refreshBookFromServer();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Vertonung fehlgeschlagen.";
      setRuntimes((m) => ({
        ...m,
        [trackId]: { status: "error", error: msg },
      }));
      toast.error(msg);
    } finally {
      setWaitOpen(false);
      setWaitLabel("");
      setWaitStartedAt(null);
    }
  }

  async function synthesizeSample() {
    if (!canSave) return;
    setWaitOpen(true);
    setWaitLabel("Hörprobe wird erzeugt …");
    setWaitStartedAt(Date.now());
    try {
      const res = await fetch("/api/admin/sachbuch/hoerbuch/sample", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sachbuchId: book.id,
          provider,
          voiceId,
          style,
        }),
      });
      const json = (await res.json()) as {
        success?: boolean;
        error?: string;
        data?: { fileName: string; durationSec: number; byteSize: number };
      };
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Hörprobe fehlgeschlagen.");
      }
      const dur = json.data?.durationSec ?? 0;
      if (dur < SACHBUCH_HOERBUCH_SAMPLE_MIN_SEC) {
        toast.warning(
          `Hörprobe nur ${Math.round(dur)}s — Tolino verlangt 90–180s. Mehr Tracks/Text nutzen.`,
        );
      } else {
        toast.success(
          `Hörprobe fertig (${Math.round(dur)}s, Ziel ${SACHBUCH_HOERBUCH_SAMPLE_MIN_SEC}–${SACHBUCH_HOERBUCH_SAMPLE_MAX_SEC}s).`,
        );
      }
      await refreshBookFromServer();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Hörprobe fehlgeschlagen.");
    } finally {
      setWaitOpen(false);
      setWaitLabel("");
      setWaitStartedAt(null);
    }
  }

  /** Cut existing sample to Tolino max — no TTS. */
  async function trimExistingSample() {
    if (!canSave || trimSamplePending || !samplePlay) return;
    setTrimSamplePending(true);
    setWaitOpen(true);
    setWaitLabel("Hörprobe auf max. 3:00 kürzen …");
    setWaitStartedAt(Date.now());
    try {
      const res = await trimSachbuchHoerbuchSampleAction({
        sachbuchId: book.id,
      });
      if (!res.success || !res.data) {
        toast.error(res.error ?? "Kürzung fehlgeschlagen.");
        return;
      }
      applySlimBook(onBookUpdate, book, res.data.book);
      setSamplePlay({
        fileName: res.data.fileName,
        playUrl: res.data.playUrl,
        byteSize: res.data.byteSize,
        durationSec: res.data.durationSec,
      });
      if (res.data.trimmed) {
        toast.success(
          `Hörprobe gekürzt auf ${Math.round(res.data.durationSec)}s (Tolino max. ${SACHBUCH_HOERBUCH_SAMPLE_MAX_SEC}s).`,
        );
      } else {
        toast.success(
          `Hörprobe war schon ok (${Math.round(res.data.durationSec)}s).`,
        );
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Kürzung fehlgeschlagen.");
    } finally {
      setTrimSamplePending(false);
      setWaitOpen(false);
      setWaitLabel("");
      setWaitStartedAt(null);
    }
  }

  async function onZip() {
    if (zipPending) return;
    setZipPending(true);
    try {
      const res = await downloadSachbuchHoerbuchZipMetaAction({
        sachbuchId: book.id,
      });
      if (!res.success || !res.data) {
        toast.error(res.error ?? "ZIP fehlgeschlagen.");
        return;
      }
      const zip = new JSZip();
      for (const f of res.data.files) {
        zip.file(f.fileName, f.base64, { base64: true });
      }
      const blob = await zip.generateAsync({ type: "blob" });
      downloadBlob(blob, res.data.zipName);
      toast.success("ZIP für Tolino Media bereit.");
    } finally {
      setZipPending(false);
    }
  }

  async function confirmDeleteAudio() {
    if (!deleteTrackId || deletePending) return;
    setDeletePending(true);
    try {
      const res = await deleteSachbuchHoerbuchTrackAction({
        sachbuchId: book.id,
        trackId: deleteTrackId,
      });
      if (!res.success || !res.data) {
        toast.error(res.error ?? "Löschen fehlgeschlagen.");
        return;
      }
      applySlimBook(onBookUpdate, book, res.data.book);
      toast.success("Audio gelöscht.");
      setDeleteTrackId(null);
      await refreshBookFromServer();
    } finally {
      setDeletePending(false);
    }
  }

  const storedById = useMemo(() => {
    const m = new Map<string, SachbuchHoerbuchStoredTrack>();
    for (const t of stored) m.set(t.trackId, t);
    return m;
  }, [stored]);

  return (
    <div className="space-y-6">
      <section className="rounded-2xl bg-white px-4 py-4 ring-1 ring-zinc-200/80 sm:px-5">
        <h2 className="text-lg font-extrabold text-zinc-950">10. Hörbuch</h2>
        <p className="mt-1 text-sm text-zinc-600">
          Tolino Media: eine MP3 pro Kapitel/Track (max. 60 Min., 44,1 kHz,
          128 kbps, Pegel −24…−14 dB RMS). Modell:{" "}
          <span className="font-semibold text-zinc-800">
            {SACHBUCH_HOERBUCH_MODEL_SLUG}
          </span>
          . Reihenfolge: Intro (0) → Vorwort → Kapitel → Outro. Anbieter
          Gemini TTS oder ElevenLabs v4 Turbo wählbar (A/B pro Track).
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!canSave || building || ensuringCredits}
            onClick={() => void onBuildTracks()}
            className="rounded-full bg-orange-700 px-4 py-2 text-sm font-bold text-white hover:bg-orange-800 disabled:opacity-50"
          >
            {building
              ? "Kapitel-Tracks werden angelegt …"
              : hoerbuch.tracks.length
                ? "Kapitel-Tracks neu anlegen"
                : "1. Kapitel-Tracks anlegen"}
          </button>
          <button
            type="button"
            disabled={
              !canSave ||
              !hoerbuch.tracks.length ||
              ensuringCredits ||
              building
            }
            onClick={() => void onEnsureIntroOutro()}
            className="rounded-full bg-white px-4 py-2 text-sm font-bold text-zinc-900 ring-1 ring-zinc-300 hover:bg-zinc-50 disabled:opacity-50"
          >
            {ensuringCredits
              ? "Intro/Outro …"
              : "Intro + Outro ergänzen"}
          </button>
          <button
            type="button"
            disabled={!canSave || !hoerbuch.tracks.length || zipPending}
            onClick={() => void onZip()}
            className="rounded-full bg-zinc-900 px-4 py-2 text-sm font-bold text-white hover:bg-zinc-800 disabled:opacity-50"
          >
            {zipPending ? "ZIP …" : "ZIP für Tolino herunterladen"}
          </button>
          <button
            type="button"
            disabled={!canSave || !hoerbuch.tracks.length}
            onClick={() => void synthesizeSample()}
            className="rounded-full bg-white px-4 py-2 text-sm font-bold text-zinc-900 ring-1 ring-zinc-300 hover:bg-zinc-50 disabled:opacity-50"
          >
            Hörprobe erzeugen (1:30–3:00)
          </button>
          <button
            type="button"
            disabled={!canSave || !samplePlay || trimSamplePending}
            onClick={() => void trimExistingSample()}
            className="rounded-full bg-amber-700 px-4 py-2 text-sm font-bold text-white hover:bg-amber-800 disabled:opacity-50"
            title="Bestehende Hörprobe ohne Neuvertonung auf max. 3:00 kürzen"
          >
            {trimSamplePending
              ? "Kürzung …"
              : "Hörprobe auf 3:00 kürzen"}
          </button>
        </div>

        <p className="mt-2 text-xs text-zinc-500">
          {hoerbuch.tracks.length
            ? `${doneCount}/${hoerbuch.tracks.length} Tracks vertont` +
              (hoerbuch.tracksBuiltAt
                ? ` · Tracks seit ${new Date(hoerbuch.tracksBuiltAt).toLocaleString("de-DE")}`
                : "")
            : "Noch keine Tracks — zuerst Kapitel-Tracks anlegen."}
        </p>
      </section>

      <section className="rounded-2xl bg-white px-4 py-4 ring-1 ring-zinc-200/80 sm:px-5">
        <h3 className="font-extrabold text-zinc-950">Stimme / Anbieter</h3>
        <p className="mt-1 text-sm text-zinc-600">
          Zum Kapitelvergleich Anbieter wechseln und einzelne Tracks neu
          vertonen. Gespeicherte MP3s bleiben bis zur Neuvertonung.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => selectProvider("gemini-tts")}
            className={cn(
              "rounded-2xl px-4 py-3 text-left ring-1 transition",
              provider === "gemini-tts"
                ? "bg-orange-50 ring-orange-400"
                : "bg-zinc-50 ring-zinc-200 hover:bg-white",
            )}
          >
            <p className="text-sm font-extrabold text-zinc-950">Gemini TTS</p>
            <p className="mt-0.5 text-xs text-zinc-600">
              {SACHBUCH_HOERBUCH_MODEL_SLUG}
            </p>
          </button>
          <button
            type="button"
            onClick={() => selectProvider("elevenlabs")}
            className={cn(
              "rounded-2xl px-4 py-3 text-left ring-1 transition",
              provider === "elevenlabs"
                ? "bg-orange-50 ring-orange-400"
                : "bg-zinc-50 ring-zinc-200 hover:bg-white",
            )}
          >
            <p className="text-sm font-extrabold text-zinc-950">
              ElevenLabs v4 Turbo
            </p>
            <p className="mt-0.5 text-xs text-zinc-600">
              {SACHBUCH_HOERBUCH_ELEVENLABS_MODEL_SLUG}
            </p>
          </button>
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {provider === "gemini-tts" ? (
            <label className="block text-sm">
              <span className="font-semibold text-zinc-700">Gemini-Stimme</span>
              <select
                value={voiceId}
                onChange={(e) => {
                  setVoiceId(e.target.value);
                  setGeminiVoiceId(e.target.value);
                }}
                className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 font-semibold text-zinc-900"
              >
                {(geminiVoices.length
                  ? geminiVoices
                  : [{ id: SACHBUCH_HOERBUCH_DEFAULT_VOICE, label: "Kore" }]
                ).map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.label}
                    {v.description ? ` — ${v.description}` : ""}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <label className="block text-sm">
              <span className="font-semibold text-zinc-700">
                ElevenLabs-Stimme
              </span>
              <select
                value={voiceId}
                onChange={(e) => {
                  setVoiceId(e.target.value);
                  setElevenVoiceId(e.target.value);
                }}
                className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 font-semibold text-zinc-900"
              >
                {(elevenVoices.length
                  ? elevenVoices
                  : [
                      {
                        id: SACHBUCH_HOERBUCH_ELEVENLABS_DEFAULT_VOICE,
                        label: "Standard (Sarah)",
                      },
                    ]
                ).map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.label}
                    {v.description ? ` — ${v.description}` : ""}
                  </option>
                ))}
              </select>
            </label>
          )}
          {provider === "gemini-tts" ? (
            <label className="block text-sm sm:col-span-2">
              <span className="font-semibold text-zinc-700">
                Stil (speech_metadata)
              </span>
              <textarea
                value={style}
                onChange={(e) => setStyle(e.target.value)}
                rows={2}
                className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm text-zinc-900"
              />
            </label>
          ) : (
            <p className="text-xs text-zinc-500 sm:col-span-2">
              ElevenLabs nutzt die gewählte Stimme ohne Gemini-Stilhinweis.
            </p>
          )}
        </div>
        <button
          type="button"
          disabled={!canSave || prefsSaving}
          onClick={() => void onSavePrefs()}
          className="mt-3 rounded-full bg-zinc-900 px-4 py-2 text-sm font-bold text-white hover:bg-zinc-800 disabled:opacity-50"
        >
          {prefsSaving ? "Speichern …" : "Anbieter & Stimme übernehmen"}
        </button>
      </section>

      {samplePlay ? (
        <section className="rounded-2xl bg-amber-50/60 px-4 py-4 ring-1 ring-amber-200/80 sm:px-5">
          <h3 className="font-extrabold text-amber-950">Hörprobe</h3>
          <p className="mt-1 text-sm text-amber-900/80">
            {samplePlay.fileName} · {Math.round(samplePlay.durationSec)}s ·{" "}
            {Math.round(samplePlay.byteSize / 1024)} KB
          </p>
          <audio
            className="mt-2 w-full"
            controls
            preload="metadata"
            src={playPath(book.id, "__sample__", samplePlay.byteSize)}
          />
        </section>
      ) : null}

      <div className="space-y-4">
        {groups.map(({ id, title, tracks }) => (
          <section
            key={id}
            className="rounded-2xl bg-white px-4 py-4 ring-1 ring-zinc-200/80 sm:px-5"
          >
            <h3 className="font-extrabold text-zinc-950">
              {title || "Kapitel"}
            </h3>
            <ul className="mt-3 space-y-3">
              {tracks.map((t) => {
                const rt = runtimes[t.id] ?? emptyRuntime();
                const st = storedById.get(t.id);
                const hasAudio = Boolean(t.audio || st?.playUrl);
                const bytes = t.audio?.byteSize || st?.byteSize || 0;
                return (
                  <li
                    key={t.id}
                    className={cn(
                      "rounded-xl px-3 py-3 ring-1",
                      hasAudio
                        ? "bg-emerald-50/50 ring-emerald-200/80"
                        : "bg-zinc-50 ring-zinc-200/80",
                    )}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="font-bold text-zinc-900">{t.title}</p>
                        <p className="text-xs text-zinc-500">
                          {t.fileName} · {t.charCount} Zeichen · ~{" "}
                          {estimateSpokenDurationSec(t.charCount)}s
                          {t.audio?.modelSlug
                            ? ` · ${t.audio.modelSlug}`
                            : ""}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={!canSave || rt.status === "running"}
                          onClick={() => void synthesizeTrack(t.id)}
                          className="rounded-full bg-orange-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-orange-800 disabled:opacity-50"
                        >
                          {rt.status === "running"
                            ? "Läuft …"
                            : hasAudio
                              ? "Neu vertonen"
                              : "Vertonen"}
                        </button>
                        {hasAudio ? (
                          <button
                            type="button"
                            disabled={!canSave}
                            onClick={() => setDeleteTrackId(t.id)}
                            className="rounded-full bg-white px-3 py-1.5 text-xs font-bold text-red-700 ring-1 ring-red-200 hover:bg-red-50 disabled:opacity-50"
                          >
                            Audio löschen
                          </button>
                        ) : null}
                      </div>
                    </div>
                    {rt.error ? (
                      <p className="mt-2 text-xs font-semibold text-red-700">
                        {rt.error}
                      </p>
                    ) : null}
                    {hasAudio && bytes > 0 ? (
                      <audio
                        className="mt-2 w-full"
                        controls
                        preload="metadata"
                        src={playPath(book.id, t.id, bytes)}
                      />
                    ) : null}
                    <details className="mt-2">
                      <summary className="cursor-pointer text-xs font-semibold text-zinc-500">
                        Textvorschau
                      </summary>
                      <p className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap text-xs text-zinc-700">
                        {t.text.slice(0, 1_200)}
                        {t.text.length > 1_200 ? "…" : ""}
                      </p>
                    </details>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>

      <SachbuchWaitDialog
        open={waitOpen}
        title="Hörbuch"
        steps={WAIT_STEPS}
        progressLabel={waitLabel}
        startedAtMs={waitStartedAt}
        footer="Bitte Fenster offen lassen — lange Abschnitte können mehrere Minuten dauern."
      />

      <ConfirmDeleteDialog
        open={Boolean(deleteTrackId)}
        title="Audio löschen?"
        description="Nur die MP3 dieses Tracks wird gelöscht. Der Text-Abschnitt bleibt erhalten."
        confirmLabel="Audio löschen"
        pending={deletePending}
        onCancel={() => {
          if (!deletePending) setDeleteTrackId(null);
        }}
        onConfirm={() => void confirmDeleteAudio()}
      />
    </div>
  );
}
