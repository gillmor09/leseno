/**
 * Zod schema for the public contact form (reply email + message only).
 */

import "@/lib/validations/configure-zod";
import { z } from "zod";

export const contactFormSchema = z.object({
  email: z
    .string()
    .trim()
    .email("Bitte eine gültige E-Mail-Adresse angeben.")
    .max(254, "E-Mail-Adresse ist zu lang."),
  message: z
    .string()
    .trim()
    .min(5, "Bitte schreib mindestens ein paar Worte.")
    .max(5000, "Die Nachricht ist zu lang (max. 5000 Zeichen)."),
});

export type ContactFormInput = z.infer<typeof contactFormSchema>;
