/**
 * Package credit grants on Stripe billing anniversary (invoice.paid).
 * Catch-up: reconcile missed paid invoices when the user returns.
 * Credits never expire — only spend RPCs reduce the balance.
 */

import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe/client";
import {
  isPaidMembershipPackageId,
  packageIdFromStripePriceId,
  type PaidMembershipPackageId,
} from "@/lib/stripe/config";
import {
  findUserIdByStripeCustomerId,
  getStripeSubscriptionIdForUser,
} from "@/lib/stripe/billing-sync";
import { createServiceClient } from "@/lib/supabase/service";
import { loadMembershipPackages } from "@/lib/users/package-repository";
import { logUserActivity } from "@/lib/users/activity";

const PERIOD_GRANT_REASONS = new Set([
  "subscription_create",
  "subscription_cycle",
]);

function customerIdFrom(
  customer: string | Stripe.Customer | Stripe.DeletedCustomer | null,
): string | null {
  if (!customer) return null;
  if (typeof customer === "string") return customer;
  if ("deleted" in customer && customer.deleted) return null;
  return customer.id;
}

function subscriptionIdFromInvoice(invoice: Stripe.Invoice): string | null {
  const parent = invoice.parent;
  if (parent?.type === "subscription_details") {
    const sub = parent.subscription_details?.subscription;
    if (typeof sub === "string" && sub.length > 0) return sub;
    if (sub && typeof sub === "object" && "id" in sub) return sub.id;
  }
  return null;
}

function packageFromInvoice(
  invoice: Stripe.Invoice,
): PaidMembershipPackageId | null {
  for (const line of invoice.lines?.data ?? []) {
    const meta = line.metadata?.packageId;
    if (typeof meta === "string" && isPaidMembershipPackageId(meta)) {
      return meta;
    }
    const priceId = line.pricing?.price_details?.price;
    if (typeof priceId === "string" && priceId.length > 0) {
      const fromPrice = packageIdFromStripePriceId(priceId);
      if (fromPrice) return fromPrice;
    }
  }
  return null;
}

/**
 * Idempotent grant for one paid subscription invoice (create or cycle).
 * Returns granted amount (0 if skipped / already granted / package has 0 credits).
 */
export async function grantPackageCreditsForPaidInvoice(
  invoice: Stripe.Invoice,
): Promise<{ granted: number; skippedReason?: string }> {
  if (invoice.status !== "paid") {
    return { granted: 0, skippedReason: "not_paid" };
  }

  const billingReason = invoice.billing_reason ?? "";
  if (!PERIOD_GRANT_REASONS.has(billingReason)) {
    return { granted: 0, skippedReason: "billing_reason" };
  }

  const customerId = customerIdFrom(invoice.customer);
  const userId =
    (typeof invoice.metadata?.userId === "string"
      ? invoice.metadata.userId
      : null) ??
    (customerId ? await findUserIdByStripeCustomerId(customerId) : null);

  if (!userId) {
    console.warn("[credits] invoice without user", invoice.id);
    return { granted: 0, skippedReason: "no_user" };
  }

  let packageId = packageFromInvoice(invoice);
  if (!packageId) {
    const subscriptionId = subscriptionIdFromInvoice(invoice);
    if (subscriptionId) {
      try {
        const stripe = getStripe();
        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        const meta = subscription.metadata?.packageId;
        if (typeof meta === "string" && isPaidMembershipPackageId(meta)) {
          packageId = meta;
        } else {
          const priceId = subscription.items.data[0]?.price?.id;
          if (priceId) {
            packageId = packageIdFromStripePriceId(priceId);
          }
        }
      } catch (error) {
        console.warn("[credits] subscription lookup", invoice.id, error);
      }
    }
  }

  if (!packageId) {
    console.warn("[credits] invoice without package", invoice.id);
    return { granted: 0, skippedReason: "no_package" };
  }

  const packages = await loadMembershipPackages();
  const pkg = packages.find((row) => row.id === packageId);
  const amount = pkg?.credits ?? 0;
  if (amount <= 0) {
    return { granted: 0, skippedReason: "zero_package_credits" };
  }

  const periodStart =
    typeof invoice.period_start === "number"
      ? new Date(invoice.period_start * 1000).toISOString()
      : null;
  const periodEnd =
    typeof invoice.period_end === "number"
      ? new Date(invoice.period_end * 1000).toISOString()
      : null;

  const supabase = createServiceClient(null);
  const { data, error } = await supabase.rpc("admin_grant_credits_once", {
    p_user_id: userId,
    p_amount: amount,
    p_reason: "subscription_period",
    p_stripe_invoice_id: invoice.id,
    p_stripe_checkout_session_id: null,
    p_package_id: packageId,
    p_period_start: periodStart,
    p_period_end: periodEnd,
    p_notes: `stripe_invoice:${invoice.id}:${billingReason}`,
  });

  if (error) {
    throw new Error(error.message);
  }

  if (data === null) {
    return { granted: 0, skippedReason: "already_granted" };
  }

  await logUserActivity({
    userId,
    action: "billing.credits_period_granted",
    label: String(amount),
    metadata: {
      invoiceId: invoice.id,
      packageId,
      amount,
      billingReason,
      periodStart,
      periodEnd,
    },
  });

  return { granted: amount };
}

/**
 * Catch-up: grant any paid subscription invoices not yet in the ledger.
 * Covers months where the user did not open the app (webhooks missed / delayed).
 *
 * `subscription_create` invoices older than 7 days are skipped so legacy
 * one-shot Checkout grants are not double-credited after the ledger rollout.
 */
export async function reconcileSubscriptionCreditGrants(
  userId: string,
): Promise<{ invoicesChecked: number; creditsGranted: number }> {
  const subscriptionId = await getStripeSubscriptionIdForUser(userId);
  if (!subscriptionId) {
    return { invoicesChecked: 0, creditsGranted: 0 };
  }

  const stripe = getStripe();
  const invoices = await stripe.invoices.list({
    subscription: subscriptionId,
    status: "paid",
    limit: 36,
  });

  const createCutoffMs = Date.now() - 7 * 24 * 60 * 60 * 1000;
  let creditsGranted = 0;
  for (const invoice of invoices.data) {
    if (
      invoice.billing_reason === "subscription_create" &&
      invoice.created * 1000 < createCutoffMs
    ) {
      continue;
    }
    const result = await grantPackageCreditsForPaidInvoice(invoice);
    creditsGranted += result.granted;
  }

  return {
    invoicesChecked: invoices.data.length,
    creditsGranted,
  };
}

/**
 * One-time credits pack (Checkout payment) with idempotency on session id.
 */
export async function grantCreditsPackOnce(input: {
  userId: string;
  amount: number;
  checkoutSessionId: string;
}): Promise<{ granted: number; balance: number | null }> {
  if (!Number.isInteger(input.amount) || input.amount <= 0) {
    throw new Error("Credit-Betrag ungültig.");
  }

  const supabase = createServiceClient(null);
  const { data, error } = await supabase.rpc("admin_grant_credits_once", {
    p_user_id: input.userId,
    p_amount: input.amount,
    p_reason: "credits_pack",
    p_stripe_invoice_id: null,
    p_stripe_checkout_session_id: input.checkoutSessionId,
    p_package_id: null,
    p_period_start: null,
    p_period_end: null,
    p_notes: `stripe_checkout:${input.checkoutSessionId}`,
  });

  if (error) {
    throw new Error(error.message);
  }

  if (data === null) {
    return { granted: 0, balance: null };
  }

  return {
    granted: input.amount,
    balance: typeof data === "number" ? data : null,
  };
}
