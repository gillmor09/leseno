/**
 * Client helpers: Herstellung via JSON API hops (one chapter per request).
 */

import { sachbuchKapitelHasHerstellung } from "@/lib/sachbuch/parse";
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

/** All chapters missing Herstellung — hop per chapter, refresh book on last. */
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

  for (let i = 0; i < targets.length; i++) {
    const kap = targets[i]!;
    const idx = book.kapitel.findIndex((k) => k.id === kap.id);
    input.onProgress?.(
      `Herstellung Kap. ${idx + 1}/${book.kapitel.length}: ${kap.title || "…"}`,
    );
    const result = await requestHerstellenSachbuchKapitel({
      sachbuchId: book.id,
      kapitelId: kap.id,
      refreshBook: i === targets.length - 1,
    });
    if (!result.success || !result.data) {
      return {
        success: false,
        error:
          result.error ??
          `Herstellung abgebrochen bei Kapitel ${idx + 1}.`,
        data: { book },
      };
    }
    book = result.data.book;
    input.onBookUpdate?.(book);
  }

  return { success: true, data: { book } };
}
