/**
 * Apply admin_delete_chapters_above migration via DATABASE_URL.
 * Usage: npx tsx --env-file=.env.local scripts/tmp-apply-delete-chapters-above.ts
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";

async function main() {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) throw new Error("DATABASE_URL fehlt in .env.local");

  const sqlPath = join(
    process.cwd(),
    "supabase/migrations/20261017170000_leseno_novels_delete_chapters_above.sql",
  );
  const ddl = readFileSync(sqlPath, "utf8");

  const sql = postgres(url, { max: 1, idle_timeout: 5, connect_timeout: 15 });
  try {
    await sql.unsafe(ddl);
    const rows = await sql`
      select pg_get_function_identity_arguments(p.oid) as args
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname = 'admin_delete_chapters_above'
    `;
    console.log("ok: admin_delete_chapters_above", rows);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
