"use server";

import { createServiceClient } from "@/lib/supabase/service";
import { createClient } from "@/lib/supabase/server";
import { buildAuthConfirmationUrl } from "@/lib/auth/email-templates";
import {
  getAuthEmailSiteUrl,
} from "@/lib/site-url";
import { assertBotGuard } from "@/lib/security/bot-guard";
import type { ActionResult } from "@/lib/types/actions";
import {
  forgotPasswordSchema,
  resetPasswordSchema,
  signInSchema,
  signUpSchema,
  unifiedSignInSchema,
} from "@/lib/validations/auth";

/**
 * Prefer a confirm URL we control (`/auth/callback?token_hash=…`).
 * Never email GoTrue `/auth/v1/verify` — it confirms the user but returns
 * without a PKCE code, so our callback looked like a failure.
 */
function tokenHashFromGenerateLink(
  hashedToken: string | undefined,
  actionLink: string | undefined,
): string {
  const direct = hashedToken?.trim() ?? "";
  if (direct) return direct;
  const link = actionLink?.trim() ?? "";
  if (!link) return "";
  try {
    const parsed = new URL(link);
    return (
      parsed.searchParams.get("token")?.trim() ||
      parsed.searchParams.get("token_hash")?.trim() ||
      ""
    );
  } catch {
    return "";
  }
}

function confirmationUrlFromGenerateLink(input: {
  actionLink: string | undefined;
  hashedToken: string | undefined;
  emailActionType: string;
  redirectTo: string;
  siteUrl: string;
}): string {
  const tokenHash = tokenHashFromGenerateLink(
    input.hashedToken,
    input.actionLink,
  );
  if (!tokenHash) {
    console.error("[auth] generateLink missing hashed_token / action_link token");
    return "";
  }
  return buildAuthConfirmationUrl({
    siteUrl: input.siteUrl,
    tokenHash,
    emailActionType: input.emailActionType,
  });
}

/**
 * Starts an email/password session using Supabase Auth.
 */
export async function signInAction(input: unknown): Promise<ActionResult> {
  const botError = await assertBotGuard(input, {
    action: "sign-in",
    minFillMs: 1200,
    maxRequests: 12,
    windowMs: 15 * 60 * 1000,
  });
  if (botError) {
    return { success: false, error: botError };
  }

  const parsed = signInSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Die Anmeldung ist ungültig.",
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) {
    return { success: false, error: "Anmeldung fehlgeschlagen. Bitte prüfe E-Mail und Passwort." };
  }

  const { clearChildSessionCookie } = await import("@/lib/auth/child-session");
  await clearChildSessionCookie();

  const { logUserActivity } = await import("@/lib/users/activity");
  await logUserActivity({
    action: "auth.sign_in",
    label: "Anmeldung",
    path: "/anmelden",
    userId: data.user?.id ?? null,
    metadata: { email: parsed.data.email },
  });

  return { success: true };
}

/**
 * Single login entry: E-Mail → Eltern (Supabase Auth), Kennung → Kind (cookie).
 * Detected by whether the identifier contains `@`. No registration/invite side effects.
 */
