/**
 * Server-only Stripe SDK client.
 */

import Stripe from "stripe";
import { getStripeSecretKey } from "@/lib/stripe/config";

let stripeClient: Stripe | null = null;

export function getStripe(): Stripe {
  if (!stripeClient) {
    stripeClient = new Stripe(getStripeSecretKey(), {
      apiVersion: "2026-08-26.dahlia",
      typescript: true,
    });
  }
  return stripeClient;
}
