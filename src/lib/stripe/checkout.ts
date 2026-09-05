/**
 * Creates Stripe Checkout sessions (subscription packages + credits pack).
 * German locale; card + SEPA + PayPal when enabled in the Stripe Dashboard.
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

type PaymentMethodType =
  Stripe.Checkout.SessionCreateParams.PaymentMethodType;

/** Progressive fallbacks if a method is not activated on the Stripe account. */
const CHECKOUT_PAYMENT_METHOD_FALLBACKS: PaymentMethodType[][] = [
  ["card", "sepa_debit", "paypal"],
  ["card", "sepa_debit"],
  ["card", "paypal"],
  ["card"],
];

async function createCheckoutSession(
  params: Stripe.Checkout.SessionCreateParams,
): Promise<Stripe.Checkout.Session> {
  const stripe = getStripe();
  const base: Stripe.Checkout.SessionCreateParams = {
    ...params,
    locale: "de",
  };

  let lastError: unknown;
  for (const methods of CHECKOUT_PAYMENT_METHOD_FALLBACKS) {
    try {
      return await stripe.checkout.sessions.create({
        ...base,
        payment_method_types: methods,
      });
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      console.warn(
        `[stripe] Checkout with [${methods.join(", ")}] failed:`,
        message,
      );
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Stripe Checkout konnte nicht erstellt werden.");
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
    preferred_locales: ["de"],
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
    billing_address_collection: "auto",
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
    billing_address_collection: "auto",
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
    locale: "de",
  });
  return session.url;
}
