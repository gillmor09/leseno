/**
 * Client-side batch runner: one scene = several short step actions
 * (draft → review → revise) so browser fetch does not die mid-flight.
 */

import type { ActionResult } from "@/lib/types/actions";
import type { RomanSzeneProgress } from "@/lib/roman/process-scene";

export type RomanSceneProcessResult = {
  done: boolean;
  szene: RomanSzeneProgress | null;
  message: string;
};

export type RomanSzeneStepPayload = {
  done: boolean;
  sceneDone: boolean;
  phase: string;
  szene: RomanSzeneProgress | null;
  message: string;
};

export type RomanBatchProgress = {
  /** 1-based index of the scene currently running (or just finished). */
  current: number;
  /** How many READY scenes at batch start. */
  totalAtStart: number;
  /** Last completed scene, if any. */
  lastSzene: RomanSzeneProgress | null;
  /** Human-readable status line. */
  label: string;
};

function isFetchFailure(error: unknown): boolean {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "";
  return /failed to fetch|networkerror|load failed|fetch failed/i.test(
    message,
  );
}

/**
 * Wraps a server-action call so connection drops become ActionResult errors.
 */
export async function callRomanActionSafe<T>(
  run: () => Promise<ActionResult<T>>,
): Promise<ActionResult<T>> {
  try {
    return await run();
  } catch (error) {
    if (isFetchFailure(error)) {
      return {
        success: false,
        error:
          "Verbindung abgebrochen (Anfrage zu lang oder Netz weg). Fortschritt bleibt erhalten — Batch erneut starten.",
      };
    }
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Unbekannter Client-Fehler bei der Szenen-Action.",
    };
  }
}

/**
 * Completes one scene by chaining step actions until sceneDone or idle.
 * Retries once when Claude/network drops mid-step (progress usually kept).
 */
export async function processOneRomanSzeneViaSteps(input: {
  romanId: string;
  advanceStep: (
    romanId: string,
  ) => Promise<ActionResult<RomanSzeneStepPayload>>;
  onStep?: (message: string) => void;
}): Promise<ActionResult<RomanSceneProcessResult>> {
  for (let guard = 0; guard < 12; guard += 1) {
    let step = await callRomanActionSafe(() =>
      input.advanceStep(input.romanId),
    );

    if (
      !step.success &&
      step.error &&
      /abgebrochen|econnreset|fetch failed|netz\/timeout|verbindung zu claude/i.test(
        step.error,
      )
    ) {
      input.onStep?.(
        "Netzabriss — warte kurz und versuche denselben Schritt erneut …",
      );
      await new Promise((resolve) => setTimeout(resolve, 3_000));
      step = await callRomanActionSafe(() => input.advanceStep(input.romanId));
    }

    if (!step.success || !step.data) {
      return {
        success: false,
        error: step.error ?? "Szenen-Schritt fehlgeschlagen.",
      };
    }

    input.onStep?.(step.data.message);

    if (step.data.done) {
      return {
        success: true,
        data: {
          done: true,
          szene: null,
          message: step.data.message,
        },
      };
    }

    if (step.data.sceneDone && step.data.szene) {
      return {
        success: true,
        data: {
          done: false,
          szene: step.data.szene,
          message: step.data.message,
        },
      };
    }
  }

  return {
    success: false,
    error: "Szenen-Pipeline: zu viele Schritte ohne Abschluss.",
  };
}

/**
 * Calls `processOne` until no READY/in-progress scene remains, an error occurs,
 * or `shouldStop` is true (checked between scenes).
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
  lastSzene: RomanSzeneProgress | null;
}> {
  let processed = 0;
  let lastSzene: RomanSzeneProgress | null = null;
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
