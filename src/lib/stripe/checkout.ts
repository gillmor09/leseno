/**
 * Creates Stripe Checkout sessions (subscription packages + credits pack).
 * PayPal is offered alongside cards when enabled in the Stripe Dashboard.
 */

import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe/client";
import { getSiteUrl } from "@/lib/site-url";
import {
  STRIPE_CREDITS_PACK_AMOUNT,
  getStripeCreditsPriceId,
  getStripePriceIdForPackage,
  type PaidMembershipPackageId,
} from "@/lib/stripe/config";
import {
  getStripeCustomerIdForUser,
  saveStripeCustomerId,
} from "@/lib/stripe/billing-sync";

/** Card + PayPal (enable PayPal under Stripe → Payment methods). */
const CHECKOUT_PAYMENT_METHOD_TYPES: Stripe.Checkout.SessionCreateParams.PaymentMethodType[] =
  ["card", "paypal"];

const CHECKOUT_CARD_ONLY: Stripe.Checkout.SessionCreateParams.PaymentMethodType[] =
  ["card"];

async function createCheckoutSession(
  params: Stripe.Checkout.SessionCreateParams,
): Promise<Stripe.Checkout.Session> {
  const stripe = getStripe();
  try {
    return await stripe.checkout.sessions.create({
      ...params,
      payment_method_types: CHECKOUT_PAYMENT_METHOD_TYPES,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    // PayPal not activated in Dashboard yet → still allow card checkout.
    if (/paypal/i.test(message) || /payment_method_types/i.test(message)) {
      console.warn(
        "[stripe] PayPal Checkout unavailable, falling back to card:",
        message,
      );
      return stripe.checkout.sessions.create({
        ...params,
        payment_method_types: CHECKOUT_CARD_ONLY,
      });
    }
    throw error;
  }
}

async function ensureStripeCustomer(input: {
  userId: string;
  email: string;
}): Promise<string> {
  const existing = await getStripeCustomerIdForUser(input.userId);
  if (existing) {
    return existing;
  }

  const stripe = getStripe();
  const customer = await stripe.customers.create({
    email: input.email,
    metadata: { userId: input.userId },
  });
  await saveStripeCustomerId(input.userId, customer.id);
  return customer.id;
}

/**
 * Monthly package Checkout (Plus / Pro / Ultimate).
 * Returns the hosted Checkout URL.
 */
export async function createMembershipCheckoutUrl(input: {
  userId: string;
  email: string;
  packageId: PaidMembershipPackageId;
}): Promise<string> {
  const priceId = getStripePriceIdForPackage(input.packageId);
  if (!priceId) {
    throw new Error(`Stripe-Preis für ${input.packageId} fehlt (Env).`);
  }

  const siteUrl = await getSiteUrl();
  const customerId = await ensureStripeCustomer({
    userId: input.userId,
    email: input.email,
  });

  const session = await createCheckoutSession({
    mode: "subscription",
    customer: customerId,
    client_reference_id: input.userId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${siteUrl}/preise/erfolg?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${siteUrl}/preise?checkout=abgebrochen`,
    allow_promotion_codes: true,
    metadata: {
      kind: "membership",
      userId: input.userId,
      packageId: input.packageId,
    },
    subscription_data: {
      metadata: {
        userId: input.userId,
        packageId: input.packageId,
      },
    },
  });

  if (!session.url) {
    throw new Error("Stripe Checkout-URL fehlt.");
  }
  return session.url;
}

/** One-time credits pack Checkout. */
export async function createCreditsCheckoutUrl(input: {
  userId: string;
  email: string;
  credits?: number;
}): Promise<string> {
  const priceId = getStripeCreditsPriceId();
  if (!priceId) {
    throw new Error("STRIPE_PRICE_CREDITS fehlt.");
  }

  const credits = input.credits ?? STRIPE_CREDITS_PACK_AMOUNT;
  const siteUrl = await getSiteUrl();
  const customerId = await ensureStripeCustomer({
    userId: input.userId,
    email: input.email,
  });

  const session = await createCheckoutSession({
    mode: "payment",
    customer: customerId,
    client_reference_id: input.userId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${siteUrl}/preise/erfolg?credits=1&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${siteUrl}/preise?checkout=abgebrochen`,
    allow_promotion_codes: true,
    metadata: {
      kind: "credits",
      userId: input.userId,
      credits: String(credits),
    },
  });

  if (!session.url) {
    throw new Error("Stripe Checkout-URL fehlt.");
  }
  return session.url;
}

/** Stripe Customer Portal (cancel / payment method). */
export async function createBillingPortalUrl(input: {
  userId: string;
  email: string;
}): Promise<string> {
  const stripe = getStripe();
  const siteUrl = await getSiteUrl();
  const customerId = await ensureStripeCustomer({
    userId: input.userId,
    email: input.email,
  });

  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${siteUrl}/preise`,
  });
  return session.url;
}
