/**
 * Invite / Empfehlung card for landing, story result, and membership pages.
 * Server component — only the share button is a client island.
 */

import { ShareInviteButton } from "@/components/features/marketing/share-invite-button";
import {
  buildInviteUrl,
  referralCodeFromUserId,
} from "@/lib/marketing/referral";
import {
  SHARE_AFTER_STORY_HINT,
  SHARE_SECTION_BODY,
  SHARE_SECTION_EYEBROW,
  SHARE_SECTION_HEADLINE,
} from "@/lib/marketing/share-copy";

export function InviteFriendsCard({
  referralCode = null,
  userId = null,
  variant = "section",
}: {
  /** Explicit invite code (preferred). */
  referralCode?: string | null;
  /** When set without referralCode, derives a short code from the user id. */
  userId?: string | null;
  variant?: "section" | "compact";
}) {
  const code =
    referralCode?.trim() ||
    (userId ? referralCodeFromUserId(userId) : null);
  const url = buildInviteUrl(code);

  if (variant === "compact") {
    return (
      <aside className="rounded-[1.5rem] bg-orange-50 px-5 py-4 ring-1 ring-orange-700/10">
        <p className="text-sm font-semibold leading-relaxed text-orange-950">
          {SHARE_AFTER_STORY_HINT}
        </p>
        <ShareInviteButton
          url={url}
          variant="ghost"
          showChannels
          className="mt-3"
        />
      </aside>
    );
  }

  return (
    <section
      id="empfehlen"
      className="scroll-mt-20 bg-zinc-800 text-white"
    >
      <div className="mx-auto max-w-3xl px-4 py-16 text-center sm:px-6 sm:py-20">
        <p className="text-sm font-extrabold tracking-wide text-yellow-400 uppercase">
          {SHARE_SECTION_EYEBROW}
        </p>
        <h2 className="mt-2 text-3xl font-extrabold tracking-tight sm:text-4xl">
          {SHARE_SECTION_HEADLINE}
        </h2>
        <p className="mt-4 text-base leading-relaxed text-zinc-300">
          {SHARE_SECTION_BODY}
        </p>
        <p className="mt-3 text-sm text-zinc-300">
          Bei Instagram: Text kopieren, App öffnen, in Story oder DM einfügen —
          Instagram erlaubt keine Direkt-Links von Websites.
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3">
          <ShareInviteButton url={url} variant="primary" showChannels />
          <a
            href="/registrieren"
            className="inline-flex items-center justify-center rounded-full bg-white px-5 py-2.5 text-sm font-bold text-zinc-950 transition-all duration-200 ease-in-out hover:bg-gray-100"
          >
            Selbst kostenlos starten
          </a>
        </div>
      </div>
    </section>
  );
}
