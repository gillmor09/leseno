/**
 * Gemini explicit context cache (`cachedContents`) for stable book prefixes.
 * In-process map keyed by model + prefix hash; TTL default 1h.
 * Kept separate from `gemini.ts` to avoid circular imports.
 */

import { createHash } from "node:crypto";

const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta";
const DEFAULT_TTL_SEC = 3_600;

function getGeminiApiKey(): string {
  const key = process.env.GEMINI_API_KEY?.trim() ?? "";
  if (!key) {
    throw new Error(
      "GEMINI_API_KEY fehlt. Bitte in .env.local und Coolify setzen.",
    );
  }
  return key;
}

type CacheEntry = {
  name: string;
  expiresAtMs: number;
};

const memory = new Map<string, CacheEntry>();

function cacheKey(modelSlug: string, system: string, prefix: string): string {
  return createHash("sha256")
    .update(`${modelSlug}\n${system}\n${prefix}`)
    .digest("hex");
}

/**
 * Returns a `cachedContents/...` resource name for reuse in generateContent.
 * Fail-soft: returns null if create fails (caller sends full prompt).
 */
export async function resolveGeminiCachedContent(input: {
  modelSlug: string;
  systemInstruction?: string;
  cacheablePrefix: string;
  ttlSeconds?: number;
}): Promise<string | null> {
  const prefix = input.cacheablePrefix.trim();
  if (prefix.length < 200) return null;

  const system = (input.systemInstruction ?? "").trim();
  const key = cacheKey(input.modelSlug, system, prefix);
  const now = Date.now();
  const hit = memory.get(key);
  if (hit && hit.expiresAtMs > now + 60_000) {
    return hit.name;
  }

  const ttl = Math.max(300, Math.min(86_400, input.ttlSeconds ?? DEFAULT_TTL_SEC));
  const apiKey = getGeminiApiKey();
  const modelPath = input.modelSlug.startsWith("models/")
    ? input.modelSlug
    : `models/${input.modelSlug}`;

  const body: Record<string, unknown> = {
    model: modelPath,
    contents: [
      {
        role: "user",
        parts: [{ text: prefix }],
      },
    ],
    ttl: `${ttl}s`,
  };
  if (system) {
    body.systemInstruction = { parts: [{ text: system }] };
  }

  try {
    const response = await fetch(`${GEMINI_API_BASE}/cachedContents`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify(body),
    });
    const payload = (await response.json()) as {
      name?: string;
      error?: { message?: string };
    };
    if (!response.ok || !payload.name) {
      console.warn(
        "[gemini-cache] create failed:",
        payload.error?.message ?? response.status,
      );
      return null;
    }
    memory.set(key, {
      name: payload.name,
      expiresAtMs: now + ttl * 1_000,
    });
    return payload.name;
  } catch (error) {
    console.warn(
      "[gemini-cache] create error:",
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}
