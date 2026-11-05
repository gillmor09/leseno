/**
 * Client helpers: Herstellung via JSON API hops (one chapter per request).
 * Slim API responses must be merged — otherwise each hop wipes prior
 * herstellungText and the batch appears to have only finished the last chapter.
 */

import {
  mergeSachbuchProseFromPrevious,
  sachbuchKapitelHasHerstellung,
} from "@/lib/sachbuch/parse";
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
    m.includes("econnreset") ||
    m.includes("temporar") ||
    m.includes("überlast")
  );
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

type ApiPayload = {
  success?: boolean;
  book?: SachbuchKontext;
  error?: string;
};

async function postJson(
  url: string,
  body: unknown,
  fallback: string,
): Promise<ActionResult<{ book: SachbuchKontext }>> {
  let lastError = fallback;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

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
        (res.ok ? fallback : `Serverfehler (${res.status}).`);

      if (!isTransientFailure(lastError) && res.status < 500) {
        return { success: false, error: lastError };
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : "Netzwerkfehler.";
      if (!isTransientFailure(lastError) && attempt >= 3) {
        return { success: false, error: lastError };
      }
    }

    if (attempt < 3) {
      await sleep(2_500 * attempt);
    }
  }

  return { success: false, error: lastError };
}

/** POST /api/admin/sachbuch/herstellen-kapitel — one chapter. */
export async function requestHerstellenSachbuchKapitel(input: {
  sachbuchId: string;
  kapitelId: string;
  refreshBook?: boolean;
}): Promise<ActionResult<{ book: SachbuchKontext }>> {
  return postJson(
    "/api/admin/sachbuch/herstellen-kapitel",
    {
      sachbuchId: input.sachbuchId,
      kapitelId: input.kapitelId,
      refreshBook: input.refreshBook ?? false,
    },
    "Herstellung fehlgeschlagen.",
  );
}

/** Rebuild book-level Herstellung summary without re-running Haiku. */
async function requestRefreshHerstellungReview(input: {
  sachbuchId: string;
}): Promise<ActionResult<{ book: SachbuchKontext }>> {
  return postJson(
    "/api/admin/sachbuch/herstellen-kapitel",
    {
      sachbuchId: input.sachbuchId,
      reviewOnly: true,
    },
    "Herstellung-Zusammenfassung fehlgeschlagen.",
  );
}

/**
 * All chapters missing Herstellung — hop per chapter.
 * Merges slim hop payloads so prior chapters keep herstellungText in client state.
 * Continues after a failed chapter; refreshes the book review once at the end.
 */
export async function requestHerstellenAllSachbuchKapitel(input: {
  book: SachbuchKontext;
  onBookUpdate?: (book: SachbuchKontext) => void;
  onProgress?: (label: string) => void;
  /** Re-run even if herstellungText already present. */
  force?: boolean;
}): Promise<ActionResult<{ book: SachbuchKontext }>> {
  let book = input.book;
  const targets = book.kapitel.filter(
    (k) => input.force || !sachbuchKapitelHasHerstellung(k),
  );

  if (targets.length === 0) {
    input.onProgress?.("Alle Kapitel bereits hergestellt.");
    return { success: true, data: { book } };
  }

  const failures: string[] = [];
  let doneHops = 0;

  for (let i = 0; i < targets.length; i++) {
    const kap = targets[i]!;
    const idx = book.kapitel.findIndex((k) => k.id === kap.id);
    const label = `Kap. ${idx + 1}/${book.kapitel.length}: ${kap.title || "…"}`;
    input.onProgress?.(`Herstellung ${label}`);

    const result = await requestHerstellenSachbuchKapitel({
      sachbuchId: book.id,
      kapitelId: kap.id,
      refreshBook: false,
    });

    if (!result.success || !result.data) {
      failures.push(
        `Kapitel ${idx + 1}: ${result.error ?? "Herstellung fehlgeschlagen."}`,
      );
      input.onProgress?.(
        `Fehler bei ${label} — fahre mit dem nächsten Kapitel fort…`,
      );
      continue;
    }

    book = mergeSachbuchProseFromPrevious(book, result.data.book);
    doneHops += 1;
    input.onBookUpdate?.(book);
  }

  if (doneHops > 0) {
    input.onProgress?.("Buch-Herstellung wird zusammengefasst…");
    const refreshed = await requestRefreshHerstellungReview({
      sachbuchId: book.id,
    });
    if (refreshed.success && refreshed.data) {
      book = mergeSachbuchProseFromPrevious(book, refreshed.data.book);
      input.onBookUpdate?.(book);
    }
  }

  if (failures.length > 0) {
    return {
      success: false,
      error: `Teilweise fehlgeschlagen (${failures.length}): ${failures.join(" · ")}`,
      data: { book },
    };
  }

  return { success: true, data: { book } };
}
