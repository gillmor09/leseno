/**
 * Kid escape-room stages (8–10): sequential puzzles for Bibliothek-Escape.
 */

export type EscapeStageId = 1 | 2 | 3 | 4;

export const ESCAPE_STAGE_COUNT = 4;

export type CellPos = { row: number; col: number };

export const SUCHSEL_TARGET = "SCHLUESSEL";

/**
 * 9×10 letter grid; target SCHLUESSEL on row index 3.
 */
export const SUCHSEL_LETTERS: string[][] = [
  ["B", "A", "U", "M", "K", "A", "T", "Z", "E", "N"],
  ["I", "G", "E", "L", "M", "O", "N", "D", "E", "R"],
  ["B", "O", "O", "T", "N", "E", "S", "T", "E", "L"],
  ["S", "C", "H", "L", "U", "E", "S", "S", "E", "L"],
  ["O", "H", "A", "S", "E", "S", "E", "E", "R", "A"],
  ["T", "E", "E", "T", "E", "R", "N", "I", "S", "S"],
  ["H", "U", "N", "D", "L", "I", "C", "H", "T", "E"],
  ["E", "U", "L", "E", "B", "U", "C", "H", "T", "E"],
  ["R", "O", "S", "E", "W", "O", "L", "K", "E", "N"],
];

export function suchselTargetCells(): CellPos[] {
  return SUCHSEL_TARGET.split("").map((_, i) => ({ row: 3, col: i }));
}

export const SYMBOL_ORDER = ["🐶", "🐱", "🦊", "🦉"] as const;
export const SYMBOL_CLUE =
  "Zuerst der Hund, dann die Katze, danach der Fuchs, zuletzt die Eule.";

export const CODE_ANSWER = "3142";
export const CODE_CLUES = [
  { emoji: "📕", text: "Rote Bücher: 3" },
  { emoji: "📗", text: "Grüne Bücher: 1" },
  { emoji: "📘", text: "Blaue Bücher: 4" },
  { emoji: "📙", text: "Gelbe Bücher: 2" },
] as const;

export const FINAL_SCRAMBLE = ["N", "E", "S", "O", "L", "E"];
export const FINAL_ANSWER = "LESENO";

export function normalizeAnswer(raw: string): string {
  return raw
    .trim()
    .toUpperCase()
    .replace(/Ä/g, "AE")
    .replace(/Ö/g, "OE")
    .replace(/Ü/g, "UE")
    .replace(/ß/g, "SS")
    .replace(/[^A-Z0-9]/g, "");
}

export function cellsMatchTarget(
  selected: CellPos[],
  target: CellPos[],
): boolean {
  if (selected.length !== target.length) return false;
  return selected.every(
    (c, i) => c.row === target[i]!.row && c.col === target[i]!.col,
  );
}

export function cellsMatchTargetEitherWay(
  selected: CellPos[],
  target: CellPos[],
): boolean {
  if (cellsMatchTarget(selected, target)) return true;
  return cellsMatchTarget(selected, [...target].reverse());
}

export const STAGE_TITLES: Record<EscapeStageId, string> = {
  1: "Raum 1 · Suchsel",
  2: "Raum 2 · Reihenfolge",
  3: "Raum 3 · Zahlencode",
  4: "Raum 4 · Geheimwort",
};