export async function unifiedSignInAction(
  input: unknown,
): Promise<ActionResult<{ kind: "parent" | "child" }>> {
  const botError = await assertBotGuard(input, {
    action: "sign-in",
    minFillMs: 1200,
    maxRequests: 12,
    windowMs: 15 * 60 * 1000,
  });
  if (botError) {
    return { success: false, error: botError };
  }

  const parsed = unifiedSignInSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Die Anmeldung ist ungültig.",
    };
  }

  const { identifier, password } = parsed.data;
  const looksLikeEmail = identifier.includes("@");

  if (looksLikeEmail) {
    const emailParsed = signInSchema.safeParse({
      email: identifier,
      password,
    });
    if (!emailParsed.success) {
      return {
        success: false,
        error:
          emailParsed.error.issues[0]?.message ??
          "Anmeldung fehlgeschlagen. Bitte prüfe deine Angaben.",
      };
    }

    const supabase = await createClient();
    const { data, error } = await supabase.auth.signInWithPassword(
      emailParsed.data,
    );
    if (error) {
      return {
        success: false,
        error: "Anmeldung fehlgeschlagen. Bitte prüfe deine Angaben.",
      };
    }

    const { clearChildSessionCookie } = await import("@/lib/auth/child-session");
    await clearChildSessionCookie();

    const { logUserActivity } = await import("@/lib/users/activity");
    await logUserActivity({
      action: "auth.sign_in",
      label: "Anmeldung",
      path: "/anmelden",
      userId: data.user?.id ?? null,
      metadata: { email: emailParsed.data.email, kind: "parent" },
    });

    return { success: true, data: { kind: "parent" } };
  }

  const { childSignInSchema } = await import("@/lib/validations/user-world");
  const childParsed = childSignInSchema.safeParse({
    loginCode: identifier,
    password,
  });
  if (!childParsed.success) {
    return {
      success: false,
      error:
        childParsed.error.issues[0]?.message ??
        "Anmeldung fehlgeschlagen. Bitte prüfe deine Angaben.",
    };
  }

  try {
    const { lookupChildLoginByCode } = await import("@/lib/world/repository");
    const { verifyPassword } = await import("@/lib/security/pin");
    const { setChildSessionCookie } = await import("@/lib/auth/child-session");

    const supabase = await createClient();
    await supabase.auth.signOut();

    const row = await lookupChildLoginByCode(childParsed.data.loginCode);
    if (!row || !verifyPassword(childParsed.data.password, row.passwordHash)) {
      return {
        success: false,
        error: "Anmeldung fehlgeschlagen. Bitte prüfe deine Angaben.",
      };
    }

    await setChildSessionCookie({
      parentUserId: row.parentUserId,
      profileId: row.profileId,
      displayName: row.displayName || "Kind",
      loginCode: row.loginCode,
    });

    return { success: true, data: { kind: "child" } };
  } catch (error) {
    console.error("[unifiedSignInAction] child", error);
    return {
      success: false,
      error: "Anmeldung hat nicht geklappt. Bitte später erneut versuchen.",
    };
  }
}

/**
 * Creates a new Auth user, grants Basis entitlements, and sends our register template via SMTP.
 * Does not use Supabase built-in mail (avoids default templates when the Send Email hook is off).
 */
