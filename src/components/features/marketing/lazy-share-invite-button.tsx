"use client";

import dynamic from "next/dynamic";

/**
 * Defers ShareInviteButton (+ lucide/sonner) until after hydration / first paint.
 * Landing still shows a light placeholder so layout stays stable.
 */

const ShareInviteButtonLazy = dynamic(
  () =>
    import("@/components/features/marketing/share-invite-button").then(
      (mod) => mod.ShareInviteButton,
    ),
  {
    ssr: false,
    loading: () => (
      <div
        className="inline-flex h-10 min-w-[8.5rem] items-center justify-center rounded-full bg-orange-700/80 px-5 text-sm font-bold text-white"
        aria-hidden
      >
        Teilen
      </div>
    ),
  },
);

type LazyShareProps = {
  url: string;
  shareText?: string;
  className?: string;
  variant?: "primary" | "secondary" | "ghost";
  showChannels?: boolean;
};

export function LazyShareInviteButton(props: LazyShareProps) {
  return <ShareInviteButtonLazy {...props} />;
}
