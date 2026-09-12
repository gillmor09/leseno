/**
 * Client-side batch runner: process READY scenes one-by-one via the existing
 * server action (avoids a single request exceeding `maxDuration`).
 */

import type { ActionResult } from "@/lib/types/actions";
import type { Szene } from "@/lib/roman/types";

export type RomanSceneProcessResult = {
  done: boolean;
  szene: Szene | null;
  message: string;
};

export type RomanBatchProgress = {
  /** 1-based index of the scene currently running (or just finished). */
  current: number;
  /** How many READY scenes at batch start. */
  totalAtStart: number;
  /** Last completed scene, if any. */
  lastSzene: Szene | null;
  /** Human-readable status line. */
  label: string;
};

/**
 * Calls `processOne` until no READY scene remains, an error occurs, or `shouldStop` is true
 * (checked between scenes — the in-flight scene always finishes).
 */
export async function runAllReadyRomanSzenen(input: {
  romanId: string;
  totalAtStart: number;
  processOne: (
    romanId: string,
  ) => Promise<ActionResult<RomanSceneProcessResult>>;
  shouldStop: () => boolean;
  onProgress?: (progress: RomanBatchProgress) => void;
}): Promise<{
  processed: number;
  stopped: boolean;
  exhausted: boolean;
  error?: string;
  lastSzene: Szene | null;
}> {
  let processed = 0;
  let lastSzene: Szene | null = null;
  const total = Math.max(0, input.totalAtStart);

  while (true) {
    if (input.shouldStop()) {
      return {
        processed,
        stopped: true,
        exhausted: false,
        lastSzene,
      };
    }

    const nextIndex = processed + 1;
    input.onProgress?.({
      current: nextIndex,
      totalAtStart: total,
      lastSzene,
      label:
        total > 0
          ? `Szene ${nextIndex} von ${total} wird geschrieben …`
          : `Nächste Szene (${nextIndex}) wird geschrieben …`,
    });

    const result = await input.processOne(input.romanId);
    if (!result.success) {
      return {
        processed,
        stopped: false,
        exhausted: false,
        error: result.error ?? "Szenen-Pipeline fehlgeschlagen.",
        lastSzene,
      };
    }

    if (result.data!.done || !result.data!.szene) {
      return {
        processed,
        stopped: false,
        exhausted: true,
        lastSzene,
      };
    }

    lastSzene = result.data!.szene;
    processed += 1;

    input.onProgress?.({
      current: processed,
      totalAtStart: total,
      lastSzene,
      label: `Fertig: Kap. ${lastSzene.kapitelNr}.${lastSzene.szenenNr} (${processed}/${total || processed})`,
    });
  }
}
