"use client";

/**
 * Copy / Web Share / Instagram / WhatsApp for invite links (parents sharing leseno).
 * Instagram has no web deep-link for captions — we copy text and hint to paste.
 */

import { useState } from "react";
import { Check, Link2, MessageCircle, Share2 } from "lucide-react";
import {
  SHARE_BUTTON_INSTAGRAM,
  SHARE_BUTTON_LABEL,
  SHARE_BUTTON_NATIVE,
  SHARE_BUTTON_SHARED,
  SHARE_BUTTON_WHATSAPP,
  SHARE_INSTAGRAM_CAPTION,
  SHARE_INSTAGRAM_HINT,
  SHARE_INVITE_MESSAGE,
  SHARE_PAGE_TITLE,
} from "@/lib/marketing/share-copy";
import { cn } from "@/lib/utils";

async function notify(kind: "success" | "error", message: string) {
  const { toast } = await import("sonner");
  if (kind === "success") toast.success(message);
  else toast.error(message);
}

/** Lucide dropped brand icons — tiny Instagram glyph for the share button. */
function InstagramGlyph({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
    </svg>
  );
}
type ShareVariant = "primary" | "secondary" | "ghost";

function variantClass(variant: ShareVariant): string {
  if (variant === "primary") {
    return "bg-orange-700 text-white hover:bg-orange-800";
  }
  if (variant === "secondary") {
    return "bg-white text-zinc-950 ring-1 ring-zinc-950/10 hover:bg-gray-100";
  }
  return "bg-orange-50 text-orange-900 ring-1 ring-orange-700/15 hover:bg-orange-100";
}

const buttonBase =
  "inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-bold transition-all duration-200 ease-in-out";

export function ShareInviteButton({
  url,
  shareText = SHARE_INVITE_MESSAGE,
  className,
  variant = "primary",
  showChannels = false,
}: {
  url: string;
  shareText?: string;
  className?: string;
  variant?: ShareVariant;
  /** Show WhatsApp + Instagram next to the main share control. */
  showChannels?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const canNativeShare =
    typeof navigator !== "undefined" && typeof navigator.share === "function";

  async function copyText(text: string, successMessage: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      await notify("success", successMessage);
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      await notify("error", "Konnte nicht in die Zwischenablage kopieren.");
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
      }
    }
    await copyText(`${shareText} ${url}`, SHARE_BUTTON_SHARED);
  }

  async function handleInstagram() {
    // No official Instagram web share URL — copy caption, then open IG if possible.
    await copyText(`${SHARE_INSTAGRAM_CAPTION} ${url}`, SHARE_INSTAGRAM_HINT);
    const isMobile =
      typeof navigator !== "undefined" &&
      /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    if (isMobile) {
      window.setTimeout(() => {
        window.location.href = "instagram://app";
      }, 400);
    }
  }

  function handleWhatsApp() {
    const text = encodeURIComponent(`${shareText} ${url}`);
    window.open(`https://wa.me/?text=${text}`, "_blank", "noopener,noreferrer");
  }

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2",
        showChannels ? "justify-center sm:justify-start" : "",
        className,
      )}
    >
      <button
        type="button"
        onClick={() => {
          void handleShare();
        }}
        className={cn(buttonBase, variantClass(variant))}
      >
        {copied && !showChannels ? (
          <Check className="size-4" aria-hidden />
        ) : canNativeShare ? (
          <Share2 className="size-4" aria-hidden />
        ) : (
          <Link2 className="size-4" aria-hidden />
        )}
        {copied && !showChannels
          ? SHARE_BUTTON_SHARED
          : canNativeShare
            ? SHARE_BUTTON_NATIVE
            : SHARE_BUTTON_LABEL}
      </button>

      {showChannels ? (
        <>
          <button
            type="button"
            onClick={handleWhatsApp}
            className={cn(buttonBase, variantClass("secondary"))}
            aria-label="Per WhatsApp teilen"
          >
            <MessageCircle className="size-4" aria-hidden />
            {SHARE_BUTTON_WHATSAPP}
          </button>
          <button
            type="button"
            onClick={() => {
              void handleInstagram();
            }}
            className={cn(buttonBase, variantClass("secondary"))}
            aria-label="Für Instagram vorbereiten"
          >
            <InstagramGlyph className="size-4" />
            {SHARE_BUTTON_INSTAGRAM}
          </button>
        </>
      ) : null}
    </div>
  );
}
