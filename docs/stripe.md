# Stripe Checkout (Abos + Credits + PayPal)

Leseno uses **Stripe Checkout** + **Billing** for Plus / Pro / Ultimate subscriptions and the one-time Credits pack. PayPal is requested alongside card; enable it in the Stripe Dashboard.

## 1. Stripe Dashboard

1. Create Products (recurring monthly EUR):
   - Plus → 5,00 € / Monat  
   - Pro → 10,00 € / Monat  
   - Ultimate → 15,00 € / Monat  
2. Create Product (one-time EUR): Credits → 5,00 € (300 Credits).  
3. Copy each **Price id** (`price_…`).  
4. **Payment methods** (Einstellungen → Zahlungsmethoden): **Karten**, **SEPA-Lastschrift** und **PayPal** aktivieren. PayPal ggf. mit PayPal-Konto verknüpfen. Preise müssen in **EUR** sein (sonst kein SEPA).  
5. **Customer Portal:** activate (cancel / payment method), Sprache Deutsch falls angeboten.  
6. **Webhooks** → endpoint `https://<dein-host>/api/stripe/webhook`  
   Events: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`.  
7. Copy the webhook **signing secret** (`whsec_…`).

Checkout in der App: `locale=de`, Methoden `card` + `sepa_debit` + `paypal` (Fallback, wenn eine Methode im Konto fehlt). Vor Stripe erscheint ein Dialog mit ausdrücklicher Zustimmung zum vorzeitigen Leistungsbeginn / Erlöschen des Widerrufsrechts; die Zustimmung wird in den Checkout-Metadaten gespeichert.

Local test: `stripe listen --forward-to localhost:3000/api/stripe/webhook`.

## 2. Env (Coolify / `.env.local`)

```text
STRIPE_SECRET_KEY=sk_test_…
STRIPE_WEBHOOK_SECRET=whsec_…
STRIPE_PRICE_PLUS=price_…
STRIPE_PRICE_PRO=price_…
STRIPE_PRICE_ULTIMATE=price_…
STRIPE_PRICE_CREDITS=price_…
```

Optional: `NEXT_PUBLIC_SITE_URL=https://leseno.de` (fallback when no request host).

Never commit secrets. Restart the app after changing env.

## 3. Database

Apply migration `20260905160000_stripe_billing.sql` and `20260905161000_stripe_billing_rpc.sql` (`stripe_*` columns + public service-role RPCs; PostgREST does not expose `leseno`). Set Plus **Credits** in Admin → Pakete to 500 if needed.

## 4. Behaviour

| Kauf | Wirkung |
|------|---------|
| Plus / Pro / Ultimate | Role `paket1` / `paket2` / `paket3`, booking row, package credits once |
| Credits pack | +300 credits |
| Abo ended | Role → `basis` (Admin bleibt Admin) |

Map: Plus→`paket1`, Pro→`paket2`, Ultimate→`paket3`.
