/**
 * Progress poll for novel orchestrator — returns full bundle so the UI can
 * show each intermediate artifact (styleguide, world, chapters, feedback).
 */

import { NextResponse } from "next/server";
import { isCurrentUserAdmin } from "@/lib/auth/session";
import { getNovelBundle } from "@/lib/novel/repository";

export const runtime = "nodejs";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request: Request) {
  if (!(await isCurrentUserAdmin())) {
    return NextResponse.json(
      { error: "Dazu brauchst du Admin-Rechte." },
      { status: 403 },
    );
  }

  const { searchParams } = new URL(request.url);
  const novelId = searchParams.get("novelId")?.trim() ?? "";
  if (!UUID_RE.test(novelId)) {
    return NextResponse.json({ error: "Ungültige Buch-ID." }, { status: 400 });
  }

  const bundle = await getNovelBundle(novelId);
  if (!bundle) {
    return NextResponse.json({ error: "Roman nicht gefunden." }, { status: 404 });
  }

  return NextResponse.json({
    status: bundle.novel.status,
    orchestratorStatus: bundle.novel.orchestratorStatus,
    chapterCount: bundle.chapters.length,
    approvedCount: bundle.chapters.filter(
      (c) =>
        c.status === "approved" || c.status === "approved_with_warnings",
    ).length,
    bundle,
  });
}
