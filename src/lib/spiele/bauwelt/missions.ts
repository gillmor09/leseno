/**
 * Bauwelt missions: Minecraft-style 2D block builds for ages ~8–10.
 * Patterns are original Leseno scenes — no Mojang assets or names.
 */

export type BlockId =
  | "air"
  | "grass"
  | "dirt"
  | "stone"
  | "wood"
  | "leaf"
  | "water"
  | "brick"
  | "gold"
  | "book";

export type BlockMeta = {
  id: BlockId;
  label: string;
  emoji: string;
  /** Tailwind bg class for filled cells */
  fill: string;
};

export const BLOCKS: Record<Exclude<BlockId, "air">, BlockMeta> = {
  grass: {
    id: "grass",
    label: "Gras",
    emoji: "🌿",
    fill: "bg-lime-500",
  },
  dirt: {
    id: "dirt",
    label: "Erde",
    emoji: "🟫",
    fill: "bg-amber-800",
  },
  stone: {
    id: "stone",
    label: "Stein",
    emoji: "⬜",
    fill: "bg-zinc-400",
  },
  wood: {
    id: "wood",
    label: "Holz",
    emoji: "🪵",
    fill: "bg-amber-700",
  },
  leaf: {
    id: "leaf",
    label: "Laub",
    emoji: "🍃",
    fill: "bg-emerald-500",
  },
  water: {
    id: "water",
    label: "Wasser",
    emoji: "💧",
    fill: "bg-sky-400",
  },
  brick: {
    id: "brick",
    label: "Ziegel",
    emoji: "🧱",
    fill: "bg-rose-600",
  },
  gold: {
    id: "gold",
    label: "Gold",
    emoji: "✨",
    fill: "bg-amber-300",
  },
  book: {
    id: "book",
    label: "Buch",
    emoji: "📕",
    fill: "bg-red-600",
  },
};

export type MissionId = "turm" | "baum" | "haus" | "bibliothek" | "burg";

export type Mission = {
  id: MissionId;
  title: string;
  blurb: string;
  cols: number;
  rows: number;
  /** Row-major target grid; `air` = empty */
  target: BlockId[][];
  palette: Exclude<BlockId, "air">[];
};

function row(cells: BlockId[]): BlockId[] {
  return cells;
}

export const MISSIONS: Mission[] = [
  {
    id: "turm",
    title: "Kleiner Turm",
    blurb: "Baue einen Turm aus Ziegeln — drei hoch, auf einem Stein-Fundament.",
    cols: 5,
    rows: 5,
    palette: ["stone", "brick"],
    target: [
      row(["air", "air", "brick", "air", "air"]),
      row(["air", "air", "brick", "air", "air"]),
      row(["air", "air", "brick", "air", "air"]),
      row(["air", "stone", "stone", "stone", "air"]),
      row(["air", "air", "air", "air", "air"]),
    ],
  },
  {
    id: "baum",
    title: "Waldbaum",
    blurb: "Stamm aus Holz, Krone aus Laub — ein klassischer Waldbaum.",
    cols: 5,
    rows: 6,
    palette: ["wood", "leaf", "grass"],
    target: [
      row(["air", "leaf", "leaf", "leaf", "air"]),
      row(["leaf", "leaf", "leaf", "leaf", "leaf"]),
      row(["air", "leaf", "wood", "leaf", "air"]),
      row(["air", "air", "wood", "air", "air"]),
      row(["air", "air", "wood", "air", "air"]),
      row(["grass", "grass", "grass", "grass", "grass"]),
    ],
  },
  {
    id: "haus",
    title: "Häuschen",
    blurb: "Ziegelwände, Holz-Dach und eine Tür-Lücke in der Mitte.",
    cols: 7,
    rows: 6,
    palette: ["brick", "wood", "grass"],
    target: [
      row(["air", "air", "air", "wood", "air", "air", "air"]),
      row(["air", "air", "wood", "wood", "wood", "air", "air"]),
      row(["air", "wood", "wood", "wood", "wood", "wood", "air"]),
      row(["air", "brick", "brick", "brick", "brick", "brick", "air"]),
      row(["air", "brick", "air", "air", "air", "brick", "air"]),
      row(["grass", "grass", "grass", "grass", "grass", "grass", "grass"]),
    ],
  },
  {
    id: "bibliothek",
    title: "Mini-Bibliothek",
    blurb: "Steinregal mit Büchern und einem Gold-Highlight — Leseno-Style.",
    cols: 7,
    rows: 5,
    palette: ["stone", "book", "gold", "wood"],
    target: [
      row(["stone", "stone", "stone", "stone", "stone", "stone", "stone"]),
      row(["stone", "book", "book", "gold", "book", "book", "stone"]),
      row(["stone", "book", "book", "book", "book", "book", "stone"]),
      row(["wood", "wood", "wood", "wood", "wood", "wood", "wood"]),
      row(["air", "air", "air", "air", "air", "air", "air"]),
    ],
  },
  {
    id: "burg",
    title: "Burgtor",
    blurb: "Zwei Türme, Zinnen und ein Tor — die schwerste Bau-Mission.",
    cols: 9,
    rows: 7,
    palette: ["stone", "brick", "gold", "grass"],
    target: [
      row(["brick", "air", "brick", "air", "air", "air", "brick", "air", "brick"]),
      row(["brick", "brick", "brick", "air", "air", "air", "brick", "brick", "brick"]),
      row(["brick", "gold", "brick", "brick", "brick", "brick", "brick", "gold", "brick"]),
      row(["brick", "brick", "brick", "brick", "air", "brick", "brick", "brick", "brick"]),
      row(["brick", "brick", "brick", "brick", "air", "brick", "brick", "brick", "brick"]),
      row(["stone", "stone", "stone", "stone", "stone", "stone", "stone", "stone", "stone"]),
      row(["grass", "grass", "grass", "grass", "grass", "grass", "grass", "grass", "grass"]),
    ],
  },
];

export function emptyGrid(cols: number, rows: number): BlockId[][] {
  return Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => "air" as BlockId),
  );
}

export function cloneGrid(grid: BlockId[][]): BlockId[][] {
  return grid.map((r) => [...r]);
}

/** Exact cell match against the mission target. */
export function gridsMatch(a: BlockId[][], b: BlockId[][]): boolean {
  if (a.length !== b.length) return false;
  for (let r = 0; r < a.length; r++) {
    const rowA = a[r]!;
    const rowB = b[r]!;
    if (rowA.length !== rowB.length) return false;
    for (let c = 0; c < rowA.length; c++) {
      if (rowA[c] !== rowB[c]) return false;
    }
  }
  return true;
}

export function matchProgress(player: BlockId[][], target: BlockId[][]): {
  correct: number;
  total: number;
} {
  /** Only score cells the player must place (ignore empty air in the target). */
  let correct = 0;
  let total = 0;
  for (let r = 0; r < target.length; r++) {
    const tRow = target[r]!;
    const pRow = player[r] ?? [];
    for (let c = 0; c < tRow.length; c++) {
      const want = tRow[c]!;
      if (want === "air") continue;
      total += 1;
      if (pRow[c] === want) correct += 1;
    }
  }
  return { correct, total };
}
