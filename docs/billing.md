# Abrechnung & Credits

Product rules for Leseno membership billing. Implementation: Stripe subscriptions + `invoice.paid` grants (`src/lib/stripe/credit-grants.ts`, `src/lib/stripe/webhooks.ts`). Ledger: `leseno.credit_grants`.

## Rules

1. **Anniversary day**  
   Stripe bills on the day-of-month the subscription started (e.g. booked on the 4th → next charge and credit grant on the 4th of each following month). Leseno does not invent a separate calendar; it follows Stripe’s billing period.

2. **Monthly package credits**  
   When a subscription invoice is paid (`billing_reason` = `subscription_create` or `subscription_cycle`), the package’s catalog credit amount is added once per invoice (idempotent via `stripe_invoice_id`).

3. **Credits never expire**  
   Unused credits stay on `user_profiles.credits` forever. There is no monthly reset. New monthly grants **stack** on the remaining balance.

4. **Catch-up after inactivity**  
   Stripe still charges while the subscription is active, even if the family does not open the app. Each paid period invoice grants credits via webhook. If a webhook was missed, `reconcileSubscriptionCreditGrants` (success page / signed-in Preise) backfills from paid Stripe invoices.

5. **Cancellation**  
   Cancel at **period end** (Stripe Customer Portal). Access and features stay until the anniversary; demotion to Basis happens on `customer.subscription.deleted` / canceled status — not when the user only sets `cancel_at_period_end`.

6. **One-time Credits pack**  
   Separate Checkout payment; granted once per Checkout session id (also in the ledger).

## Operator checklist

- Webhook events must include **`invoice.paid`** (plus existing Checkout / subscription events).
- Portal: cancel at end of billing period (Stripe default for subscriptions).
- Apply migration `20260906160000_credit_grants_billing.sql`.

See also [stripe.md](stripe.md).
