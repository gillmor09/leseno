"use client";

/**
 * Fire-and-forget UI activity tracking for signed-in users.
 * Guests are ignored server-side; failures never surface toasts.
 */

import { logActivityAction } from "@/app/actions/log-activity";

/**
 * Logs a UI event (`ui.*`). Safe to call from click handlers.
 */
export function trackUserActivity(input: {
  action: string;
  label?: string;
  path?: string;
  metadata?: Record<string, unknown>;
}): void {
  void logActivityAction({
    action: input.action,
    label: input.label,
    path:
      input.path ??
      (typeof window !== "undefined" ? window.location.pathname : undefined),
    metadata: input.metadata,
  });
}
