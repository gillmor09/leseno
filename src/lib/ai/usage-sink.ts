/**
 * Client-safe usage recording sink (no Node APIs).
 * Server collector (`usage-collector.ts`) installs the ALS-backed implementation.
 */

import type { AiTokenUsage } from "@/lib/ai/usage-types";

type RecordFn = (usage: AiTokenUsage) => void;

let recordImpl: RecordFn = () => {
  /* no-op until a server collector installs itself */
};

/** Used only by `usage-collector.ts` (server). */
export function installAiUsageRecorder(fn: RecordFn): void {
  recordImpl = fn;
}

/** Record usage from a provider response when a collector is active. */
export function recordAiUsage(usage: AiTokenUsage | null | undefined): void {
  if (!usage) return;
  recordImpl({
    inputTokens: Math.max(0, Math.round(usage.inputTokens)),
    outputTokens: Math.max(0, Math.round(usage.outputTokens)),
    reasoningTokens:
      usage.reasoningTokens != null
        ? Math.max(0, Math.round(usage.reasoningTokens))
        : undefined,
    cacheReadTokens:
      usage.cacheReadTokens != null
        ? Math.max(0, Math.round(usage.cacheReadTokens))
        : undefined,
    cacheWriteTokens:
      usage.cacheWriteTokens != null
        ? Math.max(0, Math.round(usage.cacheWriteTokens))
        : undefined,
  });
}