export async function signUpAction(input: unknown): Promise<ActionResult> {
  const botError = await assertBotGuard(input, {
    action: "sign-up",
    minFillMs: 2000,
    maxRequests: 6,
    windowMs: 15 * 60 * 1000,
  });
  if (botError) {
    return { success: false, error: botError };
  }

  const parsed = signUpSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Die Registrierung ist ungültig.",
    };
  }

  const siteUrl = getAuthEmailSiteUrl();
  const { email, password, referralCode, promoCode } = parsed.data;
  const redirectTo = `${siteUrl}/auth/callback?next=/anmelden`;
  const adminClient = createServiceClient(null);

  const { data: linkData, error: linkError } =
    await adminClient.auth.admin.generateLink({
      type: "signup",
      email,
      password,
      options: { redirectTo },
    });

  if (linkError || !linkData?.user?.id) {
    const message = (linkError?.message ?? "").toLowerCase();
    if (
      message.includes("already") ||
      message.includes("registered") ||
      message.includes("exists") ||
      linkError?.status === 422
    ) {
      // Anti-enumeration: same success copy as a fresh signup.
      return {
        success: true,
        data: "Fast geschafft: Wenn diese E-Mail noch nicht registriert ist, bekommst du gleich eine Bestätigungs-E-Mail.",
      };
    }
    if (message.includes("password")) {
      return {
        success: false,
        error:
          "Das Passwort erfüllt nicht die Anforderungen (mindestens 8 Zeichen).",
      };
    }
    console.error(
      "[signUpAction] generateLink",
      linkError?.message,
      linkError?.status,
    );
    return {
      success: false,
      error: "Registrierung fehlgeschlagen. Bitte versuche es erneut.",
    };
  }

  const userId = linkData.user.id;
  const confirmationUrl = confirmationUrlFromGenerateLink({
    actionLink: linkData.properties?.action_link,
    hashedToken: linkData.properties?.hashed_token,
    emailActionType: "signup",
    redirectTo,
    siteUrl,
  });

  await adminClient.auth.admin.updateUserById(userId, {
    app_metadata: { role: "basis" },
  });

  try {
    const { startPackageBooking } = await import("@/lib/users/billing");
    await startPackageBooking({
      userId,
      packageId: "basis",
      monthlyPrice: 0,
      actualPrice: 0,
      notes: "Registrierung",
    });
  } catch (bookingError) {
    console.error("[signUpAction] basis booking", bookingError);
  }

  try {
    const { loadMembershipPackages } = await import(
      "@/lib/users/package-repository"
    );
    const { addUserCredits } = await import("@/lib/stripe/billing-sync");
    const packages = await loadMembershipPackages();
    const basisCredits =
      packages.find((pkg) => pkg.id === "basis")?.credits ?? 0;
    if (basisCredits > 0) {
      await addUserCredits(userId, basisCredits);
    }
  } catch (creditsError) {
    console.error("[signUpAction] basis credits", creditsError);
  }

  if (!confirmationUrl) {
    console.error("[signUpAction] missing action_link");
    return {
      success: false,
      error:
        "Konto wurde angelegt, aber der Bestätigungslink fehlt. Bitte Support kontaktieren.",
    };
  }

  try {
    const { sendTemplatedAuthEmail } = await import(
      "@/lib/auth/send-templated-email"
    );
    await sendTemplatedAuthEmail({
      templateId: "register",
      values: {
        email,
        confirmation_url: confirmationUrl,
        token: "",
        site_url: siteUrl,
        redirect_to: redirectTo,
      },
    });
  } catch (emailError) {
    console.error("[signUpAction] register email", emailError);
    const detail =
      emailError instanceof Error ? emailError.message : String(emailError);
    return {
      success: false,
      error: `Konto wurde angelegt, aber die Bestätigungs-E-Mail konnte nicht gesendet werden (${detail}). Bitte SMTP_* in Coolify und Template unter Admin → E-Mails prüfen.`,
    };
  }

  const { logUserActivity } = await import("@/lib/users/activity");
  await logUserActivity({
    action: "auth.sign_up",
    label: "Registrierung",
    path: "/registrieren",
    userId,
    metadata: {
      email,
      ...(referralCode ? { referralCode } : {}),
      ...(promoCode ? { promoCode } : {}),
    },
  });

  if (promoCode) {
    try {
      const { getPromoByCode, setUserPromoPending } = await import(
        "@/lib/promo/repository"
      );
      const promo = await getPromoByCode(promoCode);
      if (promo?.active) {
        await setUserPromoPending(userId, promo.code);
      }
    } catch (error) {
      console.warn("[signUpAction] promo pending", error);
    }
  }

  return {
    success: true,
    data: "Fast geschafft: Wenn diese E-Mail noch nicht registriert ist, bekommst du gleich eine Bestätigungs-E-Mail.",
  };
}

/**
 * Sends a password-reset mail using our forget template (SMTP), not Supabase built-in mail.
 */
