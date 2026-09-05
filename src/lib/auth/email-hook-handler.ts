/**
 * Shared POST/GET handlers for `/hooks/auth/register` and `/hooks/auth/forget`.
 */

import { NextResponse } from "next/server";
import {
  buildAuthConfirmationUrl,
  emailActionTypesForTemplate,
  type AuthEmailTemplateId,
} from "@/lib/auth/email-templates";
import { loadAuthEmailTemplate } from "@/lib/auth/email-templates-repository";
import {
  hasSmtpConfig,
  verifyAuthEmailHookRequest,
} from "@/lib/auth/email-hook-security";
import { sendTemplatedAuthEmail } from "@/lib/auth/send-templated-email";
import {
  forcePublicSiteOrigin,
  getAuthEmailSiteUrl,
} from "@/lib/site-url";

type HookPayload = {
  user?: { email?: string | null };
  email_data?: {
    token?: string;
    token_hash?: string;
    redirect_to?: string;
    email_action_type?: string;
    site_url?: string;
  };
};

/**
 * GET: small HTML page documenting the hook URL (for admins / Supabase config).
 */
export async function handleAuthEmailHookGet(
  templateId: AuthEmailTemplateId,
): Promise<NextResponse> {
  const template = await loadAuthEmailTemplate(templateId).catch(() => null);
  const actions = emailActionTypesForTemplate(templateId).join(", ");
  const label = template?.label ?? templateId;

  const html = `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Leseno Auth-Hook — ${label}</title>
  <style>
    body { font-family: Nunito, system-ui, sans-serif; background:#f4f4f5; color:#18181b; margin:0; padding:2rem; }
    main { max-width:40rem; margin:0 auto; background:#fff; border-radius:1.5rem; padding:1.75rem; box-shadow:0 10px 30px rgba(0,0,0,.06); }
    h1 { font-size:1.5rem; margin:0 0 .5rem; }
    code { background:#f4f4f5; padding:.15rem .4rem; border-radius:.4rem; font-size:.9em; }
    .ok { color:#15803d; font-weight:700; }
    .warn { color:#c2410c; font-weight:700; }
  </style>
</head>
<body>
  <main>
    <p style="text-transform:uppercase;letter-spacing:.06em;font-size:.75rem;font-weight:800;color:#c2410c;margin:0 0 .5rem;">Auth-Hook</p>
    <h1>${label}</h1>
    <p>POST-Endpoint für den Supabase <strong>Send Email</strong>-Hook.</p>
    <p>Erwartete <code>email_action_type</code>: <code>${actions}</code></p>
    <p>Template: ${
      template
        ? template.enabled
          ? `<span class="ok">aktiv</span>`
          : `<span class="warn">deaktiviert</span>`
        : `<span class="warn">nicht geladen</span>`
    }</p>
    <p>SMTP: ${
      hasSmtpConfig()
        ? `<span class="ok">konfiguriert</span>`
        : `<span class="warn">SMTP_* fehlt</span>`
    }</p>
  </main>
</body>
</html>`;

  return new NextResponse(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

/**
 * POST: verify webhook, render template, send via SMTP, return `{}` on success.
 */
export async function handleAuthEmailHookPost(
  templateId: AuthEmailTemplateId,
  request: Request,
): Promise<NextResponse> {
  const rawBody = await request.text();
  const verified = verifyAuthEmailHookRequest({
    rawBody,
    headers: request.headers,
  });
  if (!verified.ok) {
    console.error(`[auth-email-hook/${templateId}]`, verified.error);
    return NextResponse.json({ error: verified.error }, { status: 401 });
  }

  let payload: HookPayload;
  try {
    payload = JSON.parse(rawBody) as HookPayload;
  } catch {
    return NextResponse.json({ error: "Ungültiges JSON." }, { status: 400 });
  }

  const actionType = payload.email_data?.email_action_type?.trim() ?? "";
  const allowed = emailActionTypesForTemplate(templateId);
  if (!allowed.includes(actionType)) {
    return NextResponse.json(
      {
        error: `Diese Seite akzeptiert nur: ${allowed.join(", ")} (bekommen: ${actionType || "leer"}).`,
      },
      { status: 400 },
    );
  }

  const to = payload.user?.email?.trim();
  if (!to) {
    return NextResponse.json(
      { error: "Empfänger-E-Mail fehlt." },
      { status: 400 },
    );
  }

  let template;
  try {
    template = await loadAuthEmailTemplate(templateId);
  } catch (error) {
    console.error(`[auth-email-hook/${templateId}] load`, error);
    return NextResponse.json(
      { error: "Template konnte nicht geladen werden." },
      { status: 500 },
    );
  }

  if (!template || !template.enabled) {
    return NextResponse.json(
      { error: "E-Mail-Template ist deaktiviert oder fehlt." },
      { status: 503 },
    );
  }

  const tokenHash = payload.email_data?.token_hash?.trim() ?? "";
  const publicSite = getAuthEmailSiteUrl();
  const redirectRaw = payload.email_data?.redirect_to?.trim() ?? "";
  const redirectTo =
    forcePublicSiteOrigin(redirectRaw, publicSite) ||
    `${publicSite}/auth/callback?next=/anmelden`;
  /** Short OTP unused in mail body (kept empty for template placeholders). */
  const token = "";
  const siteUrl = publicSite;

  const confirmationUrl = buildAuthConfirmationUrl({
    siteUrl: publicSite,
    tokenHash,
    emailActionType: actionType,
  });

  try {
    await sendTemplatedAuthEmail({
      templateId,
      values: {
        email: to,
        confirmation_url: confirmationUrl,
        token,
        site_url: siteUrl,
        redirect_to: redirectTo,
      },
    });
  } catch (error) {
    console.error(`[auth-email-hook/${templateId}] smtp`, error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "E-Mail konnte nicht gesendet werden.",
      },
      { status: 500 },
    );
  }

  return NextResponse.json({});
}
