import { z } from "zod";
import { AUTH_EMAIL_TEMPLATE_IDS } from "@/lib/auth/email-templates";

const templateIds = [...AUTH_EMAIL_TEMPLATE_IDS] as [
  (typeof AUTH_EMAIL_TEMPLATE_IDS)[number],
  ...(typeof AUTH_EMAIL_TEMPLATE_IDS)[number][],
];

export const authEmailTemplateUpdateSchema = z.object({
  id: z.enum(templateIds, { message: "Unbekannte Template-ID." }),
  subject: z
    .string()
    .trim()
    .min(1, "Betreff darf nicht leer sein.")
    .max(200, "Betreff ist zu lang (max. 200 Zeichen)."),
  htmlBody: z
    .string()
    .trim()
    .min(1, "HTML-Inhalt darf nicht leer sein.")
    .max(100_000, "HTML-Inhalt ist zu lang."),
  enabled: z.boolean(),
});

export const saveAuthEmailTemplatesSchema = z.object({
  templates: z
    .array(authEmailTemplateUpdateSchema)
    .min(1, "Keine Templates zum Speichern."),
});
