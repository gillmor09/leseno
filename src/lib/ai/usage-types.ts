/**
 * Client-safe AI token usage types and formatters (no Node APIs).
 */

export type AiTokenUsage = {
  inputTokens: number;
  outputTokens: number;
  /** Hidden reasoning / thinking tokens (OpenAI, Gemini thoughts). */
  reasoningTokens?: number;
  /** Prompt tokens served from cache (OpenAI / Anthropic). */
  cacheReadTokens?: number;
  /** Tokens written into the cache (Anthropic). */
  cacheWriteTokens?: number;
};

/** Sum multiple usage snapshots into one. */
export function sumAiUsages(usages: AiTokenUsage[]): AiTokenUsage | undefined {
  if (usages.length === 0) return undefined;
  const out: AiTokenUsage = {
    inputTokens: 0,
    outputTokens: 0,
  };
  let hasReasoning = false;
  let hasCacheRead = false;
  let hasCacheWrite = false;
  for (const u of usages) {
    out.inputTokens += u.inputTokens;
    out.outputTokens += u.outputTokens;
    if (u.reasoningTokens != null) {
      hasReasoning = true;
      out.reasoningTokens = (out.reasoningTokens ?? 0) + u.reasoningTokens;
    }
    if (u.cacheReadTokens != null) {
      hasCacheRead = true;
      out.cacheReadTokens = (out.cacheReadTokens ?? 0) + u.cacheReadTokens;
    }
    if (u.cacheWriteTokens != null) {
      hasCacheWrite = true;
      out.cacheWriteTokens = (out.cacheWriteTokens ?? 0) + u.cacheWriteTokens;
    }
  }
  if (!hasReasoning) delete out.reasoningTokens;
  if (!hasCacheRead) delete out.cacheReadTokens;
  if (!hasCacheWrite) delete out.cacheWriteTokens;
  return out;
}

/** German one-liner for usage chips in admin history. */
export function formatUsageLine(
  usage: AiTokenUsage | undefined,
): string | null {
  if (!usage) return null;
  const parts = [
    `In ${usage.inputTokens.toLocaleString("de-DE")}`,
    `Out ${usage.outputTokens.toLocaleString("de-DE")}`,
  ];
  if (usage.reasoningTokens != null && usage.reasoningTokens > 0) {
    parts.push(`Think ${usage.reasoningTokens.toLocaleString("de-DE")}`);
  }
  if (usage.cacheReadTokens != null && usage.cacheReadTokens > 0) {
    parts.push(`Cache↕ ${usage.cacheReadTokens.toLocaleString("de-DE")}`);
  }
  if (usage.cacheWriteTokens != null && usage.cacheWriteTokens > 0) {
    parts.push(`Cache↑ ${usage.cacheWriteTokens.toLocaleString("de-DE")}`);
  }
  return parts.join(" · ");
}
