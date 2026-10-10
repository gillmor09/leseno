import { createClient } from "@supabase/supabase-js";

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";
  if (!url || !key) throw new Error("Supabase env fehlt");
  console.log("url", url);
  const sb = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { schema: "leseno" },
  });
  const { data, error } = await sb
    .from("roman_kontext")
    .select("id,title,updated_at")
    .order("updated_at", { ascending: false })
    .limit(20);
  console.log("error", error);
  console.log(JSON.stringify(data, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
