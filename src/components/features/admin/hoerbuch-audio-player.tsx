"use client";

/**
 * Hörbuch chapter player: stable element + play URL that supports seek/pause.
 * Uses the admin play route (sanitized MP3 + Accept-Ranges), not raw signed URLs.
 */

import { useEffect, useMemo, useRef } from "react";

export function HoerbuchAudioPlayer({
  romanId,
  chapterNumber,
  fileName,
  byteSize,
  /** Fallback signed URL if play route fails to mount. */
  fallbackUrl,
}: {
  romanId: string;
  chapterNumber: number;
  fileName: string;
  byteSize: number;
  fallbackUrl?: string;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const playSrc = useMemo(
    () =>
      `/api/admin/roman-hoerbuch/play/${romanId}/${chapterNumber}?v=${byteSize}`,
    [romanId, chapterNumber, byteSize],
  );

  // Keep playback position if the same chapter re-renders with a new token.
  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    const prev = el.dataset.chapterKey;
    const next = `${chapterNumber}:${byteSize}`;
    if (prev && prev !== next) {
      el.pause();
      el.currentTime = 0;
    }
    el.dataset.chapterKey = next;
  }, [chapterNumber, byteSize]);

  return (
    <div className="space-y-2">
      <audio
        ref={audioRef}
        key={`${chapterNumber}-${byteSize}`}
        controls
        preload="metadata"
        src={playSrc}
        className="w-full"
        onError={() => {
          const el = audioRef.current;
          if (!el || !fallbackUrl || el.src.includes(fallbackUrl)) return;
          el.src = fallbackUrl;
          el.load();
        }}
      />
      <a
        href={playSrc}
        download={fileName}
        className="inline-flex text-xs font-bold text-orange-800 hover:underline"
      >
        MP3 laden ({fileName})
      </a>
    </div>
  );
}