export async function requestPasswordResetAction(
  input: unknown,
): Promise<ActionResult> {
  const botError = await assertBotGuard(input, {
    action: "password-reset",
    minFillMs: 1500,
    maxRequests: 5,
    windowMs: 15 * 60 * 1000,
  });
  if (botError) {
    return { success: false, error: botError };
  }

  const parsed = forgotPasswordSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error:
        parsed.error.issues[0]?.message ??
        "Die E-Mail zum Zurücksetzen ist ungültig.",
    };
  }

  const siteUrl = getAuthEmailSiteUrl();
  const redirectTo = `${siteUrl}/auth/callback?next=/passwort-zuruecksetzen`;
  const email = parsed.data.email;
  const adminClient = createServiceClient(null);

  const { data: linkData, error: linkError } =
    await adminClient.auth.admin.generateLink({
      type: "recovery",
      email,
      options: { redirectTo },
    });

  // Anti-enumeration: unknown emails look like success.
  if (linkError || !linkData?.properties?.action_link) {
    if (linkError) {
      console.warn("[requestPasswordResetAction]", linkError.message);
    }
    return {
      success: true,
      data: "Wenn die E-Mail bekannt ist, haben wir einen Link zum Zurücksetzen gesendet.",
    };
  }

  try {
    const { sendTemplatedAuthEmail } = await import(
      "@/lib/auth/send-templated-email"
    );
    await sendTemplatedAuthEmail({
      templateId: "forget",
      values: {
        email,
        confirmation_url: confirmationUrlFromGenerateLink({
          actionLink: linkData.properties.action_link,
          hashedToken: linkData.properties.hashed_token,
          emailActionType: "recovery",
          redirectTo,
          siteUrl,
        }),
        token: "",
        site_url: siteUrl,
        redirect_to: redirectTo,
      },
    });
  } catch (emailError) {
    console.error("[requestPasswordResetAction] email", emailError);
    return {
      success: false,
      error:
        "Die E-Mail zum Zurücksetzen konnte nicht gesendet werden. Bitte SMTP und Template prüfen.",
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
  const botError = await assertBotGuard(input, {
    action: "password-update",
    minFillMs: 1500,
    maxRequests: 8,
    windowMs: 15 * 60 * 1000,
  });
  if (botError) {
    return { success: false, error: botError };
  }

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
 * Ends the current Auth session and clears cookies.
 */
export async function signOutAction(): Promise<ActionResult> {
  const { clearChildSessionCookie } = await import("@/lib/auth/child-session");
  await clearChildSessionCookie();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase.auth.signOut();

  if (error) {
    return { success: false, error: "Abmelden hat nicht geklappt." };
  }

  if (user?.id) {
    const { logUserActivity } = await import("@/lib/users/activity");
    await logUserActivity({
      action: "auth.sign_out",
      label: "Abmeldung",
      userId: user.id,
    });
  }

  return { success: true };
}

/**
 * Child login via Kennung + password (cookie session, no Supabase Auth user).
 * Does not trigger registration or invites.
 */
export async function childSignInAction(
  input: unknown,
): Promise<ActionResult> {
  const botError = await assertBotGuard(input, {
    action: "child-sign-in",
    minFillMs: 1200,
    maxRequests: 12,
    windowMs: 15 * 60 * 1000,
  });
  if (botError) {
    return { success: false, error: botError };
  }

  const { childSignInSchema } = await import("@/lib/validations/user-world");
  const parsed = childSignInSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Anmeldung ungültig.",
    };
  }

  try {
    const { lookupChildLoginByCode } = await import("@/lib/world/repository");
    const { verifyPassword } = await import("@/lib/security/pin");
    const { setChildSessionCookie } = await import("@/lib/auth/child-session");

    // Clear any parent Auth session so identities don't mix.
    const supabase = await createClient();
    await supabase.auth.signOut();

    const row = await lookupChildLoginByCode(parsed.data.loginCode);
    if (!row || !verifyPassword(parsed.data.password, row.passwordHash)) {
      return {
        success: false,
        error: "Kennung oder Passwort stimmt nicht.",
      };
    }

    await setChildSessionCookie({
      parentUserId: row.parentUserId,
      profileId: row.profileId,
      displayName: row.displayName || "Kind",
      loginCode: row.loginCode,
    });

    return { success: true };
  } catch (error) {
    console.error("[childSignInAction]", error);
    return {
      success: false,
      error: "Anmeldung hat nicht geklappt. Bitte später erneut versuchen.",
    };
  }
}

