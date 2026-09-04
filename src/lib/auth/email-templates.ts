/**
 * Auth email templates for Supabase Send Email hooks (register + forget).
 */

export const AUTH_EMAIL_TEMPLATE_IDS = ["register", "forget"] as const;

export type AuthEmailTemplateId = (typeof AUTH_EMAIL_TEMPLATE_IDS)[number];

export type AuthEmailTemplate = {
  id: AuthEmailTemplateId;
  label: string;
  description: string;
  subject: string;
  htmlBody: string;
  enabled: boolean;
  updatedAt: string | null;
};

/** Placeholders replaced when rendering for send / preview. */
export const AUTH_EMAIL_PLACEHOLDERS = [
  "email",
  "confirmation_url",
  "token",
  "site_url",
  "redirect_to",
] as const;

export const FALLBACK_AUTH_EMAIL_TEMPLATES: AuthEmailTemplate[] = [
  {
    id: "register",
    label: "Registrierung",
    description:
      "Bestätigung nach der Anmeldung (Supabase email_action_type: signup).",
    subject: "Willkommen bei Leseno — bitte bestätige deine E-Mail",
    htmlBody:
      "<p>Hallo {{email}},</p><p><a href=\"{{confirmation_url}}\">E-Mail bestätigen</a></p><p>Code: {{token}}</p>",
    enabled: true,
    updatedAt: null,
  },
  {
    id: "forget",
    label: "Passwort vergessen",
    description:
      "Link zum Zurücksetzen des Passworts (Supabase email_action_type: recovery).",
    subject: "Leseno — Passwort zurücksetzen",
    htmlBody:
      "<p>Hallo {{email}},</p><p><a href=\"{{confirmation_url}}\">Neues Passwort wählen</a></p><p>Code: {{token}}</p>",
    enabled: true,
    updatedAt: null,
  },
];

/**
 * Maps our template id to Supabase `email_action_type` values this page accepts.
 */
export function emailActionTypesForTemplate(
  id: AuthEmailTemplateId,
): string[] {
  if (id === "register") return ["signup"];
  return ["recovery"];
}

export function templateIdForEmailAction(
  actionType: string,
): AuthEmailTemplateId | null {
  if (actionType === "signup") return "register";
  if (actionType === "recovery") return "forget";
  return null;
}

/**
 * Replaces `{{name}}` placeholders (case-sensitive) in subject/HTML.
 */
export function renderAuthEmailTemplate(
  template: string,
  values: Record<string, string>,
): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key: string) => {
    return values[key] ?? "";
  });
}

/**
 * Builds the Auth verify URL Supabase expects in custom emails.
 */
export function buildAuthConfirmationUrl(input: {
  supabaseUrl: string;
  tokenHash: string;
  emailActionType: string;
  redirectTo: string;
}): string {
  const base = input.supabaseUrl.replace(/\/$/, "");
  const url = new URL(`${base}/auth/v1/verify`);
  url.searchParams.set("token", input.tokenHash);
  url.searchParams.set("type", input.emailActionType);
  if (input.redirectTo) {
    url.searchParams.set("redirect_to", input.redirectTo);
  }
  return url.toString();
}
