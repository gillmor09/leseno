/**
 * Anthropic Message Batches API — async /v1/messages/batches (≈50% price).
 * Used by Manuskript Verbessern (one request per chapter, content-frozen).
 * Docs: https://docs.anthropic.com/en/api/creating-message-batches
 */

import {
  AI_FETCH_TIMEOUT_MS,
  aiFetchSignal,
  mapAiFetchError,
} from "@/lib/ai/fetch-timeout";
import {
  ANTHROPIC_VERSION,
  buildClaudeMessagesParams,
  getClaudeApiKey,
  type ClaudeGenerateInput,
} from "@/lib/ai/claude";
import { recordAiUsage } from "@/lib/ai/usage";
import type { AiTokenUsage } from "@/lib/ai/usage-types";
import { sumAiUsages } from "@/lib/ai/usage-types";

const BATCHES_URL = "https://api.anthropic.com/v1/messages/batches";

export type ClaudeBatchRequest = {
  /** Unique within the batch; pattern ^[a-zA-Z0-9_-]{1,64}$ */
  customId: string;
  params: ClaudeGenerateInput;
};

export type ClaudeBatchRequestCounts = {
  processing: number;
  succeeded: number;
  errored: number;
  canceled: number;
  expired: number;
};

export type ClaudeMessageBatch = {
  id: string;
  processingStatus: "in_progress" | "canceling" | "ended";
  requestCounts: ClaudeBatchRequestCounts;
  resultsUrl: string | null;
  createdAt?: string;
  endedAt?: string | null;
  expiresAt?: string;
};

export type ClaudeBatchSucceededResult = {
  customId: string;
  type: "succeeded";
  text: string;
  usage?: AiTokenUsage;
  stopReason?: string;
};

export type ClaudeBatchFailedResult = {
  customId: string;
  type: "errored" | "canceled" | "expired";
  error?: string;
};

export type ClaudeBatchIndividualResult =
  | ClaudeBatchSucceededResult
  | ClaudeBatchFailedResult;

type AnthropicBatchPayload = {
  id?: string;
  type?: string;
  processing_status?: string;
  request_counts?: {
    processing?: number;
    succeeded?: number;
    errored?: number;
    canceled?: number;
    expired?: number;
  };
  results_url?: string | null;
  created_at?: string;
  ended_at?: string | null;
  expires_at?: string;
  error?: { type?: string; message?: string };
};

