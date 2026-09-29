"use client";

/**
 * Solo Bauwelt — Minecraft-style 2D block missions for ages ~8–10.
 */

import { useMemo, useState } from "react";
import { Eye, EyeOff, Eraser, RotateCcw, Trophy } from "lucide-react";
import { toast } from "sonner";
import {
  BLOCKS,
  cloneGrid,
  emptyGrid,
  gridsMatch,
  matchProgress,
  MISSIONS,
  type BlockId,
  type Mission,
  type MissionId,
} from "@/lib/spiele/bauwelt/missions";
import { SpieleStat } from "@/components/features/spiele/spiele-stat";
import { cn } from "@/lib/utils";

type Tool = Exclude<BlockId, "air"> | "erase";

export function BauweltGame() {
  const [missionId, setMissionId] = useState<MissionId>("turm");
  const mission = useMemo(
    () => MISSIONS.find((m) => m.id === missionId) ?? MISSIONS[0]!,
    [missionId],
  );
  const [grid, setGrid] = useState<BlockId[][]>(() =>
    emptyGrid(MISSIONS[0]!.cols, MISSIONS[0]!.rows),
  );
  const [tool, setTool] = useState<Tool>("brick");
  const [showGhost, setShowGhost] = useState(true);
  const [wonIds, setWonIds] = useState<Set<MissionId>>(() => new Set());
  const [placements, setPlacements] = useState(0);

  const progress = matchProgress(grid, mission.target);
  const isWon = wonIds.has(mission.id);
  const percent = Math.round((progress.correct / progress.total) * 100);

  function loadMission(next: Mission) {
    setMissionId(next.id);
    setGrid(emptyGrid(next.cols, next.rows));
    setTool(next.palette[0] ?? "brick");
    setPlacements(0);
  }

  function restart() {
    setGrid(emptyGrid(mission.cols, mission.rows));
    setPlacements(0);
    setWonIds((prev) => {
      const next = new Set(prev);
      next.delete(mission.id);
      return next;
    });
  }

  function markMissionWon() {
    setWonIds((prev) => {
      if (prev.has(mission.id)) return prev;
      const next = new Set(prev);
      next.add(mission.id);
      return next;
    });
    toast.success(`Mission „${mission.title}“ geschafft!`);
  }

  function paint(row: number, col: number) {
    if (isWon) return;
    const nextBlock: BlockId = tool === "erase" ? "air" : tool;
    if (grid[row]?.[col] === nextBlock) return;

    const next = cloneGrid(grid);
    const rowCells = next[row];
    if (!rowCells) return;
    rowCells[col] = nextBlock;
    setGrid(next);
    setPlacements((n) => n + 1);
    if (gridsMatch(next, mission.target)) {
      markMissionWon();
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[10px] font-extrabold tracking-wide text-emerald-800 uppercase">
            Solo · Bauen
          </p>
          <h1 className="text-3xl font-extrabold tracking-tight text-zinc-950 sm:text-4xl">
            Bauwelt
          </h1>
          <p className="mt-2 max-w-xl text-sm font-semibold text-zinc-600">
            Blockbauen wie der Kinder-Top-Seller: fünf Missionen nachbauen —
            Turm, Baum, Haus, Bibliothek und Burg. Ab ca. 8 Jahren.
          </p>
        </div>
        <button
          type="button"
          onClick={restart}
          className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2.5 text-sm font-bold text-zinc-800 ring-1 ring-zinc-950/10 hover:bg-zinc-50"
        >
          <RotateCcw className="size-4" aria-hidden />
          Neu starten
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {MISSIONS.map((m) => {
          const done = wonIds.has(m.id);
          const active = m.id === mission.id;
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => loadMission(m)}
              className={cn(
                "rounded-full px-4 py-2 text-xs font-bold",
                active
                  ? "bg-emerald-700 text-white"
                  : done
                    ? "bg-emerald-100 text-emerald-950 ring-1 ring-emerald-300"
                    : "bg-white text-zinc-700 ring-1 ring-zinc-950/10",
              )}
            >
              {done ? "✓ " : ""}
              {m.title}
            </button>
          );
        })}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <SpieleStat label="Treffer" value={`${percent} %`} />
        <SpieleStat label="Setzungen" value={String(placements)} />
        <SpieleStat
          label="Missionen"
          value={`${wonIds.size} / ${MISSIONS.length}`}
        />
      </div>

      {isWon ? (
        <div className="flex items-start gap-3 rounded-2xl bg-emerald-50 px-4 py-3 ring-1 ring-emerald-200">
          <Trophy
            className="mt-0.5 size-5 shrink-0 text-emerald-800"
            aria-hidden
          />
          <div>
            <p className="text-sm font-extrabold text-emerald-950">
              Bau fertig — super!
            </p>
            <p className="mt-0.5 text-sm font-semibold text-emerald-900">
              {mission.title} in {placements} Setzungen. Nächste Mission oben
              wählen.
            </p>
          </div>
        </div>
      ) : (
        <p className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-950 ring-1 ring-emerald-200">
          {mission.blurb} Wähle einen Block, tippe aufs Raster. Mit dem Radierer
          löschen.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {mission.palette.map((id) => {
          const meta = BLOCKS[id];
          return (
            <button
              key={id}
              type="button"
              onClick={() => setTool(id)}
              aria-pressed={tool === id}
              className={cn(
                "inline-flex items-center gap-2 rounded-2xl px-3 py-2 text-sm font-bold ring-1 transition",
                tool === id
                  ? "bg-emerald-700 text-white ring-emerald-800"
                  : "bg-white text-zinc-800 ring-zinc-950/10 hover:bg-zinc-50",
              )}
            >
              <span aria-hidden>{meta.emoji}</span>
              {meta.label}
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => setTool("erase")}
          aria-pressed={tool === "erase"}
          className={cn(
            "inline-flex items-center gap-2 rounded-2xl px-3 py-2 text-sm font-bold ring-1 transition",
            tool === "erase"
              ? "bg-zinc-800 text-white ring-zinc-900"
              : "bg-white text-zinc-800 ring-zinc-950/10 hover:bg-zinc-50",
          )}
        >
          <Eraser className="size-4" aria-hidden />
          Radierer
        </button>
        <button
          type="button"
          onClick={() => setShowGhost((v) => !v)}
          className="inline-flex items-center gap-2 rounded-2xl bg-white px-3 py-2 text-sm font-bold text-zinc-800 ring-1 ring-zinc-950/10 hover:bg-zinc-50"
        >
          {showGhost ? (
            <EyeOff className="size-4" aria-hidden />
          ) : (
            <Eye className="size-4" aria-hidden />
          )}
          {showGhost ? "Vorbild aus" : "Vorbild an"}
        </button>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <BuildGrid
          label="Deine Bauwelt"
          grid={grid}
          ghost={showGhost ? mission.target : null}
          interactive={!isWon}
          onPaint={paint}
        />
        <BuildGrid
          label="Vorbild"
          grid={mission.target}
          ghost={null}
          interactive={false}
          onPaint={() => {}}
        />
      </div>
    </div>
  );
}

function BuildGrid({
  label,
  grid,
  ghost,
  interactive,
  onPaint,
}: {
  label: string;
  grid: BlockId[][];
  ghost: BlockId[][] | null;
  interactive: boolean;
  onPaint: (row: number, col: number) => void;
}) {
  const cols = grid[0]?.length ?? 1;

  return (
    <div className="rounded-[1.75rem] bg-white p-4 ring-1 ring-zinc-950/10">
      <p className="mb-3 text-[10px] font-extrabold tracking-wide text-zinc-500 uppercase">
        {label}
      </p>
      <div
        className="mx-auto grid w-full max-w-md gap-0.5 rounded-xl bg-sky-100 p-1.5 ring-1 ring-sky-200/80"
        style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
      >
        {grid.map((row, r) =>
          row.map((cell, c) => {
            const ghostCell = ghost?.[r]?.[c] ?? "air";
            const meta = cell === "air" ? null : BLOCKS[cell];
            const ghostMeta =
              interactive && cell === "air" && ghostCell !== "air"
                ? BLOCKS[ghostCell]
                : null;

            const inner = (
              <>
                {meta ? (
                  <span className="text-base sm:text-lg" aria-hidden>
                    {meta.emoji}
                  </span>
                ) : ghostMeta ? (
                  <span
                    className="text-base opacity-35 sm:text-lg"
                    aria-hidden
                  >
                    {ghostMeta.emoji}
                  </span>
                ) : null}
              </>
            );

            if (!interactive) {
              return (
                <div
                  key={`${r}-${c}`}
                  className={cn(
                    "flex aspect-square items-center justify-center rounded-md",
                    meta ? meta.fill : "bg-sky-50/80",
                  )}
                  aria-hidden
                >
                  {inner}
                </div>
              );
            }

            return (
              <button
                key={`${r}-${c}`}
                type="button"
                onClick={() => onPaint(r, c)}
                aria-label={
                  meta
                    ? `${meta.label} entfernen oder ersetzen`
                    : ghostMeta
                      ? `Platz für ${ghostMeta.label}`
                      : "Leerer Block"
                }
                className={cn(
                  "flex aspect-square items-center justify-center rounded-md transition active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-1",
                  meta ? meta.fill : "bg-sky-50/80 hover:bg-sky-200/60",
                )}
              >
                {inner}
              </button>
            );
          }),
        )}
      </div>
    </div>
  );
}
