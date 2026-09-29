"use client";

/**
 * Kid-friendly Memory (Memo) — flip cards, find animal pairs.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { RotateCcw, Trophy } from "lucide-react";
import {
  createMemoryDeck,
  gridColsForPairs,
  MEMORY_PAIR_COUNTS,
  type MemoryCard,
  type MemoryDifficulty,
} from "@/lib/spiele/memory/deck";
import { SpieleStat } from "@/components/features/spiele/spiele-stat";
import { cn } from "@/lib/utils";

type GameStatus = "ready" | "playing" | "won";

function formatTime(totalSec: number): string {
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/**
 * Memory UI — mount only via client loader (`ssr: false`) so deck shuffle
 * never hydrates against a different SSR random order.
 */
export function MemoryGame() {
  const [difficulty, setDifficulty] = useState<MemoryDifficulty>("mittel");
  const [deck, setDeck] = useState<MemoryCard[]>(() =>
    createMemoryDeck(MEMORY_PAIR_COUNTS.mittel),
  );
  const [flipped, setFlipped] = useState<string[]>([]);
  const [matched, setMatched] = useState<Set<string>>(() => new Set());
  const [moves, setMoves] = useState(0);
  const [status, setStatus] = useState<GameStatus>("ready");
  const [seconds, setSeconds] = useState(0);
  const [lockBoard, setLockBoard] = useState(false);
  const startedRef = useRef(false);
  const flipTimeoutRef = useRef<number | null>(null);

  const pairCount = MEMORY_PAIR_COUNTS[difficulty];
  const cols = gridColsForPairs(pairCount);
  const totalPairs = pairCount;
  const foundPairs = matched.size / 2;

  function clearFlipTimeout() {
    if (flipTimeoutRef.current !== null) {
      window.clearTimeout(flipTimeoutRef.current);
      flipTimeoutRef.current = null;
    }
  }

  useEffect(() => () => clearFlipTimeout(), []);

  useEffect(() => {
    if (status !== "playing") return;
    const id = window.setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => window.clearInterval(id);
  }, [status]);

  function restart(nextDifficulty: MemoryDifficulty = difficulty) {
    clearFlipTimeout();
    setDifficulty(nextDifficulty);
    setDeck(createMemoryDeck(MEMORY_PAIR_COUNTS[nextDifficulty]));
    setFlipped([]);
    setMatched(new Set());
    setMoves(0);
    setSeconds(0);
    setStatus("ready");
    setLockBoard(false);
    startedRef.current = false;
  }

  function onCardClick(card: MemoryCard) {
    if (lockBoard) return;
    if (matched.has(card.key) || flipped.includes(card.key)) return;
    if (flipped.length >= 2) return;

    if (!startedRef.current) {
      startedRef.current = true;
      setStatus("playing");
    }

    const nextFlipped = [...flipped, card.key];
    setFlipped(nextFlipped);

    if (nextFlipped.length < 2) return;

    setMoves((m) => m + 1);
    const [aKey, bKey] = nextFlipped;
    const a = deck.find((c) => c.key === aKey);
    const b = deck.find((c) => c.key === bKey);
    if (!a || !b) return;

    if (a.faceId === b.faceId) {
      const nextMatched = new Set([...matched, a.key, b.key]);
      setMatched(nextMatched);
      setFlipped([]);
      if (nextMatched.size === deck.length) {
        setStatus("won");
      }
      return;
    }

    setLockBoard(true);
    clearFlipTimeout();
    flipTimeoutRef.current = window.setTimeout(() => {
      flipTimeoutRef.current = null;
      setFlipped([]);
      setLockBoard(false);
    }, 750);
  }

  const bestHint = useMemo(() => {
    if (status !== "won") return null;
    if (moves <= totalPairs + 2) return "Wahnsinn — fast ohne Fehlversuche!";
    if (moves <= totalPairs * 2) return "Super Gedächtnis!";
    return "Geschafft — weiter üben macht dich noch schneller.";
  }, [status, moves, totalPairs]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[10px] font-extrabold tracking-wide text-sky-800 uppercase">
            Solo · Memory
          </p>
          <h1 className="text-3xl font-extrabold tracking-tight text-zinc-950 sm:text-4xl">
            Tier-Memory
          </h1>
          <p className="mt-2 max-w-xl text-sm font-semibold text-zinc-600">
            Decke Karten auf und finde die Paare. Ein Klassiker — und super fürs
            Gedächtnis.
          </p>
        </div>
        <button
          type="button"
          onClick={() => restart()}
          className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2.5 text-sm font-bold text-zinc-800 ring-1 ring-zinc-950/10 hover:bg-zinc-50"
        >
          <RotateCcw className="size-4" aria-hidden />
          Neu mischen
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {(
          [
            ["leicht", "Leicht · 6 Paare"],
            ["mittel", "Mittel · 8 Paare"],
            ["schwer", "Schwer · 12 Paare"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => restart(id)}
            className={cn(
              "rounded-full px-4 py-2 text-xs font-bold",
              difficulty === id
                ? "bg-sky-700 text-white"
                : "bg-white text-zinc-700 ring-1 ring-zinc-950/10",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <SpieleStat label="Züge" value={String(moves)} />
        <SpieleStat label="Paare" value={`${foundPairs} / ${totalPairs}`} />
        <SpieleStat label="Zeit" value={formatTime(seconds)} />
      </div>

      {status === "won" ? (
        <div className="flex items-start gap-3 rounded-2xl bg-emerald-50 px-4 py-3 ring-1 ring-emerald-200">
          <Trophy className="mt-0.5 size-5 shrink-0 text-emerald-800" aria-hidden />
          <div>
            <p className="text-sm font-extrabold text-emerald-950">
              Alle Paare gefunden!
            </p>
            <p className="mt-0.5 text-sm font-semibold text-emerald-900">
              {moves} Züge · {formatTime(seconds)}
              {bestHint ? ` — ${bestHint}` : ""}
            </p>
          </div>
        </div>
      ) : (
        <p className="rounded-2xl bg-sky-50 px-4 py-3 text-sm font-semibold text-sky-950 ring-1 ring-sky-200">
          Tippe eine Karte an, dann eine zweite. Gleich = Paar bleibt offen.
        </p>
      )}

      <div
        className="mx-auto grid w-full max-w-2xl gap-2 sm:gap-3"
        style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
      >
        {deck.map((card) => {
          const isOpen =
            flipped.includes(card.key) || matched.has(card.key);
          const isMatched = matched.has(card.key);
          return (
            <button
              key={card.key}
              type="button"
              disabled={lockBoard || isMatched || status === "won"}
              onClick={() => onCardClick(card)}
              aria-label={
                isOpen
                  ? `${card.label} (offen)`
                  : "Verdeckte Memory-Karte"
              }
              className={cn(
                "relative aspect-square rounded-2xl transition duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 focus-visible:ring-offset-2",
                isOpen
                  ? isMatched
                    ? "bg-emerald-100 ring-2 ring-emerald-400"
                    : "bg-white ring-2 ring-sky-400 shadow-md"
                  : "bg-gradient-to-br from-sky-600 to-sky-800 ring-1 ring-sky-900/20 hover:brightness-110 active:scale-[0.98]",
              )}
            >
              {isOpen ? (
                <span className="flex h-full flex-col items-center justify-center gap-0.5 p-1">
                  <span className="text-3xl sm:text-4xl" aria-hidden>
                    {card.emoji}
                  </span>
                  <span className="text-[10px] font-extrabold tracking-wide text-zinc-700 uppercase sm:text-xs">
                    {card.label}
                  </span>
                </span>
              ) : (
                <span className="flex h-full items-center justify-center text-2xl font-extrabold text-sky-100/90 sm:text-3xl">
                  ?
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
