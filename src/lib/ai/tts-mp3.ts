/**
 * MP3 helpers for story TTS: concatenate same-format frames for one seekable file.
 * Same bitrate/sample-rate chunks (our providers) concatenate reliably for browsers.
 */

/** Concatenate MP3 chunk buffers into one playable MPEG stream. */
export function mergeMp3Buffers(chunks: Buffer[]): Buffer {
  const parts = chunks.filter((part) => part.byteLength > 0);
  if (parts.length === 0) {
    throw new Error("Kein Audio zum Zusammenfügen.");
  }
  if (parts.length === 1) return parts[0]!;
  return Buffer.concat(parts);
}

/**
 * Rough duration from CBR MP3 size (bytes, bitrate kbps).
 * Used only as fallback when Whisper timings are missing.
 */
export function estimateMp3DurationSec(
  byteLength: number,
  bitrateKbps: number,
): number {
  if (byteLength <= 0 || bitrateKbps <= 0) return 0;
  return (byteLength * 8) / (bitrateKbps * 1000);
}

/** Run async work over items with a fixed concurrency pool. */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return [];
  const limit = Math.max(1, Math.min(concurrency, items.length));
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function runWorker(): Promise<void> {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) return;
      results[index] = await worker(items[index]!, index);
    }
  }

  await Promise.all(Array.from({ length: limit }, () => runWorker()));
  return results;
}
