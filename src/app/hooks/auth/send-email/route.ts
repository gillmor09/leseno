/**
 * Unified Supabase Send Email hook — routes signup → register, recovery → forget.
 * Prefer this URL in Auth → Hooks when only one HTTP endpoint is configured.
 */

import { NextResponse } from "next/server";
import { templateIdForEmailAction } from "@/lib/auth/email-templates";
import { handleAuthEmailHookPost } from "@/lib/auth/email-hook-handler";
import { verifyAuthEmailHookRequest } from "@/lib/auth/email-hook-security";

export async function GET() {
  const html = `<!DOCTYPE html>
<html lang="de">
<head><meta charset="utf-8" /><title>Leseno Auth Send-Email Hook</title></head>
<body style="font-family:Nunito,system-ui,sans-serif;background:#f4f4f5;padding:2rem;">
  <main style="max-width:40rem;margin:0 auto;background:#fff;border-radius:1.5rem;padding:1.75rem;">
    <h1>Send Email Hook</h1>
    <p>POST-Endpoint für Supabase Auth. Leitet <code>signup</code> nach
      <a href="/hooks/auth/register">/hooks/auth/register</a> und
      <code>recovery</code> nach
      <a href="/hooks/auth/forget">/hooks/auth/forget</a>.</p>
  </main>
</body>
</html>`;
  return new NextResponse(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const verified = verifyAuthEmailHookRequest({
    rawBody,
    headers: request.headers,
  });
  if (!verified.ok) {
    return NextResponse.json({ error: verified.error }, { status: 401 });
  }

  let actionType = "";
  try {
    const payload = JSON.parse(rawBody) as {
      email_data?: { email_action_type?: string };
    };
    actionType = payload.email_data?.email_action_type?.trim() ?? "";
  } catch {
    return NextResponse.json({ error: "Ungültiges JSON." }, { status: 400 });
  }

  const templateId = templateIdForEmailAction(actionType);
  if (!templateId) {
    return NextResponse.json(
      {
        error: `Nicht unterstützter email_action_type: ${actionType || "leer"}. Unterstützt: signup, recovery.`,
      },
      { status: 400 },
    );
  }

  // Re-wrap body so the specialized handler can verify again with same headers.
  const forwarded = new Request(request.url, {
    method: "POST",
    headers: request.headers,
    body: rawBody,
  });
  return handleAuthEmailHookPost(templateId, forwarded);
}
