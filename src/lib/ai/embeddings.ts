/**
 * OpenAI text embeddings for Roman scene RAG (pgvector).
 * Model: text-embedding-3-small → 1536 dims (see scene_embeddings migration).
 */

import {
  getOpenAiApiKey,
  getOpenAiBaseUrl,
} from "@/lib/ai/openai";
import { UserFacingError } from "@/lib/errors/user-facing";

export const NOVEL_EMBEDDING_MODEL = "text-embedding-3-small" as const;
export const NOVEL_EMBEDDING_DIMS = 1536 as const;

/**
 * Embed one or more strings; returns vectors aligned with input order.
 */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  const cleaned = texts.map((t) => t.trim()).filter(Boolean);
  if (cleaned.length === 0) {
    throw new UserFacingError("Embedding: leerer Text.");
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45_000);
  let res: Response;
  try {
    res = await fetch(`${getOpenAiBaseUrl()}/embeddings`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${getOpenAiApiKey()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: NOVEL_EMBEDDING_MODEL,
        input: cleaned,
      }),
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new UserFacingError("Embedding-Timeout (45s).");
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new UserFacingError(
      `Embedding fehlgeschlagen (${res.status}).${body ? ` ${body.slice(0, 200)}` : ""}`,
    );
  }
  const json = (await res.json()) as {
    data?: Array<{ embedding?: number[]; index?: number }>;
  };
  const rows = Array.isArray(json.data) ? json.data : [];
  const byIndex = new Map<number, number[]>();
  for (const row of rows) {
    if (Array.isArray(row.embedding) && typeof row.index === "number") {
      byIndex.set(row.index, row.embedding);
    }
  }
  const out: number[][] = [];
  for (let i = 0; i < cleaned.length; i++) {
    const vec = byIndex.get(i) ?? rows[i]?.embedding;
    if (!Array.isArray(vec) || vec.length !== NOVEL_EMBEDDING_DIMS) {
      throw new UserFacingError(
        `Embedding: unerwartete Dimension (${vec?.length ?? 0}, erwartet ${NOVEL_EMBEDDING_DIMS}).`,
      );
    }
    out.push(vec);
  }
  return out;
}

/** Single-string helper. */
export async function embedText(text: string): Promise<number[]> {
  const [vec] = await embedTexts([text]);
  return vec;
}
