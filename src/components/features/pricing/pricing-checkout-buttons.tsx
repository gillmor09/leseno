"use client";

/**
 * Checkout CTAs on `/preise` — Widerrufs-Zustimmung, dann Stripe Checkout.
 */

import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  startBillingPortalAction,
  startCreditsCheckoutAction,
  startMembershipCheckoutAction,
} from "@/app/actions/stripe-checkout";
import { WithdrawalConsentDialog } from "@/components/features/pricing/withdrawal-consent-dialog";
import type { PaidMembershipPackageId } from "@/lib/stripe/config";
import { cn } from "@/lib/utils";

function goToCheckoutUrl(url: string) {
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
  const [dialogOpen, setDialogOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleOpen() {
    if (!enabled) {
      toast.error(
        "Zahlungen sind noch nicht eingerichtet. Bitte später erneut versuchen.",
      );
      return;
    }
    setDialogOpen(true);
  }

  function handleConfirm() {
    startTransition(async () => {
      const result = await startMembershipCheckoutAction({
        packageId,
        withdrawalConsent: true,
      });
      if (!result.success || !result.data?.url) {
        toast.error(result.error ?? "Checkout fehlgeschlagen.");
        return;
      }
      setDialogOpen(false);
      goToCheckoutUrl(result.data.url);
    });
  }

  return (
    <>
      <button
        type="button"
        disabled={pending}
        onClick={handleOpen}
        className={cn(
          "mt-4 inline-flex w-full items-center justify-center rounded-full px-5 py-3 text-sm font-bold transition-all duration-200 ease-in-out",
          dark
            ? "bg-yellow-400 text-zinc-950 hover:bg-yellow-300"
            : "bg-zinc-800 text-white hover:bg-zinc-900",
          pending && "cursor-wait opacity-70",
        )}
      >
        {enabled ? "Jetzt buchen" : "Bald buchbar"}
      </button>
      <WithdrawalConsentDialog
        open={dialogOpen}
        pending={pending}
        title="Paket buchen"
        onClose={() => {
          if (!pending) setDialogOpen(false);
        }}
        onConfirm={handleConfirm}
      />
    </>
  );
}

/**
 * Credits top-up CTA. `inline` sits next to the balance badge on `/geschichte`.
 */
export function CreditsCheckoutButton({
  enabled,
  variant = "block",
  label,
}: {
  enabled: boolean;
  variant?: "block" | "inline";
  /** Overrides default label (`Credits kaufen` / `Nachladen` for inline). */
  label?: string;
}) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const inline = variant === "inline";
  const buttonLabel =
    label ?? (inline ? "Nachladen" : enabled ? "Credits kaufen" : "Bald buchbar");

  function handleOpen() {
    if (!enabled) {
      toast.error(
        "Zahlungen sind noch nicht eingerichtet. Bitte später erneut versuchen.",
      );
      return;
    }
    setDialogOpen(true);
  }

  function handleConfirm() {
    startTransition(async () => {
      const result = await startCreditsCheckoutAction({
        withdrawalConsent: true,
      });
      if (!result.success || !result.data?.url) {
        toast.error(result.error ?? "Checkout fehlgeschlagen.");
        return;
      }
      setDialogOpen(false);
      goToCheckoutUrl(result.data.url);
    });
  }

  return (
    <>
      <button
        type="button"
        disabled={pending}
        onClick={handleOpen}
        className={cn(
          "inline-flex items-center justify-center rounded-full font-bold transition-all duration-200 ease-in-out",
          inline
            ? "bg-yellow-400 px-3 py-1 text-xs font-extrabold tracking-wide text-zinc-950 uppercase hover:bg-yellow-300"
            : "mt-6 bg-zinc-800 px-5 py-3 text-sm text-white hover:bg-zinc-900",
          pending && "cursor-wait opacity-70",
        )}
      >
        {pending && inline ? "…" : buttonLabel}
      </button>
      <WithdrawalConsentDialog
        open={dialogOpen}
        pending={pending}
        title="Credits nachladen"
        onClose={() => {
          if (!pending) setDialogOpen(false);
        }}
        onConfirm={handleConfirm}
      />
    </>
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
