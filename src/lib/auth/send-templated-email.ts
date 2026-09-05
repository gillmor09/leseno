/**
 * Renders an auth email template and sends it via SMTP.
 * Used by signup/recovery in-app and by Supabase Send Email hooks.
 */

import {
  renderAuthEmailTemplate,
  type AuthEmailTemplateId,
} from "@/lib/auth/email-templates";
import { loadAuthEmailTemplate } from "@/lib/auth/email-templates-repository";
import {
  hasSmtpConfig,
  sendSmtpHtmlEmail,
} from "@/lib/auth/email-hook-security";
import { getAuthEmailSiteUrl } from "@/lib/site-url";

export type AuthEmailTemplateValues = {
  email: string;
  confirmation_url: string;
  token?: string;
  site_url?: string;
  redirect_to?: string;
};

/**
 * Loads the admin template, fills placeholders, and sends HTML mail.
 */
export async function sendTemplatedAuthEmail(input: {
  templateId: AuthEmailTemplateId;
  values: AuthEmailTemplateValues;
}): Promise<void> {
  if (!hasSmtpConfig()) {
    throw new Error(
      "SMTP ist nicht konfiguriert (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM).",
    );
  }

  const template = await loadAuthEmailTemplate(input.templateId);
  if (!template || !template.enabled) {
    throw new Error(
      `E-Mail-Template „${input.templateId}“ fehlt oder ist deaktiviert.`,
    );
  }

  const siteUrl =
    input.values.site_url?.trim() || getAuthEmailSiteUrl();

  const values = {
    email: input.values.email,
    confirmation_url: input.values.confirmation_url,
    token: input.values.token ?? "",
    site_url: siteUrl,
    redirect_to: input.values.redirect_to ?? "",
  };

  const subject = renderAuthEmailTemplate(template.subject, values);
  const html = renderAuthEmailTemplate(template.htmlBody, values);

  await sendSmtpHtmlEmail({
    to: input.values.email,
    subject,
    html,
  });
}
