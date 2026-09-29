"use client";

/**
 * React shell for Sternenlauf (Phaser skill runner). Canvas mounts client-only.
 */

import { useEffect, useRef, useState } from "react";
import { RotateCcw, Trophy, Zap } from "lucide-react";
import {
  STERNENLAUF_HEIGHT,
  STERNENLAUF_WIDTH,
} from "@/lib/spiele/sternenlauf/constants";
import { SpieleStat } from "@/components/features/spiele/spiele-stat";

type RunState = "ready" | "playing" | "over" | "boot";

export function SternenlaufGame() {
  const hostRef = useRef<HTMLDivElement>(null);
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [runState, setRunState] = useState<RunState>("boot");
  const [bootError, setBootError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let destroyed = false;
    let destroyGame: (() => void) | null = null;

    async function boot() {
      try {
        const { createSternenlaufGame } = await import(
          "@/lib/spiele/sternenlauf/create-game"
        );
        if (destroyed || !hostRef.current) return;
        hostRef.current.replaceChildren();
        const destroy = createSternenlaufGame(hostRef.current, {
          onScore: (next) => {
            if (destroyed) return;
            setScore((prev) => (prev === next ? prev : next));
          },
          onBest: (next) => {
            if (destroyed) return;
            setBest((prev) => (prev === next ? prev : next));
          },
          onState: (next) => {
            if (destroyed) return;
            setRunState((prev) => (prev === next ? prev : next));
          },
        });
        if (destroyed) {
          destroy();
          return;
        }
        destroyGame = destroy;
      } catch (err) {
        console.error(err);
        if (!destroyed) {
          setBootError("Spiel konnte nicht geladen werden. Bitte neu laden.");
        }
      }
    }

    void boot();

    return () => {
      destroyed = true;
      destroyGame?.();
    };
  }, [reloadToken]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[10px] font-extrabold tracking-wide text-orange-800 uppercase">
            Solo · Geschicklichkeit · Phaser
          </p>
          <h1 className="text-3xl font-extrabold tracking-tight text-zinc-950 sm:text-4xl">
            Sternenlauf
          </h1>
          <p className="mt-2 max-w-xl text-sm font-semibold text-zinc-600">
            Endlos-Parcours: spring über Hindernisse, sammle Sterne. Tempo steigt
            — wie die großen Jump-and-Run-Hits, nur kindgerecht im Browser.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setScore(0);
            setRunState("boot");
            setBootError(null);
            setReloadToken((n) => n + 1);
          }}
          className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2.5 text-sm font-bold text-zinc-800 ring-1 ring-zinc-950/10 hover:bg-zinc-50"
        >
          <RotateCcw className="size-4" aria-hidden />
          Neu laden
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <SpieleStat label="Score" value={String(score)} />
        <SpieleStat label="Bestwert" value={String(best)} />
        <SpieleStat
          label="Status"
          value={
            runState === "playing"
              ? "Unterwegs"
              : runState === "over"
                ? "Getroffen"
                : runState === "ready"
                  ? "Bereit"
                  : "Lädt…"
          }
        />
      </div>

      {runState === "over" ? (
        <div className="flex items-start gap-3 rounded-2xl bg-orange-50 px-4 py-3 ring-1 ring-orange-200">
          <Trophy
            className="mt-0.5 size-5 shrink-0 text-orange-800"
            aria-hidden
          />
          <div>
            <p className="text-sm font-extrabold text-orange-950">
              Runde vorbei — Score {score}
            </p>
            <p className="mt-0.5 text-sm font-semibold text-orange-900">
              Tippe ins Spielfeld für den nächsten Versuch.
            </p>
          </div>
        </div>
      ) : (
        <p className="flex items-start gap-2 rounded-2xl bg-orange-50 px-4 py-3 text-sm font-semibold text-orange-950 ring-1 ring-orange-200">
          <Zap className="mt-0.5 size-4 shrink-0" aria-hidden />
          Leertaste, Pfeil hoch oder Tippen = springen. Hindernisse meiden,
          Sterne einsammeln.
        </p>
      )}

      {bootError ? (
        <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-900 ring-1 ring-red-200">
          {bootError}
        </p>
      ) : null}

      <div className="overflow-hidden rounded-[1.75rem] bg-orange-950/5 ring-1 ring-orange-200">
        <div
          ref={hostRef}
          className="mx-auto w-full max-w-3xl [&_canvas]:h-auto [&_canvas]:max-h-[min(70vh,450px)] [&_canvas]:w-full"
          style={{
            aspectRatio: `${STERNENLAUF_WIDTH} / ${STERNENLAUF_HEIGHT}`,
          }}
          role="application"
          aria-label="Sternenlauf Spielfeld"
        />
      </div>
    </div>
  );
}
