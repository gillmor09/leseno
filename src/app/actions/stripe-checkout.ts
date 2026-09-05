"use server";

import { getCurrentUser } from "@/lib/auth/session";
import {
  createBillingPortalUrl,
  createCreditsCheckoutUrl,
  createMembershipCheckoutUrl,
} from "@/lib/stripe/checkout";
import {
  hasStripeCheckoutConfig,
  isPaidMembershipPackageId,
} from "@/lib/stripe/config";
import { getStripeSubscriptionIdForUser } from "@/lib/stripe/billing-sync";
import type { ActionResult } from "@/lib/types/actions";
import { getSiteUrl } from "@/lib/site-url";

/**
 * Starts Stripe Checkout for Plus / Pro / Ultimate (card + PayPal).
 * Unauthenticated users get a login redirect URL.
 * Users with an active subscription are sent to the Customer Portal instead.
 */
export async function startMembershipCheckoutAction(
  packageId: string,
): Promise<ActionResult<{ url: string }>> {
  if (!isPaidMembershipPackageId(packageId)) {
    return { success: false, error: "Unbekanntes Paket." };
  }
  if (!hasStripeCheckoutConfig()) {
    return {
      success: false,
      error:
        "Zahlungen sind noch nicht konfiguriert. Bitte Stripe-Env setzen (siehe docs/stripe.md).",
    };
  }

  const user = await getCurrentUser();
  if (!user?.email) {
    const siteUrl = await getSiteUrl();
    return {
      success: true,
      data: {
        url: `${siteUrl}/anmelden?next=${encodeURIComponent("/preise")}`,
      },
    };
  }

  try {
    const existingSub = await getStripeSubscriptionIdForUser(user.id);
    if (existingSub) {
      const url = await createBillingPortalUrl({
        userId: user.id,
        email: user.email,
      });
      return { success: true, data: { url } };
    }

    const url = await createMembershipCheckoutUrl({
      userId: user.id,
      email: user.email,
      packageId,
    });
    return { success: true, data: { url } };
  } catch (error) {
    console.error("[startMembershipCheckoutAction]", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Checkout konnte nicht gestartet werden.",
    };
  }
}

/** Starts Checkout for the 300-Credits top-up pack. */
export async function startCreditsCheckoutAction(): Promise<
  ActionResult<{ url: string }>
> {
  if (!hasStripeCheckoutConfig()) {
    return {
      success: false,
      error:
        "Zahlungen sind noch nicht konfiguriert. Bitte Stripe-Env setzen (siehe docs/stripe.md).",
    };
  }

  const user = await getCurrentUser();
  if (!user?.email) {
    const siteUrl = await getSiteUrl();
    return {
      success: true,
      data: {
        url: `${siteUrl}/anmelden?next=${encodeURIComponent("/preise")}`,
      },
    };
  }

  try {
    const url = await createCreditsCheckoutUrl({
      userId: user.id,
      email: user.email,
    });
    return { success: true, data: { url } };
  } catch (error) {
    console.error("[startCreditsCheckoutAction]", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Checkout konnte nicht gestartet werden.",
    };
  }
}

/** Opens Stripe Customer Portal to manage / cancel the subscription. */
export async function startBillingPortalAction(): Promise<
  ActionResult<{ url: string }>
> {
  if (!hasStripeCheckoutConfig()) {
    return {
      success: false,
      error: "Zahlungen sind noch nicht konfiguriert.",
    };
  }

  const user = await getCurrentUser();
  if (!user?.email) {
    const siteUrl = await getSiteUrl();
    return {
      success: true,
      data: {
        url: `${siteUrl}/anmelden?next=${encodeURIComponent("/preise")}`,
      },
    };
  }

  try {
    const url = await createBillingPortalUrl({
      userId: user.id,
      email: user.email,
    });
    return { success: true, data: { url } };
  } catch (error) {
    console.error("[startBillingPortalAction]", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Kundenportal konnte nicht geöffnet werden.",
    };
  }
}
