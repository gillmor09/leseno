import "@/lib/validations/configure-zod";
import { z } from "zod";

export const signInSchema = z.object({
  email: z.email({ message: "Bitte eine gültige E-Mail angeben." }),
  password: z.string().min(8, {
    message: "Das Passwort muss mindestens 8 Zeichen lang sein.",
  }),
});

export const signUpSchema = signInSchema
  .extend({
    confirmPassword: z.string().min(8, {
      message: "Bitte das Passwort wiederholen.",
    }),
  })
  .refine((value) => value.password === value.confirmPassword, {
    message: "Die Passwörter stimmen nicht überein.",
    path: ["confirmPassword"],
  });

export const forgotPasswordSchema = z.object({
  email: z.email({ message: "Bitte eine gültige E-Mail angeben." }),
});

export const resetPasswordSchema = z
  .object({
    password: z.string().min(8, {
      message: "Das Passwort muss mindestens 8 Zeichen lang sein.",
    }),
    confirmPassword: z.string().min(8, {
      message: "Bitte das Passwort wiederholen.",
    }),
  })
  .refine((value) => value.password === value.confirmPassword, {
    message: "Die Passwörter stimmen nicht überein.",
    path: ["confirmPassword"],
  });

export const forgotEmailSchema = z.object({
  contactEmail: z.email({
    message: "Bitte eine E-Mail für unsere Rückmeldung angeben.",
  }),
  rememberedName: z
    .string()
    .trim()
    .max(120, { message: "Der Name ist zu lang." })
    .optional()
    .transform((value) => value || null),
  guessedEmail: z
    .string()
    .trim()
    .max(255, { message: "Die vermutete E-Mail ist zu lang." })
    .optional()
    .transform((value) => value || null),
  notes: z
    .string()
    .trim()
    .max(1000, { message: "Die Zusatzinfos sind zu lang." })
    .optional()
    .transform((value) => value || null),
});
