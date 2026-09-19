/**
 * Persist/parse helpers for Buch Ideen-Chat (`leseno.roman_kontext.ideen_chat`).
 * Live Q&A uses `idea-qa.ts`; this file only maps JSON ↔ messages.
 */

import type { RomanIdeaChatMessage } from "@/lib/roman/types";

export type { RomanIdeaChatMessage };

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

const MAX_STORED_MESSAGES = 60;

/** Parse persisted Ideen-Chat JSON from Postgres. */
export function parseIdeenChatJson(value: unknown): RomanIdeaChatMessage[] {
  if (!Array.isArray(value)) return [];
  const out: RomanIdeaChatMessage[] = [];
  for (const row of value) {
    const r = asRecord(row);
    const role = r.role === "assistant" || r.role === "user" ? r.role : null;
    const content = String(r.content ?? "").trim();
    if (!role || !content) continue;
    out.push({ role, content: content.slice(0, 20_000) });
    if (out.length >= MAX_STORED_MESSAGES) break;
  }
  return out;
}
