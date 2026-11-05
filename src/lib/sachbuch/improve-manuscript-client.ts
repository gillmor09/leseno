/**
 * Client helpers: manuscript improve / book-score via JSON API hops.
 * One chapter per request — same pattern as generate-abschnitt (avoids
 * Server-Action timeouts on multi-chapter Argon runs).
 */

import { sachbuchKapitelNeedsManuscriptImprove } from "@/lib/sachbuch/parse";
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

/** POST /api/admin/sachbuch/improve-kapitel — one chapter. */
export async function requestImproveSachbuchKapitel(input: {
  sachbuchId: string;
  kapitelId: string;
}): Promise<ActionResult<{ book: SachbuchKontext }>> {
  return postJson(
    "/api/admin/sachbuch/improve-kapitel",
    input,
    "Kapitel-Verbesserung fehlgeschlagen.",
  );
}

/** POST /api/admin/sachbuch/score-book — holistic book score. */
export async function requestScoreSachbuchBook(input: {
  sachbuchId: string;
}): Promise<ActionResult<{ book: SachbuchKontext }>> {
  return postJson(
    "/api/admin/sachbuch/score-book",
    input,
    "Buch-Score fehlgeschlagen.",
  );
}

/**
 * Sequential improve hops for chapters that still need work, then book score.
 * Updates `onBookUpdate` after each successful hop.
 */
export async function requestImproveAllSachbuchManuscript(input: {
  book: SachbuchKontext;
  onBookUpdate: (book: SachbuchKontext) => void;
  onProgress?: (label: string) => void;
}): Promise<ActionResult<{ book: SachbuchKontext; improvedCount: number }>> {
  let book = input.book;
  let improvedCount = 0;
  const failures: string[] = [];

  for (let i = 0; i < book.kapitel.length; i += 1) {
    const k = book.kapitel[i]!;
    if (!sachbuchKapitelNeedsManuscriptImprove(book, k.id)) {
      input.onProgress?.(
        `Kapitel ${i + 1}/${book.kapitel.length} übersprungen (aktuell)`,
      );
      continue;
    }

    input.onProgress?.(
      `Kapitel ${i + 1}/${book.kapitel.length}: ${k.title.slice(0, 36)}… (Argon, oft 10–20 Min)`,
    );
    const result = await requestImproveSachbuchKapitel({
      sachbuchId: book.id,
      kapitelId: k.id,
    });
    if (!result.success || !result.data) {
      failures.push(
        `Kapitel ${i + 1}: ${result.error ?? "Verbesserung fehlgeschlagen."}`,
      );
      continue;
    }
    book = result.data.book;
    improvedCount += 1;
    input.onBookUpdate(book);
  }

  input.onProgress?.("Buch-Verkaufsreife wird bewertet…");
  const scored = await requestScoreSachbuchBook({ sachbuchId: book.id });
  if (scored.success && scored.data) {
    book = scored.data.book;
    input.onBookUpdate(book);
  } else if (improvedCount === 0 && failures.length === 0) {
    return {
      success: false,
      error: scored.error ?? "Buch-Score fehlgeschlagen.",
    };
  }

  if (failures.length > 0) {
    return {
      success: false,
      error: `Teilweise fehlgeschlagen (${failures.length}): ${failures.join(" · ")}`,
      data: { book, improvedCount },
    };
  }

  return { success: true, data: { book, improvedCount } };
}