type AnthropicResultLine = {
  custom_id?: string;
  result?: {
    type?: string;
    message?: {
      content?: Array<{ type?: string; text?: string }>;
      stop_reason?: string | null;
      usage?: {
        input_tokens?: number;
        output_tokens?: number;
        cache_creation_input_tokens?: number;
        cache_read_input_tokens?: number;
      };
    };
    error?: {
      type?: string;
      error?: { type?: string; message?: string };
      message?: string;
    };
  };
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function mapBatch(payload: AnthropicBatchPayload): ClaudeMessageBatch {
  const status = payload.processing_status;
  if (
    status !== "in_progress" &&
    status !== "canceling" &&
    status !== "ended"
  ) {
    throw new Error(
      `Unerwarteter Batch-Status „${status ?? "?"}“.`,
    );
  }
  const counts = payload.request_counts ?? {};
  return {
    id: payload.id ?? "",
    processingStatus: status,
    requestCounts: {
      processing: counts.processing ?? 0,
      succeeded: counts.succeeded ?? 0,
      errored: counts.errored ?? 0,
      canceled: counts.canceled ?? 0,
      expired: counts.expired ?? 0,
    },
    resultsUrl: payload.results_url ?? null,
    createdAt: payload.created_at,
    endedAt: payload.ended_at,
    expiresAt: payload.expires_at,
  };
}

function anthropicHeaders(apiKey: string): HeadersInit {
  return {
    "Content-Type": "application/json",
    "x-api-key": apiKey,
    "anthropic-version": ANTHROPIC_VERSION,
  };
}

/**
 * Submit a Message Batch. Processing starts immediately (async, up to 24h).
 */
export async function createClaudeMessageBatch(
  requests: ClaudeBatchRequest[],
): Promise<ClaudeMessageBatch> {
  if (requests.length < 1) {
    throw new Error("Claude Batch: mindestens eine Anfrage nötig.");
  }
  const apiKey = getClaudeApiKey();
  const body = {
    requests: requests.map((r) => ({
      custom_id: r.customId,
      params: buildClaudeMessagesParams({
        ...r.params,
        // Batches often run >5m — prefer 1h prompt cache when supported.
        cacheTtl: r.params.cacheTtl ?? "1h",
      }),
    })),
  };

  const response = await fetch(BATCHES_URL, {
    method: "POST",
    headers: anthropicHeaders(apiKey),
    body: JSON.stringify(body),
    signal: aiFetchSignal(AI_FETCH_TIMEOUT_MS),
  });

  let payload: AnthropicBatchPayload;
  try {
    payload = (await response.json()) as AnthropicBatchPayload;
  } catch {
    throw new Error(
      `Claude Batch anlegen fehlgeschlagen (${response.status}).`,
    );
  }

  if (!response.ok || payload.error) {
    throw new Error(
      payload.error?.message ??
        `Claude Batch anlegen fehlgeschlagen (${response.status}).`,
    );
  }
  if (!payload.id?.trim()) {
    throw new Error("Claude Batch: keine Batch-ID zurückgegeben.");
  }
  return mapBatch(payload);
}

/** Poll a single Message Batch by id. */
export async function getClaudeMessageBatch(
  batchId: string,
): Promise<ClaudeMessageBatch> {
  const id = batchId.trim();
  if (!id) throw new Error("Claude Batch-ID fehlt.");
  const apiKey = getClaudeApiKey();

  const response = await fetch(`${BATCHES_URL}/${encodeURIComponent(id)}`, {
    method: "GET",
    headers: anthropicHeaders(apiKey),
    signal: aiFetchSignal(AI_FETCH_TIMEOUT_MS),
  });

  let payload: AnthropicBatchPayload;
  try {
    payload = (await response.json()) as AnthropicBatchPayload;
  } catch {
    throw new Error(
      `Claude Batch laden fehlgeschlagen (${response.status}).`,
    );
  }

  if (!response.ok || payload.error) {
    throw new Error(
      payload.error?.message ??
        `Claude Batch laden fehlgeschlagen (${response.status}).`,
    );
  }
  return mapBatch(payload);
}

/**
 * Poll until `ended` or wall-clock budget exhausted.
 * `onProgress` fires on each successful poll (for history live labels).
 */
export async function waitForClaudeMessageBatch(input: {
  batchId: string;
  /** Default 50 minutes — leave headroom under route maxDuration 3600. */
  timeoutMs?: number;
  /** Default 20s between polls. */
  pollIntervalMs?: number;
  onProgress?: (batch: ClaudeMessageBatch) => void | Promise<void>;
}): Promise<ClaudeMessageBatch> {
  const timeoutMs = input.timeoutMs ?? 50 * 60_000;
  const pollIntervalMs = Math.max(5_000, input.pollIntervalMs ?? 20_000);
  const deadline = Date.now() + timeoutMs;
  let last: ClaudeMessageBatch | null = null;

  while (Date.now() < deadline) {
    try {
      last = await getClaudeMessageBatch(input.batchId);
      await input.onProgress?.(last);
      if (last.processingStatus === "ended") {
        return last;
      }
    } catch (error) {
      // Transient poll errors — keep waiting until budget ends.
      if (Date.now() + pollIntervalMs >= deadline) {
        throw error instanceof Error
          ? error
          : mapAiFetchError(error, "Claude Batch", timeoutMs);
      }
    }
    const remaining = deadline - Date.now();
    if (remaining <= 0) break;
    await sleep(Math.min(pollIntervalMs, remaining));
  }

  if (last) {
    throw new Error(
      `Claude Batch ${input.batchId} noch nicht fertig (Status: ${last.processingStatus}, ` +
        `${last.requestCounts.succeeded} ok / ${last.requestCounts.processing} laufend). ` +
        `Bitte später erneut starten oder Batch-Status prüfen.`,
    );
  }
  throw new Error(
    `Claude Batch ${input.batchId}: Timeout beim Warten auf Ergebnisse.`,
  );
}

/**
 * Download and parse the JSONL results file for an ended batch.
 * Records token usage into the active collector when present.
 */
export async function fetchClaudeMessageBatchResults(
  batch: ClaudeMessageBatch,
): Promise<{
  results: ClaudeBatchIndividualResult[];
  usage?: AiTokenUsage;
}> {
  const url = batch.resultsUrl?.trim();
  if (!url) {
    throw new Error(
      `Claude Batch ${batch.id}: results_url fehlt (Status: ${batch.processingStatus}).`,
    );
  }
  const apiKey = getClaudeApiKey();
  const response = await fetch(url, {
    method: "GET",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
    },
    signal: aiFetchSignal(AI_FETCH_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(
      `Claude Batch-Ergebnisse laden fehlgeschlagen (${response.status}).`,
    );
  }

  const raw = await response.text();
  const results: ClaudeBatchIndividualResult[] = [];
  const usages: AiTokenUsage[] = [];

  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let parsed: AnthropicResultLine;
    try {
      parsed = JSON.parse(trimmed) as AnthropicResultLine;
    } catch {
      continue;
    }
    const customId = parsed.custom_id?.trim() ?? "";
    if (!customId) continue;
    const result = parsed.result;
    const type = result?.type ?? "errored";

    if (type === "succeeded" && result?.message) {
      const text =
        result.message.content
          ?.filter((b) => b.type === "text" || Boolean(b.text))
          .map((b) => b.text ?? "")
          .join("")
          .trim() ?? "";
      const u = result.message.usage;
      let usage: AiTokenUsage | undefined;
      if (u) {
        usage = {
          inputTokens: u.input_tokens ?? 0,
          outputTokens: u.output_tokens ?? 0,
          cacheReadTokens: u.cache_read_input_tokens,
          cacheWriteTokens: u.cache_creation_input_tokens,
        };
        usages.push(usage);
        recordAiUsage(usage);
      }
      results.push({
        customId,
        type: "succeeded",
        text,
        usage,
        stopReason: result.message.stop_reason ?? undefined,
      });
      continue;
    }

    if (type === "canceled" || type === "expired") {
      results.push({ customId, type });
      continue;
    }

    const errMsg =
      result?.error?.error?.message ??
      result?.error?.message ??
      "Anfrage fehlgeschlagen.";
    results.push({ customId, type: "errored", error: errMsg });
  }

  return { results, usage: sumAiUsages(usages) };
}

/** Human-readable progress line from request counts. */
export function formatClaudeBatchProgress(
  batch: ClaudeMessageBatch,
  total: number,
): string {
  const c = batch.requestCounts;
  const done = c.succeeded + c.errored + c.canceled + c.expired;
  if (batch.processingStatus === "ended") {
    return `Claude Batch fertig · ${c.succeeded}/${total} ok` +
      (c.errored > 0 ? ` · ${c.errored} Fehler` : "");
  }
  return (
    `Claude Batch läuft · ${done}/${total} erledigt` +
    (c.processing > 0 ? ` · ${c.processing} in Arbeit` : "") +
    (c.succeeded > 0 ? ` · ${c.succeeded} ok` : "")
  );
}
