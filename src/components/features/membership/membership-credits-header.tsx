"use client";

/**
 * Shared membership header strip: package/area badge + credits + top-up.
 * Provides credits context so nested client forms can update the balance.
 */

import {
  createContext,
  useContext,
  useState,
  type ReactNode,
} from "react";
import { CreditsCheckoutButton } from "@/components/features/pricing/pricing-checkout-buttons";

type CreditsContextValue = {
  credits: number;
  onCreditsChange: (credits: number) => void;
};

const MembershipCreditsContext = createContext<CreditsContextValue | null>(
  null,
);

/** Live credits from the nearest `MembershipCreditsHeader` (optional). */
export function useMembershipCredits(): CreditsContextValue | null {
  return useContext(MembershipCreditsContext);
}

export function MembershipCreditsHeader({
  badge,
  initialCredits,
  checkoutEnabled,
  children,
}: {
  /** Left-side pill (e.g. „Ultimate“, „Bücherei“). */
  badge: ReactNode;
  initialCredits: number;
  checkoutEnabled: boolean;
  /** Page body under the strip (must be React nodes, not a render prop). */
  children?: ReactNode;
}) {
  const [credits, setCredits] = useState(initialCredits);

  return (
    <MembershipCreditsContext.Provider
      value={{ credits, onCreditsChange: setCredits }}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        {badge}
        <div className="flex flex-wrap items-center gap-2">
          <p
            className="inline-flex items-center rounded-full bg-zinc-800 px-3 py-1 text-xs font-extrabold tracking-wide text-white tabular-nums"
            title="Aktueller Credits-Stand"
          >
            {credits.toLocaleString("de-DE")} Credits
          </p>
          <CreditsCheckoutButton
            enabled={checkoutEnabled}
            variant="inline"
          />
        </div>
      </div>
      {children}
    </MembershipCreditsContext.Provider>
  );
}
