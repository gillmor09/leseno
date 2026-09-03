import { createBrowserClient } from "@supabase/ssr";

import { APP_DB_SCHEMA, getSupabasePublicConfig } from "@/lib/supabase/config";

export function createClient() {
  const { url, anonKey } = getSupabasePublicConfig();
  return createBrowserClient(url, anonKey, {
    db: {
      schema: APP_DB_SCHEMA,
    },
  });
}
