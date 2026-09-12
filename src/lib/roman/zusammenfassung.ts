/**
 * Running manuscript summary helpers (`roman_kontext.aktuelle_zusammenfassung`).
 * Paragraphs are appended as `Kap. X / Szene Y: …` (see process-scene).
 */

const SCENE_SUMMARY_PREFIX =
  /^Kap\.\s*(\d+)\s*\/\s*Szene\s*(\d+)\s*:/i;

/**
 * Keeps summary paragraphs that still belong to completed scenes.
 * Drops `Kap. X / Szene Y:` blocks for scenes that were cleared or are not completed.
 */
export function rebuildZusammenfassungForCompletedScenes(
  current: string,
  completed: { kapitelNr: number; szenenNr: number }[],
): string {
  const keep = new Set(
    completed.map((s) => `${s.kapitelNr}/${s.szenenNr}`),
  );
  const parts = current
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter(Boolean);

  return parts
    .filter((paragraph) => {
      const match = SCENE_SUMMARY_PREFIX.exec(paragraph);
      if (!match) return true;
      return keep.has(`${Number(match[1])}/${Number(match[2])}`);
    })
    .join("\n\n");
}
