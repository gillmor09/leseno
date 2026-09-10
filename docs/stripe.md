# Stripe Checkout (Abos + Credits + PayPal)

Leseno uses **Stripe Checkout** + **Billing** for Plus / Familie / Komplett subscriptions and the one-time Credits pack. PayPal is requested alongside card; enable it in the Stripe Dashboard.

Product rules (anniversary day, never-expire credits, catch-up): **[docs/billing.md](billing.md)**.

Internal package ids stay `plus` / `pro` / `ultimate` (roles `paket1`–`paket3`). Display labels: **Plus**, **Familie**, **Komplett**.

## 1. Stripe Dashboard

1. Create Products (recurring monthly EUR):
   - Plus → 4,00 € / Monat — Product id: `prod_VEbCNCsnsFTjv8`
   - Familie (`pro`) → 9,00 € / Monat  
   - Komplett (`ultimate`) → 14,00 € / Monat  
2. Create Product (one-time EUR): Credits → 5,00 € (300 Credits).  
3. Copy each **Price id** (`price_…`) — Checkout uses Price ids, not Product ids.  
4. **Payment methods** (Einstellungen → Zahlungsmethoden): **Karten**, **SEPA-Lastschrift** und **PayPal** aktivieren. PayPal ggf. mit PayPal-Konto verknüpfen. Preise müssen in **EUR** sein (sonst kein SEPA).  
5. **Customer Portal:** activate (cancel at **period end** / payment method), Sprache Deutsch falls angeboten.  
6. **Webhooks** → endpoint `https://<dein-host>/api/stripe/webhook`  
   Events: `checkout.session.completed`, **`invoice.paid`**, `customer.subscription.updated`, `customer.subscription.deleted`.  
7. Copy the webhook **signing secret** (`whsec_…`).

Checkout in der App: `locale=de`, Methoden `card` + `sepa_debit` + `paypal` (Fallback, wenn eine Methode im Konto fehlt). Vor Stripe erscheint ein Dialog mit ausdrücklicher Zustimmung zum vorzeitigen Leistungsbeginn / Erlöschen des Widerrufsrechts; die Zustimmung wird in den Checkout-Metadaten gespeichert.

Local test: `stripe listen --forward-to localhost:3000/api/stripe/webhook`.

## 2. Env (Coolify / `.env.local`)

```text
STRIPE_SECRET_KEY=sk_test_…
STRIPE_WEBHOOK_SECRET=whsec_…
STRIPE_PRICE_PLUS=price_…   # Price under Plus product prod_VEbCNCsnsFTjv8
STRIPE_PRICE_PRO=price_…    # Familie
STRIPE_PRICE_ULTIMATE=price_…  # Komplett
STRIPE_PRICE_CREDITS=price_…
```

Optional: `NEXT_PUBLIC_SITE_URL=https://leseno.de` (fallback when no request host).

Never commit secrets. Restart the app after changing env.

Wenn du Plus in Stripe neu anlegst: neues `price_…` unter dem Product kopieren und **`STRIPE_PRICE_PLUS`** in Coolify aktualisieren (Product-ID allein reicht nicht).

## 3. Database

Apply migrations:

- `20260905160000_stripe_billing.sql` + `20260905161000_stripe_billing_rpc.sql`
- **`20260906160000_credit_grants_billing.sql`** (monthly grant ledger)
- **`20260907100000_promos.sql`** (promo codes + redemptions)

Set Plus **Credits** in Admin → Pakete (e.g. 500) if needed.

## 4. Promo-Codes (Admin)

Leseno Admin → **Promo-Codes** (`/admin/promo`) creates a Stripe **Coupon** + **Promotion Code** and stores rules in `leseno.promos`.

| Flow | Behaviour |
|------|-----------|
| Link | `https://leseno.de/registrieren?promo=CODE` (or any page `?promo=`) → localStorage |
| Signup | Valid code → `user_promo_pending` |
| Checkout | Membership Session gets `discounts: [{ promotion_code }]`; Dashboard codes still work when no Leseno promo |
| Webhook | `checkout.session.completed` → `promo_redemptions` + counter |

Discount kinds: percent, fixed EUR, or free (100 %). Duration: once / repeating N months / forever. Applies to selected Plus/Familie/Komplett packages.

## 5. Behaviour

| Ereignis | Wirkung |
|----------|---------|
| Checkout Abo | Role `paket1` / `paket2` / `paket3`, booking row; optional Leseno promo discount via Stripe |
| `invoice.paid` (create/cycle) | Package credits for that month (idempotent; stacks; never expire) |
| Credits pack | +300 credits (once per Checkout session) |
| Kündigung zum Periodenende | Zugang bis Anniversary; danach Role → `basis` (Admin bleibt Admin) |

Map: Plus→`paket1`, Familie→`paket2`, Komplett→`paket3`.

Catch-up after missed months: `reconcileSubscriptionCreditGrants` on `/preise/erfolg` and `/geschichte` (skips old `subscription_create` invoices so legacy Checkout grants are not doubled).
