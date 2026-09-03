/**
 * Lightweight bot protection for public Server Actions.
 * Combines honeypot, minimum form fill time, and per-IP rate limits.
 * In-memory limits are per process — enough for a single Coolify instance.
 */

import { headers } from "next/headers";
import "@/lib/validations/configure-zod";
import { z } from "zod";

export const botGuardInputSchema = z.object({
  website: z.string().optional().default(""),
  formStartedAt: z.coerce.number().optional(),
});

export type BotGuardInput = z.infer<typeof botGuardInputSchema>;

type RateBucket = {
  count: number;
  resetAt: number;
};

const rateBuckets = new Map<string, RateBucket>();

const GENERIC_BOT_ERROR =
  "Die Anfrage wurde blockiert. Bitte warte kurz und versuche es erneut.";

function pruneExpiredBuckets(now: number) {
  if (rateBuckets.size < 500) {
    return;
  }
  for (const [key, bucket] of rateBuckets) {
    if (bucket.resetAt <= now) {
      rateBuckets.delete(key);
    }
  }
}

export async function getRequestIp(): Promise<string> {
  const headerStore = await headers();
  const forwarded = headerStore.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() || "unknown";
  }
  return headerStore.get("x-real-ip")?.trim() || "unknown";
}

/**
 * Returns a German error message when the request looks automated.
 * Otherwise returns null.
 */
export async function assertBotGuard(
  input: unknown,
  options: {
    action: string;
    /** Minimum milliseconds the form must stay open before submit. */
    minFillMs?: number;
    /** Max requests per window for this action + IP. */
    maxRequests?: number;
    /** Rate-limit window in milliseconds. */
    windowMs?: number;
  },
): Promise<string | null> {
  const parsed = botGuardInputSchema.safeParse(
    input && typeof input === "object" ? input : {},
  );
  const guard = parsed.success
    ? parsed.data
    : { website: "", formStartedAt: undefined };

  // Honeypot: real users never see/fill this field.
  if (guard.website.trim().length > 0) {
    return GENERIC_BOT_ERROR;
  }

  const minFillMs = options.minFillMs ?? 1500;
  const startedAt = guard.formStartedAt;
  const now = Date.now();

  if (
    typeof startedAt !== "number" ||
    !Number.isFinite(startedAt) ||
    startedAt > now + 5_000 ||
    now - startedAt < minFillMs ||
    now - startedAt > 1000 * 60 * 60 * 6
  ) {
    return GENERIC_BOT_ERROR;
  }

  const maxRequests = options.maxRequests ?? 10;
  const windowMs = options.windowMs ?? 15 * 60 * 1000;
  const ip = await getRequestIp();
  const key = `${options.action}:${ip}`;

  pruneExpiredBuckets(now);
  const existing = rateBuckets.get(key);
  if (!existing || existing.resetAt <= now) {
    rateBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return null;
  }

  if (existing.count >= maxRequests) {
    return "Zu viele Versuche. Bitte warte einige Minuten und versuche es erneut.";
  }

  existing.count += 1;
  rateBuckets.set(key, existing);
  return null;
}

/** Client payload fields to merge into Server Action input. */
export type BotGuardClientPayload = {
  website: string;
  formStartedAt: number;
};
