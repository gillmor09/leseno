import { createClient } from "@supabase/supabase-js";

import { APP_DB_SCHEMA, getSupabasePublicConfig } from "@/lib/supabase/config";

/**
 * Server-only client with the service role. Bypasses RLS for admin writes.
 * Never import this into client components.
 */
export function createServiceClient() {
  const { url } = getSupabasePublicConfig();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";

  if (!serviceRoleKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY fehlt. Wird für Admin-Schreibzugriffe benötigt.",
    );
  }

  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { schema: APP_DB_SCHEMA },
  });
}
