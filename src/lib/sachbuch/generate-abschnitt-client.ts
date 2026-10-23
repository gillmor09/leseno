/**
 * Client helper: generate one Abschnitt via JSON API (retries on network blips).
 */

import type { SachbuchKontext } from "@/lib/sachbuch/types";
import type { ActionResult } from "@/lib/types/actions";

function isTransientFailure(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("network") ||
    m.includes("fetch") ||
    m.includes("failed to fetch") ||
    m.includes("stream closed") ||
    m.includes("destination stream") ||
    m.includes("aborted") ||
    m.includes("timeout") ||
    m.includes("econnreset")
  );
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * POST /api/admin/sachbuch/generate-abschnitt with up to 3 attempts on
 * transient network / stream errors.
 */
export async function requestGenerateNextAbschnitt(input: {
  sachbuchId: string;
  kapitelId: string;
}): Promise<ActionResult<{ book: SachbuchKontext }>> {
  let lastError = "Abschnitt erzeugen fehlgeschlagen.";

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const res = await fetch("/api/admin/sachbuch/generate-abschnitt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });

      type ApiPayload = {
        success?: boolean;
        book?: SachbuchKontext;
        error?: string;
      };
      let json: ApiPayload | null = null;
      try {
        json = (await res.json()) as ApiPayload;
      } catch {
        json = null;
      }

      if (res.ok && json && json.success && json.book) {
        return { success: true, data: { book: json.book } };
      }

      lastError =
        (json && json.error?.trim()) ||
        (res.ok
          ? "Abschnitt erzeugen fehlgeschlagen."
          : `Serverfehler (${res.status}).`);

      if (!isTransientFailure(lastError) && res.status < 500) {
        return { success: false, error: lastError };
      }
    } catch (error) {
      lastError =
        error instanceof Error ? error.message : "Netzwerkfehler.";
      if (!isTransientFailure(lastError) && attempt >= 3) {
        return { success: false, error: lastError };
      }
    }

    if (attempt < 3) {
      await sleep(1_500 * attempt);
    }
  }

  return { success: false, error: lastError };
}
