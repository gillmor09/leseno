import { createClient } from "@/lib/supabase/server";

/**
 * True when the current session belongs to an admin.
 * Role lives in Supabase Auth `app_metadata.role` (`admin`).
 */
export async function isCurrentUserAdmin(): Promise<boolean> {
  try {
    const supabase = await createClient(null);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return user?.app_metadata?.role === "admin";
  } catch {
    return false;
  }
}
