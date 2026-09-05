/**
 * Best-effort user activity logging (auth, story, UI).
 * Never throws to callers — logging must not break product flows.
 */

import { createServiceClient } from "@/lib/supabase/service";
import { createClient } from "@/lib/supabase/server";

export type LogUserActivityInput = {
  /** Canonical action key, e.g. `auth.sign_in`, `story.generate`, `ui.click`. */
  action: string;
  label?: string;
  path?: string;
  metadata?: Record<string, unknown>;
  /** When set, uses service role (e.g. after sign-in before session cookies settle). */
  userId?: string | null;
};

export type UserActivityAdminRow = {
  id: string;
  userId: string | null;
  email: string | null;
  action: string;
  label: string;
  path: string;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type UserActivityActionCount = {
  action: string;
  count: number;
};

/**
 * Appends one row to `leseno.user_activities`.
 * Prefer `userId` + service role for auth events; otherwise uses `log_my_activity` RPC.
 */
export async function logUserActivity(
  input: LogUserActivityInput,
): Promise<void> {
  const action = input.action.trim();
  if (!action) return;

  const label = input.label?.trim() ?? "";
  const path = input.path?.trim() ?? "";
  const metadata = input.metadata ?? {};

  try {
    if (input.userId) {
      const supabase = createServiceClient(null);
      const { error } = await supabase.rpc("insert_user_activity_admin", {
        p_user_id: input.userId,
        p_action: action,
        p_label: label,
        p_path: path,
        p_metadata: metadata,
      });
      if (error) {
        console.error("[logUserActivity] service rpc", error.message);
      }
      return;
    }

    const supabase = await createClient();
    const { error } = await supabase.rpc("log_my_activity", {
      p_action: action,
      p_label: label,
      p_path: path,
      p_metadata: metadata,
    });
    if (error) {
      console.error("[logUserActivity] rpc", error.message);
    }
  } catch (error) {
    console.error("[logUserActivity]", error);
  }
}

type ActivityRow = {
  id: string;
  user_id: string | null;
  email: string | null;
  action: string;
  label: string;
  path: string;
  metadata: unknown;
  created_at: string;
};

/**
 * Loads recent activities for the admin overview (newest first).
 * Uses public RPC — `leseno` is not exposed on PostgREST.
 */
export async function loadActivitiesForAdmin(options?: {
  limit?: number;
}): Promise<{
  rows: UserActivityAdminRow[];
  counts: UserActivityActionCount[];
}> {
  const limit = Math.min(Math.max(options?.limit ?? 1000, 1), 5000);
  const supabase = createServiceClient(null);

  const { data, error } = await supabase.rpc("list_user_activities_admin", {
    p_limit: limit,
  });

  if (error) {
    throw new Error(error.message);
  }

  const raw = (Array.isArray(data) ? data : []) as ActivityRow[];

  const rows: UserActivityAdminRow[] = raw.map((row) => {
    const metadata =
      row.metadata &&
      typeof row.metadata === "object" &&
      !Array.isArray(row.metadata)
        ? (row.metadata as Record<string, unknown>)
        : {};

    return {
      id: row.id,
      userId: row.user_id,
      email: row.email,
      action: row.action,
      label: row.label ?? "",
      path: row.path ?? "",
      metadata,
      createdAt: row.created_at,
    };
  });

  const countMap = new Map<string, number>();
  for (const row of rows) {
    countMap.set(row.action, (countMap.get(row.action) ?? 0) + 1);
  }

  const counts = [...countMap.entries()]
    .map(([action, count]) => ({ action, count }))
    .sort((a, b) => b.count - a.count || a.action.localeCompare(b.action));

  return { rows, counts };
}

/**
 * Deletes all activities with `created_at` strictly before `before` (ISO timestamptz).
 * Returns how many rows were removed.
 */
export async function deleteActivitiesBeforeAdmin(
  beforeIso: string,
): Promise<number> {
  const supabase = createServiceClient(null);
  const { data, error } = await supabase.rpc(
    "delete_user_activities_before_admin",
    { p_before: beforeIso },
  );

  if (error) {
    throw new Error(error.message);
  }

  return typeof data === "number" ? data : Number(data ?? 0);
}
