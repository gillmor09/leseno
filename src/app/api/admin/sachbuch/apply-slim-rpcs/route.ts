/**
 * One-shot admin: apply slim list + shell-get RPCs via DATABASE_URL.
 * Only works where Postgres is reachable (Coolify), not from a local laptop.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { NextResponse } from "next/server";
import { isCurrentUserAdmin } from "@/lib/auth/session";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST() {
  if (!(await isCurrentUserAdmin())) {
    return NextResponse.json(
      { error: "Dazu brauchst du Admin-Rechte." },
      { status: 403 },
    );
  }

  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    return NextResponse.json(
      { error: "DATABASE_URL fehlt auf diesem Host." },
      { status: 500 },
    );
  }

  try {
    const pgMod = await import("pg");
    const Client = pgMod.Client ?? pgMod.default?.Client;
    if (!Client) {
      return NextResponse.json({ error: "pg nicht installiert." }, { status: 500 });
    }
    const files = [
      "supabase/migrations/20261104120000_sachbuch_list_slim.sql",
      "supabase/migrations/20261104123000_sachbuch_admin_shell_get.sql",
    ];
    const client = new Client({
      connectionString: url,
      ssl: url.includes("sslmode=require")
        ? { rejectUnauthorized: false }
        : undefined,
      connectionTimeoutMillis: 5_000,
    });
    await client.connect();
    try {
      for (const file of files) {
        const sql = readFileSync(resolve(process.cwd(), file), "utf8");
        await client.query(sql);
      }
    } finally {
      await client.end();
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Slim-RPCs konnten nicht angewendet werden.",
      },
      { status: 500 },
    );
  }
}
