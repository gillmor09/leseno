"use server";

import { createServiceClient } from "@/lib/supabase/service";
import { createClient } from "@/lib/supabase/server";
import { getSiteUrl } from "@/lib/site-url";
import type { ActionResult } from "@/lib/types/actions";
import {
  forgotEmailSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  signInSchema,
  signUpSchema,
} from "@/lib/validations/auth";

/**
 * Starts an email/password session using Supabase Auth.
 */
export async function signInAction(input: unknown): Promise<ActionResult> {
  const parsed = signInSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Die Anmeldung ist ungültig.",
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) {
    return { success: false, error: "Anmeldung fehlgeschlagen. Bitte prüfe E-Mail und Passwort." };
  }

  return { success: true };
}

/**
 * Creates a new Supabase Auth user and sends the verification email.
 */
export async function signUpAction(input: unknown): Promise<ActionResult> {
  const parsed = signUpSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Die Registrierung ist ungültig.",
    };
  }

  const supabase = await createClient();
  const siteUrl = await getSiteUrl();
  const { email, password } = parsed.data;

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${siteUrl}/auth/callback?next=/anmelden`,
    },
  });

  if (error) {
    // Surface common Supabase error codes in German.
    if (
      error.message?.toLowerCase().includes("already registered") ||
      error.message?.toLowerCase().includes("user already exists") ||
      error.status === 422
    ) {
      return {
        success: false,
        error: "Diese E-Mail-Adresse ist bereits registriert. Bitte melde dich an oder setze dein Passwort zurück.",
      };
    }
    if (error.message?.toLowerCase().includes("password")) {
      return {
        success: false,
        error: "Das Passwort erfüllt nicht die Anforderungen (mindestens 8 Zeichen).",
      };
    }
    if (error.message?.toLowerCase().includes("confirmation email")) {
      return {
        success: false,
        error:
          "Das Konto konnte nicht bestätigt werden: Der Mailversand von Supabase ist fehlgeschlagen. Bitte SMTP in Coolify prüfen.",
      };
    }
    // Log the raw error server-side for debugging, but don't expose it.
    console.error("[signUpAction] Supabase error:", error.message, error.status);
    return { success: false, error: "Registrierung fehlgeschlagen. Bitte versuche es erneut." };
  }

  // Supabase returns user=null when the email is already registered (anti-enumeration).
  // We still show the same success message to avoid leaking account existence,
  // but we only set the role when a fresh user was actually created.
  if (data.user?.id && data.user.identities && data.user.identities.length > 0) {
    // Fresh signup — assign the default guest role.
    const adminClient = createServiceClient(null);
    await adminClient.auth.admin.updateUserById(data.user.id, {
      app_metadata: { role: "guest" },
    });
  }

  // Always return the same message to prevent email enumeration.
  return {
    success: true,
    data: "Fast geschafft: Wenn diese E-Mail noch nicht registriert ist, bekommst du gleich eine Bestätigungs-E-Mail.",
  };
}

/**
 * Sends the Supabase password-reset email.
 */
export async function requestPasswordResetAction(
  input: unknown,
): Promise<ActionResult> {
  const parsed = forgotPasswordSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error:
        parsed.error.issues[0]?.message ??
        "Die E-Mail zum Zurücksetzen ist ungültig.",
    };
  }

  const supabase = await createClient();
  const siteUrl = await getSiteUrl();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${siteUrl}/auth/callback?next=/passwort-zuruecksetzen`,
  });

  if (error) {
    return {
      success: false,
      error:
        "Die E-Mail zum Zurücksetzen konnte nicht gesendet werden.",
    };
  }

  return {
    success: true,
    data: "Wenn die E-Mail bekannt ist, haben wir einen Link zum Zurücksetzen gesendet.",
  };
}

/**
 * Updates the password for the authenticated recovery session.
 */
export async function resetPasswordAction(
  input: unknown,
): Promise<ActionResult> {
  const parsed = resetPasswordSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error:
        parsed.error.issues[0]?.message ??
        "Das neue Passwort ist ungültig.",
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return {
      success: false,
      error:
        "Die Sitzung zum Zurücksetzen ist abgelaufen. Bitte fordere den Link erneut an.",
    };
  }

  const { error } = await supabase.auth.updateUser({
    password: parsed.data.password,
  });

  if (error) {
    return {
      success: false,
      error: "Das Passwort konnte nicht aktualisiert werden.",
    };
  }

  return { success: true, data: "Dein Passwort wurde erfolgreich aktualisiert." };
}

/**
 * Stores a manual recovery request for people who forgot their signup email.
 */
export async function requestEmailReminderAction(
  input: unknown,
): Promise<ActionResult> {
  const parsed = forgotEmailSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error:
        parsed.error.issues[0]?.message ??
        "Die Angaben für die E-Mail-Hilfe sind ungültig.",
    };
  }

  const supabase = createServiceClient();
  const { error } = await supabase.from("email_recovery_requests").insert({
    contact_email: parsed.data.contactEmail,
    remembered_name: parsed.data.rememberedName,
    guessed_email: parsed.data.guessedEmail,
    notes: parsed.data.notes,
  });

  if (error) {
    return {
      success: false,
      error: "Die Anfrage konnte nicht gespeichert werden.",
    };
  }

  return {
    success: true,
    data: "Deine Anfrage wurde gespeichert. Wir melden uns an die angegebene E-Mail-Adresse.",
  };
}
