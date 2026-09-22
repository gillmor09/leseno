/**
 * Short-lived server stash for generated roman covers.
 * Avoids re-posting multi-MB data URLs through Server Actions (IDE / OOM crashes).
 */

type PendingCover = {
  dataUrl: string;
  prompt: string;
  at: number;
};

const TTL_MS = 2 * 60 * 60 * 1000;

const globalStore = globalThis as unknown as {
  __lesenoRomanCoverPending?: Map<string, PendingCover>;
};

function pendingMap(): Map<string, PendingCover> {
  if (!globalStore.__lesenoRomanCoverPending) {
    globalStore.__lesenoRomanCoverPending = new Map();
  }
  return globalStore.__lesenoRomanCoverPending;
}

function purgeExpired(map: Map<string, PendingCover>) {
  const now = Date.now();
  for (const [id, row] of map) {
    if (now - row.at > TTL_MS) map.delete(id);
  }
}

/** Store the just-generated cover until the admin confirms „Übernehmen“. */
export function stashPendingRomanCover(input: {
  romanId: string;
  dataUrl: string;
  prompt: string;
}): void {
  const map = pendingMap();
  purgeExpired(map);
  map.set(input.romanId, {
    dataUrl: input.dataUrl,
    prompt: input.prompt,
    at: Date.now(),
  });
}

/** Take (and clear) a pending cover for persist. */
export function takePendingRomanCover(
  romanId: string,
): { dataUrl: string; prompt: string } | null {
  const map = pendingMap();
  purgeExpired(map);
  const row = map.get(romanId);
  if (!row) return null;
  map.delete(romanId);
  return { dataUrl: row.dataUrl, prompt: row.prompt };
}

/** Drop pending cover (e.g. after clear). */
export function clearPendingRomanCover(romanId: string): void {
  pendingMap().delete(romanId);
}
