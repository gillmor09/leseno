/**
 * Client hops for a teaser edition: one marketing section per request.
 */

import type { SachbuchKontext } from "@/lib/sachbuch/types";
import type { ActionResult } from "@/lib/types/actions";
import { mergeSachbuchChapterProse } from "@/lib/sachbuch/compact-client";

const runningTeaser = new Set<string>();

export function claimSachbuchTeaserRun(bookId: string): boolean {
  if (runningTeaser.has(bookId)) return false;
  runningTeaser.add(bookId);
  return true;
}

export function releaseSachbuchTeaserRun(bookId: string): void {
  runningTeaser.delete(bookId);
}

function isTransientFailure(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("network") ||
    m.includes("fetch") ||
    m.includes("failed to fetch") ||
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

export async function requestCondenseSachbuchTeaserKapitel(input: {
  sachbuchId: string;
  kapitelId: string;
}): Promise<ActionResult<{ book: SachbuchKontext }>> {
  let lastError = "Teaser-Abschnitt verdichten fehlgeschlagen.";
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const res = await fetch("/api/admin/sachbuch/teaser-kapitel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      let json: ApiPayload | null = null;
      try {
        json = (await res.json()) as ApiPayload;
      } catch {
        json = null;
      }
      if (res.ok && json?.success && json.book) {
        return { success: true, data: { book: json.book } };
      }
      lastError =
        json?.error?.trim() ||
        (res.ok ? lastError : `Serverfehler (${res.status}).`);
      if (!isTransientFailure(lastError)) {
        return { success: false, error: lastError };
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : "Netzwerkfehler.";
    }
    if (attempt < 3 && isTransientFailure(lastError)) {
      await sleep(2_500 * attempt);
      continue;
    }
    if (!isTransientFailure(lastError)) {
      return { success: false, error: lastError };
    }
    if (attempt < 3) await sleep(2_500 * attempt);
  }
  return { success: false, error: lastError };
}

export async function requestCondenseSachbuchTeaserBook(input: {
  book: SachbuchKontext;
  onBookUpdate: (book: SachbuchKontext) => void;
  onProgress?: (label: string) => void;
}): Promise<ActionResult<{ book: SachbuchKontext; condensedCount: number }>> {
  let book = input.book;
  let condensedCount = 0;
  const failures: string[] = [];
  const total = book.kapitel.length;

  for (let i = 0; i < total; i += 1) {
    const k = book.kapitel[i]!;
    const label = `Abschnitt ${i + 1}/${total}`;
    if (k.status === "ready") {
      input.onProgress?.(`${label} übersprungen`);
      continue;
    }
    input.onProgress?.(`${label}: ${k.title.slice(0, 42)}`);
    const result = await requestCondenseSachbuchTeaserKapitel({
      sachbuchId: book.id,
      kapitelId: k.id,
    });
    if (!result.success || !result.data) {
      failures.push(
        `${label}: ${result.error ?? "Verdichtung fehlgeschlagen."}`,
      );
      continue;
    }
    book = mergeSachbuchChapterProse(book, result.data.book);
    condensedCount += 1;
    input.onBookUpdate(book);
  }

  if (failures.length > 0) {
    return {
      success: false,
      error: `Teilweise fehlgeschlagen (${failures.length}): ${failures.join(" · ")}`,
      data: { book, condensedCount },
    };
  }
  return { success: true, data: { book, condensedCount } };
}
