/**
 * Loads/saves auth email templates via service-role RPCs.
 */

import { createServiceClient } from "@/lib/supabase/service";
import {
  AUTH_EMAIL_TEMPLATE_IDS,
  FALLBACK_AUTH_EMAIL_TEMPLATES,
  type AuthEmailTemplate,
  type AuthEmailTemplateId,
} from "@/lib/auth/email-templates";

type Row = {
  id: string;
  label: string;
  description: string;
  subject: string;
  html_body: string;
  enabled: boolean;
  updated_at: string | null;
};

function mapRow(row: Row): AuthEmailTemplate | null {
  if (!AUTH_EMAIL_TEMPLATE_IDS.includes(row.id as AuthEmailTemplateId)) {
    return null;
  }
  return {
    id: row.id as AuthEmailTemplateId,
    label: row.label,
    description: row.description,
    subject: row.subject,
    htmlBody: row.html_body,
    enabled: Boolean(row.enabled),
    updatedAt: row.updated_at,
  };
}

/**
 * Admin catalog (service role). Throws when RPC/migration is missing.
 */
export async function listAuthEmailTemplates(): Promise<AuthEmailTemplate[]> {
  const supabase = createServiceClient(null);
  const { data, error } = await supabase.rpc("list_auth_email_templates");
  if (error) throw new Error(error.message);
  const rows = (Array.isArray(data) ? data : []) as Row[];
  const mapped = rows
    .map(mapRow)
    .filter((row): row is AuthEmailTemplate => row !== null);
  return mapped.length > 0 ? mapped : FALLBACK_AUTH_EMAIL_TEMPLATES;
}

/**
 * Single template by id (for hooks). Returns null when missing/disabled.
 */
export async function loadAuthEmailTemplate(
  id: AuthEmailTemplateId,
): Promise<AuthEmailTemplate | null> {
  const templates = await listAuthEmailTemplates();
  return templates.find((item) => item.id === id) ?? null;
}

/**
 * Updates subject/html/enabled for one template.
 */
export async function saveAuthEmailTemplate(input: {
  id: AuthEmailTemplateId;
  subject: string;
  htmlBody: string;
  enabled: boolean;
}): Promise<void> {
  const supabase = createServiceClient(null);
  const { error } = await supabase.rpc("upsert_auth_email_template", {
    p_id: input.id,
    p_subject: input.subject,
    p_html_body: input.htmlBody,
    p_enabled: input.enabled,
  });
  if (error) throw new Error(error.message);
}
