import { APP_DB_SCHEMA } from "@/lib/supabase/schema";

export function getSupabasePublicConfig(): {
  url: string;
  anonKey: string;
} {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? "";

  if (!url || !anonKey) {
    throw new Error(
      "Supabase ist nicht konfiguriert. NEXT_PUBLIC_SUPABASE_URL und NEXT_PUBLIC_SUPABASE_ANON_KEY setzen.",
    );
  }

  if (!/^https?:\/\//i.test(url)) {
    throw new Error(
      `NEXT_PUBLIC_SUPABASE_URL ist ungültig („${url}“). Erwartet wird z. B. https://supabase-api.example.de`,
    );
  }

  return { url, anonKey };
}

export { APP_DB_SCHEMA };
