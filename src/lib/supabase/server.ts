import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { APP_DB_SCHEMA, getSupabasePublicConfig } from "@/lib/supabase/config";

export async function createClient(schema: string | null = APP_DB_SCHEMA) {
  const { url, anonKey } = getSupabasePublicConfig();
  const cookieStore = await cookies();

  return createServerClient(url, anonKey, {
    ...(schema
      ? {
          db: {
            schema,
          },
        }
      : {}),
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Called from a Server Component — middleware/proxy refreshes sessions.
        }
      },
    },
  });
}
