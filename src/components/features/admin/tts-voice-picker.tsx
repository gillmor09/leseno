"use client";

/**
 * ElevenLabs voice select with search + Hörprobe (preview URL or short TTS).
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  ensureElevenLabsVoiceAction,
  previewTtsVoiceAction,
} from "@/app/actions/prompt-admin";
import type { TtsVoiceOption } from "@/lib/ai/tts-voices";

function voiceMatchesQuery(voice: TtsVoiceOption, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const hay = `${voice.label} ${voice.description ?? ""} ${voice.id}`.toLowerCase();
  return hay.includes(q);
}

export function TtsVoicePicker({
  voices,
  value,
  disabled,
  loading,
  allowEmpty,
  emptyLabel = "Wie Erzähler",
  onChange,
}: {
  voices: TtsVoiceOption[];
  value: string;
  disabled?: boolean;
  loading?: boolean;
  allowEmpty?: boolean;
  emptyLabel?: string;
  onChange: (voiceId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [previewing, setPreviewing] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  const filtered = useMemo(
    () => voices.filter((v) => voiceMatchesQuery(v, query)),
    [voices, query],
  );

  const selected =
    voices.find((v) => v.id === value) ??
    (value
      ? ({ id: value, label: value } satisfies TtsVoiceOption)
      : null);

  useEffect(() => {
    return () => {
      audioRef.current?.pause();
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    };
  }, []);

  async function playPreview() {
    if (!selected?.id || previewing) return;
    setPreviewing(true);
    try {
      if (selected.publicOwnerId) {
        const ensured = await ensureElevenLabsVoiceAction({
          voiceId: selected.id,
          publicOwnerId: selected.publicOwnerId,
        });
        if (!ensured.success) {
          toast.error(ensured.error ?? "Stimme konnte nicht geladen werden.");
          return;
        }
      }

      if (selected.previewUrl) {
        audioRef.current?.pause();
        const audio = new Audio(selected.previewUrl);
        audioRef.current = audio;
        await audio.play();
        return;
      }

      const result = await previewTtsVoiceAction({
        provider: "elevenlabs",
        voiceId: selected.id,
        publicOwnerId: selected.publicOwnerId ?? null,
        previewUrl: selected.previewUrl ?? null,
      });
      if (!result.success || !result.data) {
        toast.error(result.error ?? "Hörprobe fehlgeschlagen.");
        return;
      }
      if (result.data.previewUrl) {
        audioRef.current?.pause();
        const audio = new Audio(result.data.previewUrl);
        audioRef.current = audio;
        await audio.play();
        return;
      }
      if (!result.data.audioBase64) {
        toast.error("Keine Hörprobe verfügbar.");
        return;
      }
      const binary = atob(result.data.audioBase64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) {
        bytes[i] = binary.charCodeAt(i);
      }
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
      const url = URL.createObjectURL(
        new Blob([bytes], { type: result.data.mimeType }),
      );
      objectUrlRef.current = url;
      audioRef.current?.pause();
      const audio = new Audio(url);
      audioRef.current = audio;
      await audio.play();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Hörprobe fehlgeschlagen.",
      );
    } finally {
      setPreviewing(false);
    }
  }

  async function handleChange(nextId: string) {
    onChange(nextId);
    const voice = voices.find((v) => v.id === nextId);
    if (voice?.publicOwnerId) {
      void ensureElevenLabsVoiceAction({
        voiceId: voice.id,
        publicOwnerId: voice.publicOwnerId,
      }).then((result) => {
        if (!result.success) {
          toast.error(result.error ?? "Stimme konnte nicht hinzugefügt werden.");
        }
      });
    }
  }

  return (
    <div className="space-y-1.5">
      <div className="flex gap-2">
        <select
          value={value}
          disabled={disabled || loading}
          onChange={(e) => void handleChange(e.target.value)}
          className="min-w-0 flex-1 rounded-xl bg-gray-100 px-3 py-2 text-sm font-semibold text-zinc-950 outline-none ring-1 ring-zinc-950/10 focus:bg-white focus:ring-2 focus:ring-orange-700 disabled:opacity-50"
        >
          {allowEmpty ? <option value="">{emptyLabel}</option> : null}
          {selected && !voices.some((v) => v.id === selected.id) ? (
            <option value={selected.id}>Aktuell: {selected.label}</option>
          ) : null}
          {filtered.map((voice) => (
            <option key={voice.id} value={voice.id}>
              {voice.label}
              {voice.description ? ` — ${voice.description}` : ""}
              {voice.previewUrl ? " · Probe" : ""}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={disabled || loading || previewing || !value}
          onClick={() => void playPreview()}
          className="shrink-0 rounded-xl bg-white px-3 py-2 text-xs font-bold text-zinc-950 ring-1 ring-zinc-950/15 hover:bg-zinc-50 disabled:opacity-50"
          title="Hörprobe abspielen"
        >
          {previewing ? "…" : "▶ Probe"}
        </button>
      </div>
      <input
        type="search"
        value={query}
        disabled={disabled || loading}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Stimme suchen …"
        className="w-full rounded-lg bg-gray-50 px-2.5 py-1.5 text-xs font-semibold text-zinc-800 outline-none ring-1 ring-zinc-950/10 focus:bg-white focus:ring-2 focus:ring-orange-700 disabled:opacity-50"
      />
    </div>
  );
}
