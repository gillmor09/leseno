import "@/lib/validations/configure-zod";
import { z } from "zod";

export const signInSchema = z.object({
  email: z.email({ message: "Bitte eine gültige E-Mail angeben." }),
  password: z.string().min(8, {
    message: "Das Passwort muss mindestens 8 Zeichen lang sein.",
  }),
});

/** Unified login: E-Mail (Eltern) or Kennung (Kind) — detected by `@`. */
export const unifiedSignInSchema = z.object({
  identifier: z
    .string()
    .trim()
    .min(1, { message: "Bitte E-Mail oder Kennung eingeben." })
    .max(254, { message: "Eingabe ist zu lang." }),
  password: z.string().min(8, {
    message: "Das Passwort muss mindestens 8 Zeichen lang sein.",
  }),
});

export const signUpSchema = signInSchema
  .extend({
    confirmPassword: z.string().min(8, {
      message: "Bitte das Passwort wiederholen.",
    }),
    /** Soft invite attribution from `?ref=` / localStorage (optional). */
    referralCode: z
      .string()
      .trim()
      .max(64)
      .regex(/^[a-zA-Z0-9_-]*$/, {
        message: "Ungültiger Empfehlungs-Code.",
      })
      .optional()
      .transform((value) => (value ? value.toLowerCase() : undefined)),
    /** Promo from `?promo=` / localStorage — applied on first membership Checkout. */
    promoCode: z
      .string()
      .trim()
      .max(64)
      .regex(/^[a-zA-Z0-9_-]*$/, {
        message: "Ungültiger Promo-Code.",
      })
      .optional()
      .transform((value) => (value ? value.toLowerCase() : undefined)),
  })
  .refine((value) => value.password === value.confirmPassword, {
    message: "Die Passwörter stimmen nicht überein.",
    path: ["confirmPassword"],
  });

export const forgotPasswordSchema = z
  .object({
    email: z
      .string()
      .trim()
      .min(1, { message: "Bitte die E-Mail deines Eltern-Kontos angeben." })
      .max(254, { message: "Die E-Mail ist zu lang." }),
  })
  .superRefine((value, ctx) => {
    const email = value.email;
    if (!email.includes("@")) {
      ctx.addIssue({
        code: "custom",
        path: ["email"],
        message:
          "Passwort zurücksetzen geht nur mit der E-Mail des Eltern-Kontos. Eine Kennung / ein Profilpasswort kannst du hier nicht ändern — bitte in Meine Welt.",
      });
      return;
    }
    const parsed = z.email().safeParse(email);
    if (!parsed.success) {
      ctx.addIssue({
        code: "custom",
        path: ["email"],
        message: "Bitte eine gültige E-Mail angeben.",
      });
    }
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
