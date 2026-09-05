/**
 * Stripe webhook endpoint — raw body required for signature verification.
 * Configure in Stripe Dashboard → Webhooks → `https://<host>/api/stripe/webhook`
 */

import { NextResponse } from "next/server";
import { processStripeWebhookEvent } from "@/lib/stripe/webhooks";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json(
      { error: "stripe-signature fehlt." },
      { status: 400 },
    );
  }

  const rawBody = await request.text();
  const result = await processStripeWebhookEvent(rawBody, signature);

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error },
      { status: result.status },
    );
  }

  return NextResponse.json({ received: true });
}
