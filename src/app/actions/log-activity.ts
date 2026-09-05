"use server";

/**
 * Client → server activity events (UI clicks / selections).
 * Best-effort; never fails the product flow with a hard error to the user.
 */

import type { ActionResult } from "@/lib/types/actions";
import { getCurrentUser } from "@/lib/auth/session";
import { logUserActivity } from "@/lib/users/activity";
import { z } from "zod";
import "@/lib/validations/configure-zod";

const logActivitySchema = z.object({
  action: z
    .string()
    .trim()
    .min(1, { message: "action fehlt." })
    .max(120),
  label: z.string().trim().max(200).optional(),
  path: z.string().trim().max(500).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

/**
 * Logs a UI / client event for the signed-in user (or silently no-ops if guest).
 */
export async function logActivityAction(
  input: unknown,
): Promise<ActionResult> {
  const parsed = logActivitySchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Aktivität ungültig." };
  }

  const user = await getCurrentUser();
  if (!user) {
    return { success: true };
  }

  await logUserActivity({
    action: parsed.data.action.startsWith("ui.")
      ? parsed.data.action
      : `ui.${parsed.data.action}`,
    label: parsed.data.label,
    path: parsed.data.path,
    metadata: parsed.data.metadata,
    userId: user.id,
  });

  return { success: true };
}
