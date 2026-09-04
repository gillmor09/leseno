/**
 * Session helpers for signed-in state and role checks.
 */

import { createClient } from "@/lib/supabase/server";
import type { User } from "@supabase/supabase-js";

/**
 * Returns the current Auth user or null when signed out / unreachable.
 */
export async function getCurrentUser(): Promise<User | null> {
  try {
    const supabase = await createClient(null);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return user ?? null;
  } catch {
    return null;
  }
}

/**
 * True when the current session belongs to an admin.
 * Role lives in Supabase Auth `app_metadata.role` (`admin`).
 */
export async function isCurrentUserAdmin(): Promise<boolean> {
  const user = await getCurrentUser();
  return user?.app_metadata?.role === "admin";
}
