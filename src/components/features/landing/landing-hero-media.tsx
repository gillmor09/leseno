"use client";

/**
 * Landing hero image: click opens the featured admin video clip in a dialog.
 */

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Play, X } from "lucide-react";

const HERO_VIDEO_SRC = "/api/landing/hero-video";

type LandingHeroMediaProps = {
  /** When false, image is static (clip missing / no service role). */
  videoAvailable: boolean;
};

export function LandingHeroMedia({ videoAvailable }: LandingHeroMediaProps) {
  const [open, setOpen] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const el = videoRef.current;
    if (!el) return;
    void el.play().catch(() => undefined);
  }, [open]);

  const image = (
    <Image
      src="/landing/hero-lesen.webp"
      alt="Kind taucht in eine eigene Geschichte ein — aus dem Buch steigt ein Abenteuer"
      width={1536}
      height={1024}
      className="h-auto w-full"
      sizes="(max-width: 1024px) 100vw, 50vw"
      priority
      fetchPriority="high"
    />
  );

  return (
    <>
      {videoAvailable ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="group relative block w-full overflow-hidden rounded-[2rem] bg-white text-left shadow-xl ring-1 ring-zinc-950/10 transition hover:ring-orange-700/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-700"
          aria-label="Hero-Video abspielen"
        >
          {image}
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-gradient-to-t from-zinc-950/35 via-transparent to-transparent opacity-80 transition group-hover:opacity-100"
          />
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <span className="inline-flex size-16 items-center justify-center rounded-full bg-amber-400 text-zinc-950 shadow-lg ring-4 ring-white/40 transition group-hover:scale-105 sm:size-[4.5rem]">
              <Play className="size-7 fill-current pl-0.5" aria-hidden />
            </span>
          </span>
        </button>
      ) : (
        <div className="overflow-hidden rounded-[2rem] bg-white shadow-xl ring-1 ring-zinc-950/10">
          {image}
        </div>
      )}

      {open
        ? createPortal(
            <div
              role="dialog"
              aria-modal="true"
              aria-label="leseno Hero-Video"
              className="fixed inset-0 z-[100] flex items-center justify-center bg-zinc-950/70 p-4 backdrop-blur-sm"
              onClick={() => setOpen(false)}
            >
              <div
                className="relative w-full max-w-4xl overflow-hidden rounded-[1.75rem] bg-zinc-950 shadow-2xl ring-1 ring-white/15"
                onClick={(event) => event.stopPropagation()}
              >
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="absolute top-3 right-3 z-10 inline-flex size-10 items-center justify-center rounded-full bg-zinc-950/70 text-white ring-1 ring-white/20 hover:bg-zinc-900"
                  aria-label="Video schließen"
                >
                  <X className="size-5" aria-hidden />
                </button>
                <video
                  ref={videoRef}
                  src={HERO_VIDEO_SRC}
                  controls
                  playsInline
                  autoPlay
                  className="aspect-video max-h-[min(80vh,720px)] w-full bg-black object-contain"
                />
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
