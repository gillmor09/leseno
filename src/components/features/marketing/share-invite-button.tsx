"use client";

/**
 * Copy / Web Share for invite links (parents sharing leseno).
 */

import { useState } from "react";
import { Check, Link2, Share2 } from "lucide-react";
import { toast } from "sonner";
import {
  SHARE_BUTTON_LABEL,
  SHARE_BUTTON_NATIVE,
  SHARE_BUTTON_SHARED,
  SHARE_INVITE_MESSAGE,
  SHARE_PAGE_TITLE,
} from "@/lib/marketing/share-copy";
import { cn } from "@/lib/utils";

export function ShareInviteButton({
  url,
  shareText = SHARE_INVITE_MESSAGE,
  className,
  variant = "primary",
}: {
  url: string;
  shareText?: string;
  className?: string;
  variant?: "primary" | "secondary" | "ghost";
}) {
  const [copied, setCopied] = useState(false);
  const canNativeShare =
    typeof navigator !== "undefined" && typeof navigator.share === "function";

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(`${shareText} ${url}`);
      setCopied(true);
      toast.success(SHARE_BUTTON_SHARED);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Link konnte nicht kopiert werden.");
    }
  }

  async function handleShare() {
    if (canNativeShare) {
      try {
        await navigator.share({
          title: SHARE_PAGE_TITLE,
          text: shareText,
          url,
        });
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
        // fall through to clipboard
      }
    }
    await copyLink();
  }

  const variantClass =
    variant === "primary"
      ? "bg-orange-700 text-white hover:bg-orange-800"
      : variant === "secondary"
        ? "bg-white text-zinc-950 ring-1 ring-zinc-950/10 hover:bg-gray-100"
        : "bg-orange-50 text-orange-900 ring-1 ring-orange-700/15 hover:bg-orange-100";

  return (
    <button
      type="button"
      onClick={() => {
        void handleShare();
      }}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-bold transition-all duration-200 ease-in-out",
        variantClass,
        className,
      )}
    >
      {copied ? (
        <Check className="size-4" aria-hidden />
      ) : canNativeShare ? (
        <Share2 className="size-4" aria-hidden />
      ) : (
        <Link2 className="size-4" aria-hidden />
      )}
      {copied
        ? SHARE_BUTTON_SHARED
        : canNativeShare
          ? SHARE_BUTTON_NATIVE
          : SHARE_BUTTON_LABEL}
    </button>
  );
}
