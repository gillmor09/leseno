/**
 * Memory card themes for the kids Memo game.
 */

import { shuffleInPlace } from "@/lib/spiele/shuffle";

export type MemoryCardFace = {
  id: string;
  emoji: string;
  label: string;
};

/** Animal pairs — familiar and kid-friendly. */
export const MEMORY_FACES: MemoryCardFace[] = [
  { id: "hund", emoji: "🐶", label: "Hund" },
  { id: "katze", emoji: "🐱", label: "Katze" },
  { id: "fuchs", emoji: "🦊", label: "Fuchs" },
  { id: "baer", emoji: "🐻", label: "Bär" },
  { id: "loewe", emoji: "🦁", label: "Löwe" },
  { id: "panda", emoji: "🐼", label: "Panda" },
  { id: "frosch", emoji: "🐸", label: "Frosch" },
  { id: "eule", emoji: "🦉", label: "Eule" },
  { id: "fisch", emoji: "🐠", label: "Fisch" },
  { id: "schmetterling", emoji: "🦋", label: "Schmetterling" },
  { id: "einhorn", emoji: "🦄", label: "Einhorn" },
  { id: "drache", emoji: "🐲", label: "Drache" },
];

export type MemoryDifficulty = "leicht" | "mittel" | "schwer";

export const MEMORY_PAIR_COUNTS: Record<MemoryDifficulty, number> = {
  leicht: 6,
  mittel: 8,
  schwer: 12,
};

export type MemoryCard = {
  key: string;
  faceId: string;
  emoji: string;
  label: string;
};

export function shuffle<T>(items: T[]): T[] {
  return shuffleInPlace(items);
}

/** Build a shuffled deck with `pairCount` unique pairs. */
export function createMemoryDeck(pairCount: number): MemoryCard[] {
  const faces = shuffle(MEMORY_FACES).slice(0, pairCount);
  const cards: MemoryCard[] = [];
  for (const face of faces) {
    cards.push(
      {
        key: `${face.id}-a-${Math.random().toString(36).slice(2, 7)}`,
        faceId: face.id,
        emoji: face.emoji,
        label: face.label,
      },
      {
        key: `${face.id}-b-${Math.random().toString(36).slice(2, 7)}`,
        faceId: face.id,
        emoji: face.emoji,
        label: face.label,
      },
    );
  }
  return shuffle(cards);
}

export function gridColsForPairs(pairCount: number): number {
  if (pairCount <= 6) return 4;
  if (pairCount <= 8) return 4;
  return 6;
}
