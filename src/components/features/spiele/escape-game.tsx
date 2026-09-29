"use client";

/**
 * Solo escape-room mini adventure for ages ~8–10 (Bibliothek-Escape).
 */

import { useEffect, useRef, useState } from "react";
import { KeyRound, Lightbulb, RotateCcw, Trophy } from "lucide-react";
import { toast } from "sonner";
import {
  cellsMatchTargetEitherWay,
  CODE_ANSWER,
  CODE_CLUES,
  ESCAPE_STAGE_COUNT,
  FINAL_ANSWER,
  FINAL_SCRAMBLE,
  normalizeAnswer,
  STAGE_TITLES,
  SUCHSEL_LETTERS,
  SUCHSEL_TARGET,
  SYMBOL_CLUE,
  SYMBOL_ORDER,
  suchselTargetCells,
  type CellPos,
  type EscapeStageId,
} from "@/lib/spiele/escape/puzzles";
import { shuffleInPlace } from "@/lib/spiele/shuffle";
import { cn } from "@/lib/utils";

/**
 * Escape UI — mount via client loader (`ssr: false`) so shuffles stay client-only.
 */
export function EscapeGame() {
  const [stage, setStage] = useState<EscapeStageId>(1);
  const [won, setWon] = useState(false);
  const [hintsUsed, setHintsUsed] = useState(0);
  const [showHint, setShowHint] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const [selectedCells, setSelectedCells] = useState<CellPos[]>([]);
  const [symbolPick, setSymbolPick] = useState<string[]>([]);
  const [symbolChoices, setSymbolChoices] = useState(() =>
    shuffleInPlace([...SYMBOL_ORDER]),
  );
  const [codeInput, setCodeInput] = useState("");
  const [finalLetters, setFinalLetters] = useState(() =>
    shuffleInPlace([...FINAL_SCRAMBLE]),
  );
  const [finalBuilt, setFinalBuilt] = useState<string[]>([]);
  const resetTimeoutRef = useRef<number | null>(null);

  function clearResetTimeout() {
    if (resetTimeoutRef.current !== null) {
      window.clearTimeout(resetTimeoutRef.current);
      resetTimeoutRef.current = null;
    }
  }

  useEffect(() => () => clearResetTimeout(), []);

  function restart() {
    clearResetTimeout();
    setStage(1);
    setWon(false);
    setHintsUsed(0);
    setShowHint(false);
    setFeedback(null);
    setSelectedCells([]);
    setSymbolPick([]);
    setSymbolChoices(shuffleInPlace([...SYMBOL_ORDER]));
    setCodeInput("");
    setFinalLetters(shuffleInPlace([...FINAL_SCRAMBLE]));
    setFinalBuilt([]);
  }

  function advance() {
    setShowHint(false);
    setFeedback(null);
    if (stage >= ESCAPE_STAGE_COUNT) {
      setWon(true);
      toast.success("Frei! Die Bibliothek ist wieder offen.");
      return;
    }
    setStage((s) => (s + 1) as EscapeStageId);
    toast.success("Tür auf — weiter geht’s!");
  }

  function useHint() {
    setShowHint(true);
    setFeedback(null);
    setHintsUsed((n) => n + 1);
  }

  function toggleSuchselCell(row: number, col: number) {
    setFeedback(null);
    setSelectedCells((prev) => {
      const idx = prev.findIndex((c) => c.row === row && c.col === col);
      if (idx >= 0) return prev.filter((_, i) => i !== idx);
      if (prev.length >= SUCHSEL_TARGET.length) return prev;
      return [...prev, { row, col }];
    });
  }

  function checkSuchsel() {
    const target = suchselTargetCells();
    if (cellsMatchTargetEitherWay(selectedCells, target)) {
      advance();
      setSelectedCells([]);
      return;
    }
    setFeedback(
      "Noch nicht — tippe die Buchstaben von SCHLUESSEL der Reihe nach an.",
    );
  }

  function pickSymbol(emoji: string) {
    if (symbolPick.includes(emoji)) return;
    setFeedback(null);
    const next = [...symbolPick, emoji];
    setSymbolPick(next);
    if (next.length < SYMBOL_ORDER.length) return;
    const ok = next.every((e, i) => e === SYMBOL_ORDER[i]);
    if (ok) {
      setSymbolPick([]);
      advance();
    } else {
      setFeedback("Falsche Reihenfolge — nochmal von vorn.");
      clearResetTimeout();
      resetTimeoutRef.current = window.setTimeout(() => {
        resetTimeoutRef.current = null;
        setSymbolPick([]);
      }, 500);
    }
  }

  function checkCode() {
    if (normalizeAnswer(codeInput) === CODE_ANSWER) {
      setCodeInput("");
      advance();
      return;
    }
    setFeedback("Code stimmt noch nicht. Schau auf die Bücherregal-Hinweise.");
  }

  function pickFinalLetter(letter: string, index: number) {
    setFeedback(null);
    setFinalLetters((prev) => prev.filter((_, i) => i !== index));
    setFinalBuilt((prev) => [...prev, letter]);
  }

  function undoFinalLetter() {
    setFeedback(null);
    setFinalBuilt((prev) => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1]!;
      setFinalLetters((letters) => [...letters, last]);
      return prev.slice(0, -1);
    });
  }

  function checkFinal() {
    if (finalBuilt.join("") === FINAL_ANSWER) {
      advance();
      return;
    }
    setFeedback("Noch nicht das Geheimwort — Buchstaben neu legen.");
  }

  const hintText =
    stage === 1
      ? "Das Wort steht waagerecht in einer Zeile und heißt SCHLUESSEL."
      : stage === 2
        ? SYMBOL_CLUE
        : stage === 3
          ? "Der Code ist die Reihenfolge rot → grün → blau → gelb: 3142."
          : "Das Geheimwort ist der Name dieser Lese-App: LESENO.";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[10px] font-extrabold tracking-wide text-amber-800 uppercase">
            Solo · Escape-Rätsel
          </p>
          <h1 className="text-3xl font-extrabold tracking-tight text-zinc-950 sm:text-4xl">
            Bibliothek-Escape
          </h1>
          <p className="mt-2 max-w-xl text-sm font-semibold text-zinc-600">
            Die Bibliothek ist zugesperrt! Löse vier Rätsel nacheinander — wie in
            einem Escape Room, kindgerecht ab ca. 8 Jahren.
          </p>
        </div>
        <button
          type="button"
          onClick={restart}
          className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2.5 text-sm font-bold text-zinc-800 ring-1 ring-zinc-950/10 hover:bg-zinc-50"
        >
          <RotateCcw className="size-4" aria-hidden />
          Von vorn
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {([1, 2, 3, 4] as EscapeStageId[]).map((id) => (
          <span
            key={id}
            className={cn(
              "rounded-full px-3 py-1.5 text-[10px] font-extrabold tracking-wide uppercase",
              won || stage > id
                ? "bg-emerald-100 text-emerald-900"
                : stage === id
                  ? "bg-amber-500 text-white"
                  : "bg-zinc-200 text-zinc-500",
            )}
          >
            {id}. {STAGE_TITLES[id].split("·")[1]?.trim() ?? id}
          </span>
        ))}
      </div>

      {won ? (
        <div className="space-y-4 rounded-[1.75rem] bg-emerald-50 p-6 ring-1 ring-emerald-200">
          <div className="flex items-start gap-3">
            <Trophy className="mt-0.5 size-6 text-emerald-800" aria-hidden />
            <div>
              <p className="text-lg font-extrabold text-emerald-950">
                Entkommen!
              </p>
              <p className="mt-1 text-sm font-semibold text-emerald-900">
                Alle Rätsel gelöst
                {hintsUsed > 0
                  ? ` · ${hintsUsed} Hinweis${hintsUsed === 1 ? "" : "e"} genutzt`
                  : " · ohne Hinweise"}
                .
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={restart}
            className="rounded-full bg-emerald-800 px-5 py-2.5 text-sm font-bold text-white hover:bg-emerald-900"
          >
            Nochmal spielen
          </button>
        </div>
      ) : (
        <div className="space-y-5 rounded-[1.75rem] bg-white p-5 ring-1 ring-zinc-950/10 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="inline-flex items-center gap-1.5 text-xs font-extrabold tracking-wide text-amber-800 uppercase">
                <KeyRound className="size-3.5" aria-hidden />
                {STAGE_TITLES[stage]}
              </p>
              <p className="mt-2 text-sm font-semibold text-zinc-700">
                {stage === 1 &&
                  "Finde das Wort SCHLUESSEL im Buchstabensalat — tippe die Buchstaben der Reihe nach an."}
                {stage === 2 &&
                  "Die Wächter-Tiere wollen in der richtigen Reihenfolge begrüßt werden."}
                {stage === 3 &&
                  "Lies die Regal-Zettel und tippe den vierstelligen Code."}
                {stage === 4 &&
                  "Lege die Buchstaben zum Geheimwort um — dann öffnet sich die Tür."}
              </p>
            </div>
            <button
              type="button"
              onClick={useHint}
              className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-950 ring-1 ring-amber-200"
            >
              <Lightbulb className="size-3.5" aria-hidden />
              Hinweis
            </button>
          </div>

          {showHint ? (
            <p className="rounded-2xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-950 ring-1 ring-amber-200">
              {hintText}
            </p>
          ) : null}

          {feedback ? (
            <p
              role="status"
              className="rounded-2xl bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-950 ring-1 ring-rose-200"
            >
              {feedback}
            </p>
          ) : null}

          {stage === 1 ? (
            <div className="space-y-4">
              <div
                className="mx-auto grid w-full max-w-md gap-1"
                style={{
                  gridTemplateColumns: `repeat(${SUCHSEL_LETTERS[0]!.length}, minmax(0, 1fr))`,
                }}
              >
                {SUCHSEL_LETTERS.map((row, r) =>
                  row.map((letter, c) => {
                    const selIdx = selectedCells.findIndex(
                      (x) => x.row === r && x.col === c,
                    );
                    const selected = selIdx >= 0;
                    return (
                      <button
                        key={`${r}-${c}`}
                        type="button"
                        onClick={() => toggleSuchselCell(r, c)}
                        className={cn(
                          "aspect-square rounded-md text-xs font-extrabold sm:rounded-lg sm:text-sm",
                          selected
                            ? "bg-amber-500 text-white ring-2 ring-amber-700"
                            : "bg-amber-50 text-zinc-900 ring-1 ring-amber-200 hover:bg-amber-100",
                        )}
                      >
                        {letter}
                        {selected ? (
                          <span className="block text-[8px] font-bold opacity-80">
                            {selIdx + 1}
                          </span>
                        ) : null}
                      </button>
                    );
                  }),
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedCells([])}
                  className="rounded-full bg-zinc-100 px-4 py-2 text-xs font-bold text-zinc-700"
                >
                  Auswahl leeren
                </button>
                <button
                  type="button"
                  onClick={checkSuchsel}
                  className="rounded-full bg-amber-600 px-4 py-2 text-xs font-bold text-white hover:bg-amber-700"
                >
                  Prüfen ({selectedCells.length}/{SUCHSEL_TARGET.length})
                </button>
              </div>
            </div>
          ) : null}

          {stage === 2 ? (
            <div className="space-y-4">
              <p className="rounded-2xl bg-sky-50 px-4 py-3 text-sm font-semibold text-sky-950 ring-1 ring-sky-200">
                {SYMBOL_CLUE}
              </p>
              <div className="flex flex-wrap justify-center gap-3">
                {symbolChoices.map((emoji) => {
                  const used = symbolPick.includes(emoji);
                  return (
                    <button
                      key={emoji}
                      type="button"
                      disabled={used}
                      onClick={() => pickSymbol(emoji)}
                      className={cn(
                        "flex size-16 items-center justify-center rounded-2xl text-3xl sm:size-20 sm:text-4xl",
                        used
                          ? "bg-zinc-100 opacity-40"
                          : "bg-sky-100 ring-1 ring-sky-300 hover:bg-sky-200",
                      )}
                      aria-label={`Tier ${emoji}`}
                    >
                      {emoji}
                    </button>
                  );
                })}
              </div>
              <p className="text-center text-sm font-semibold text-zinc-600">
                Bisher: {symbolPick.join(" → ") || "—"}
              </p>
            </div>
          ) : null}

          {stage === 3 ? (
            <div className="space-y-4">
              <ul className="grid gap-2 sm:grid-cols-2">
                {CODE_CLUES.map((c) => (
                  <li
                    key={c.text}
                    className="flex items-center gap-3 rounded-2xl bg-zinc-50 px-4 py-3 text-sm font-semibold text-zinc-800 ring-1 ring-zinc-950/5"
                  >
                    <span className="text-2xl" aria-hidden>
                      {c.emoji}
                    </span>
                    {c.text}
                  </li>
                ))}
              </ul>
              <p className="text-xs font-semibold text-zinc-500">
                Reihenfolge der Ziffern: rot, grün, blau, gelb.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  value={codeInput}
                  onChange={(e) =>
                    setCodeInput(e.target.value.replace(/\D/g, "").slice(0, 4))
                  }
                  inputMode="numeric"
                  placeholder="····"
                  aria-label="Zahlencode"
                  className="w-36 rounded-2xl bg-amber-50 px-4 py-3 text-center text-xl font-extrabold tracking-[0.3em] text-zinc-950 outline-none ring-1 ring-amber-200 focus:ring-2 focus:ring-amber-600"
                />
                <button
                  type="button"
                  onClick={checkCode}
                  className="rounded-full bg-amber-600 px-5 py-3 text-sm font-bold text-white hover:bg-amber-700"
                >
                  Code öffnen
                </button>
              </div>
            </div>
          ) : null}

          {stage === 4 ? (
            <div className="space-y-4">
              <div className="flex min-h-14 flex-wrap items-center justify-center gap-2 rounded-2xl bg-emerald-50 px-4 py-3 ring-1 ring-emerald-200">
                {finalBuilt.length === 0 ? (
                  <span className="text-sm font-semibold text-emerald-900/60">
                    Tippe Buchstaben an …
                  </span>
                ) : (
                  finalBuilt.map((l, i) => (
                    <span
                      key={`${l}-${i}`}
                      className="flex size-10 items-center justify-center rounded-xl bg-white text-lg font-extrabold text-zinc-950 ring-1 ring-emerald-300"
                    >
                      {l}
                    </span>
                  ))
                )}
              </div>
              <div className="flex flex-wrap justify-center gap-2">
                {finalLetters.map((letter, index) => (
                  <button
                    key={`${letter}-${index}`}
                    type="button"
                    onClick={() => pickFinalLetter(letter, index)}
                    className="flex size-12 items-center justify-center rounded-xl bg-amber-100 text-lg font-extrabold text-zinc-950 ring-1 ring-amber-300 hover:bg-amber-200"
                  >
                    {letter}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap justify-center gap-2">
                <button
                  type="button"
                  onClick={undoFinalLetter}
                  disabled={finalBuilt.length === 0}
                  className="rounded-full bg-zinc-100 px-4 py-2 text-xs font-bold text-zinc-700 disabled:opacity-40"
                >
                  Letzten zurück
                </button>
                <button
                  type="button"
                  onClick={checkFinal}
                  disabled={finalBuilt.length !== FINAL_ANSWER.length}
                  className="rounded-full bg-emerald-700 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-800 disabled:opacity-40"
                >
                  Tür öffnen
                </button>
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
