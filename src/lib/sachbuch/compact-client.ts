/**
 * Client hops for a compact edition: one chapter per request.
 * Same timeout pattern as `improve-manuscript-client`.
 */

import type { SachbuchKontext } from "@/lib/sachbuch/types";
import type { ActionResult } from "@/lib/types/actions";

function keepProse(fresh: string, prior: string): string {
  return fresh.trim().length > 0 ? fresh : prior;
}

/**
 * API hops return a slim book (only the latest chapter keeps prose).
 * Keep any chapter text already in memory so a later Speichern does not
 * write empty drafts over finished compact chapters.
 */
export function mergeSachbuchChapterProse(
  prev: SachbuchKontext,
  next: SachbuchKontext,
): SachbuchKontext {
  return {
    ...next,
    kapitel: next.kapitel.map((k) => {
      const old = prev.kapitel.find((p) => p.id === k.id);
      if (!old) return k;
      return {
        ...k,
        finalText: keepProse(k.finalText, old.finalText),
        draftPass1: keepProse(k.draftPass1, old.draftPass1),
        manuscript: {
          ...k.manuscript,
          draftText: keepProse(
            k.manuscript.draftText,
            old.manuscript.draftText,
          ),
          improvedText: keepProse(
            k.manuscript.improvedText,
            old.manuscript.improvedText,
          ),
          herstellungText: keepProse(
            k.manuscript.herstellungText,
            old.manuscript.herstellungText,
          ),
        },
        abschnitte: k.abschnitte.map((a) => {
          const prior = old.abschnitte.find((p) => p.id === a.id);
          if (!prior) return a;
          return { ...a, draftText: keepProse(a.draftText, prior.draftText) };
        }),
      };
    }),
  };
}

const runningCompact = new Set<string>();

/** True the first time a condensation run starts for this book. */
export function claimSachbuchCompactRun(bookId: string): boolean {
  if (runningCompact.has(bookId)) return false;
  runningCompact.add(bookId);
  return true;
}

export function releaseSachbuchCompactRun(bookId: string): void {
  runningCompact.delete(bookId);
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

/** POST /api/admin/sachbuch/compact-kapitel — one chapter. */
export async function requestCondenseSachbuchCompactKapitel(input: {
  sachbuchId: string;
  kapitelId: string;
}): Promise<ActionResult<{ book: SachbuchKontext }>> {
  let lastError = "Kapitel kürzen fehlgeschlagen.";
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const res = await fetch("/api/admin/sachbuch/compact-kapitel", {
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

/**
 * Sequential condensation for chapters that are not `ready` yet.
 * Calls `onBookUpdate` after each saved chapter.
 */
export async function requestCondenseSachbuchCompactBook(input: {
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
    const label = `Kapitel ${i + 1}/${total}`;
    if (k.status === "ready") {
      input.onProgress?.(`${label} übersprungen`);
      continue;
    }
    input.onProgress?.(`${label}: ${k.title.slice(0, 42)}`);
    const result = await requestCondenseSachbuchCompactKapitel({
      sachbuchId: book.id,
      kapitelId: k.id,
    });
    if (!result.success || !result.data) {
      failures.push(
        `${label}: ${result.error ?? "Kürzung fehlgeschlagen."}`,
      );
      continue;
    }
    book = result.data.book;
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
