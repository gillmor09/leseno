/**
 * Stripe webhook event handlers: Checkout completed, subscription lifecycle.
 */

import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe/client";
import {
  STRIPE_CREDITS_PACK_AMOUNT,
  getStripeCreditsPriceId,
  isPaidMembershipPackageId,
  packageIdFromStripePriceId,
  type PaidMembershipPackageId,
} from "@/lib/stripe/config";
import {
  activatePaidMembership,
  addUserCredits,
  claimStripeWebhookEvent,
  deactivatePaidMembership,
  findUserIdByStripeCustomerId,
  saveStripeCustomerId,
  syncPaidMembership,
} from "@/lib/stripe/billing-sync";
import { logUserActivity } from "@/lib/users/activity";

function customerIdFrom(
  customer: string | Stripe.Customer | Stripe.DeletedCustomer | null,
): string | null {
  if (!customer) return null;
  if (typeof customer === "string") return customer;
  if ("deleted" in customer && customer.deleted) return null;
  return customer.id;
}

function packageFromSubscription(
  subscription: Stripe.Subscription,
): PaidMembershipPackageId | null {
  const meta = subscription.metadata?.packageId;
  if (typeof meta === "string" && isPaidMembershipPackageId(meta)) {
    return meta;
  }
  const priceId = subscription.items.data[0]?.price?.id;
  if (!priceId) return null;
  return packageIdFromStripePriceId(priceId);
}

async function resolveUserId(input: {
  metadataUserId?: string | null;
  customerId: string | null;
}): Promise<string | null> {
  if (input.metadataUserId) {
    return input.metadataUserId;
  }
  if (input.customerId) {
    return findUserIdByStripeCustomerId(input.customerId);
  }
  return null;
}

async function handleCheckoutSessionCompleted(
  session: Stripe.Checkout.Session,
): Promise<void> {
  const userId = session.metadata?.userId ?? session.client_reference_id;
  const customerId = customerIdFrom(session.customer);
  if (!userId || typeof userId !== "string") {
    console.warn("[stripe] checkout without userId", session.id);
    return;
  }
  if (customerId) {
    await saveStripeCustomerId(userId, customerId);
  }

  const kind = session.metadata?.kind ?? "";

  if (kind === "credits" || session.mode === "payment") {
    const creditsRaw = session.metadata?.credits;
    const credits =
      creditsRaw && Number.isFinite(Number(creditsRaw))
        ? Math.max(0, Math.floor(Number(creditsRaw)))
        : STRIPE_CREDITS_PACK_AMOUNT;

    if (credits > 0) {
      await addUserCredits(userId, credits);
      await logUserActivity({
        userId,
        action: "billing.credits_purchased",
        label: String(credits),
        metadata: {
          sessionId: session.id,
          credits,
        },
      });
    }
    return;
  }

  if (session.mode === "subscription") {
    const packageIdRaw = session.metadata?.packageId;
    if (
      !packageIdRaw ||
      !isPaidMembershipPackageId(packageIdRaw) ||
      !customerId
    ) {
      console.warn("[stripe] subscription checkout incomplete metadata", session.id);
      return;
    }

    const subscriptionId =
      typeof session.subscription === "string"
        ? session.subscription
        : session.subscription?.id;
    if (!subscriptionId) {
      console.warn("[stripe] checkout missing subscription", session.id);
      return;
    }

    // Grant included package credits only on the initial Checkout completion.
    await activatePaidMembership({
      userId,
      packageId: packageIdRaw,
      customerId,
      subscriptionId,
      grantPackageCredits: true,
      notes: `stripe_checkout:${session.id}`,
    });
  }
}

async function handleSubscriptionUpdated(
  subscription: Stripe.Subscription,
): Promise<void> {
  const customerId = customerIdFrom(subscription.customer);
  const userId = await resolveUserId({
    metadataUserId: subscription.metadata?.userId,
    customerId,
  });
  if (!userId || !customerId) {
    console.warn("[stripe] subscription.updated without user", subscription.id);
    return;
  }

  const status = subscription.status;
  const packageId = packageFromSubscription(subscription);

  if (
    status === "active" ||
    status === "trialing" ||
    status === "past_due"
  ) {
    if (!packageId) {
      console.warn("[stripe] subscription without package", subscription.id);
      return;
    }
    // Renewals / plan changes: keep role in sync; do not re-grant package credits.
    await syncPaidMembership({
      userId,
      packageId,
      customerId,
      subscriptionId: subscription.id,
      notes: `stripe_sub:${subscription.id}:${status}`,
    });
    return;
  }

  if (
    status === "canceled" ||
    status === "unpaid" ||
    status === "incomplete_expired"
  ) {
    await deactivatePaidMembership({
      userId,
      subscriptionId: subscription.id,
    });
  }
}

async function handleSubscriptionDeleted(
  subscription: Stripe.Subscription,
): Promise<void> {
  const customerId = customerIdFrom(subscription.customer);
  const userId = await resolveUserId({
    metadataUserId: subscription.metadata?.userId,
    customerId,
  });
  if (!userId) {
    console.warn("[stripe] subscription.deleted without user", subscription.id);
    return;
  }
  await deactivatePaidMembership({
    userId,
    subscriptionId: subscription.id,
  });
}

/**
 * Verifies signature and processes one Stripe event. Idempotent via event id.
 */
export async function processStripeWebhookEvent(
  rawBody: string,
  signature: string,
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const stripe = getStripe();
  let event: Stripe.Event;
  try {
    const { getStripeWebhookSecret } = await import("@/lib/stripe/config");
    event = stripe.webhooks.constructEvent(
      rawBody,
      signature,
      getStripeWebhookSecret(),
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Ungültige Webhook-Signatur.";
    return { ok: false, error: message, status: 400 };
  }

  let claimed = true;
  try {
    claimed = await claimStripeWebhookEvent(event.id, event.type);
  } catch (error) {
    // Table missing → still process once (dev before migration).
    console.warn("[stripe] claim event", error);
  }
  if (!claimed) {
    return { ok: true };
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutSessionCompleted(
          event.data.object as Stripe.Checkout.Session,
        );
        break;
      case "customer.subscription.updated":
        await handleSubscriptionUpdated(
          event.data.object as Stripe.Subscription,
        );
        break;
      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(
          event.data.object as Stripe.Subscription,
        );
        break;
      default:
        break;
    }
  } catch (error) {
    console.error("[stripe] webhook handler", event.type, error);
    // Allow Stripe retry: remove claim so the next delivery can re-run.
    try {
      const { releaseStripeWebhookEvent } = await import(
        "@/lib/stripe/billing-sync"
      );
      await releaseStripeWebhookEvent(event.id);
    } catch {
      /* ignore */
    }
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Webhook-Verarbeitung fehlgeschlagen.",
      status: 500,
    };
  }

  return { ok: true };
}

/** Ensure credits price still matches configured env (sanity for operators). */
export function assertCreditsPriceConfigured(): void {
  if (!getStripeCreditsPriceId()) {
    throw new Error("STRIPE_PRICE_CREDITS fehlt.");
  }
}
