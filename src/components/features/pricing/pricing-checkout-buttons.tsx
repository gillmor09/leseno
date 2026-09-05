"use client";

/**
 * Checkout CTAs on `/preise` — starts Stripe Checkout (card + PayPal when enabled).
 */

import { useTransition } from "react";
import { toast } from "sonner";
import {
  startBillingPortalAction,
  startCreditsCheckoutAction,
  startMembershipCheckoutAction,
} from "@/app/actions/stripe-checkout";
import type { PaidMembershipPackageId } from "@/lib/stripe/config";
import { cn } from "@/lib/utils";

function goToCheckoutUrl(url: string) {
  // Stripe / Auth URLs are absolute — full navigation, not Next client router.
  window.location.assign(url);
}

export function MembershipCheckoutButton({
  packageId,
  dark,
  enabled,
}: {
  packageId: PaidMembershipPackageId;
  dark?: boolean;
  enabled: boolean;
}) {
  const [pending, startTransition] = useTransition();

  function handleClick() {
    if (!enabled) {
      toast.error(
        "Zahlungen sind noch nicht eingerichtet. Bitte später erneut versuchen.",
      );
      return;
    }
    startTransition(async () => {
      const result = await startMembershipCheckoutAction(packageId);
      if (!result.success || !result.data?.url) {
        toast.error(result.error ?? "Checkout fehlgeschlagen.");
        return;
      }
      goToCheckoutUrl(result.data.url);
    });
  }

  return (
    <button
      type="button"
      disabled={pending}
      onClick={handleClick}
      className={cn(
        "mt-4 inline-flex w-full items-center justify-center rounded-full px-5 py-3 text-sm font-bold transition-all duration-200 ease-in-out",
        dark
          ? "bg-yellow-400 text-zinc-950 hover:bg-yellow-300"
          : "bg-zinc-800 text-white hover:bg-zinc-900",
        pending && "cursor-wait opacity-70",
      )}
    >
      {pending ? "Weiter…" : enabled ? "Jetzt buchen" : "Bald buchbar"}
    </button>
  );
}

export function CreditsCheckoutButton({ enabled }: { enabled: boolean }) {
  const [pending, startTransition] = useTransition();

  function handleClick() {
    if (!enabled) {
      toast.error(
        "Zahlungen sind noch nicht eingerichtet. Bitte später erneut versuchen.",
      );
      return;
    }
    startTransition(async () => {
      const result = await startCreditsCheckoutAction();
      if (!result.success || !result.data?.url) {
        toast.error(result.error ?? "Checkout fehlgeschlagen.");
        return;
      }
      goToCheckoutUrl(result.data.url);
    });
  }

  return (
    <button
      type="button"
      disabled={pending}
      onClick={handleClick}
      className={cn(
        "mt-6 inline-flex items-center justify-center rounded-full bg-zinc-800 px-5 py-3 text-sm font-bold text-white transition-all duration-200 ease-in-out hover:bg-zinc-900",
        pending && "cursor-wait opacity-70",
      )}
    >
      {pending ? "Weiter…" : enabled ? "Credits kaufen" : "Bald buchbar"}
    </button>
  );
}

export function ManageSubscriptionButton({ enabled }: { enabled: boolean }) {
  const [pending, startTransition] = useTransition();

  if (!enabled) return null;

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        startTransition(async () => {
          const result = await startBillingPortalAction();
          if (!result.success || !result.data?.url) {
            toast.error(result.error ?? "Portal konnte nicht geöffnet werden.");
            return;
          }
          goToCheckoutUrl(result.data.url);
        });
      }}
      className={cn(
        "text-sm font-semibold text-orange-700 underline-offset-2 hover:underline",
        pending && "opacity-70",
      )}
    >
      {pending ? "Öffne…" : "Abo verwalten / kündigen"}
    </button>
  );
}
