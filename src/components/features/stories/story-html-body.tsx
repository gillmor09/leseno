/**
 * Renders story body HTML (already sanitized on the server) or plain text.
 * Illustration / Silben / TTS styles: `./story-html.css` (not in global LCP CSS).
 * TTS highlight wraps words under `[data-tts-root]` (see `tts-dom-highlight.ts`).
 */

"use client";

import "@/components/features/stories/story-html.css";
import { cn } from "@/lib/utils";
import { looksLikeHtml } from "@/lib/stories/looks-like-html";

type StoryHtmlBodyProps = {
  content: string;
  className?: string;
  /**
   * When true, skip fixed `leading-*` so parent `line-height` / letter-spacing inherit
   * (Lesemodus typography controls).
   */
  inheritTypography?: boolean;
};

/**
 * Story card body. Expects pipeline-sanitized HTML; plain text keeps line breaks.
 */
export function StoryHtmlBody({
  content,
  className,
  inheritTypography = false,
}: StoryHtmlBodyProps) {
  if (!looksLikeHtml(content)) {
    return (
      <div
        data-tts-root
        className={cn(
          "mt-4 whitespace-pre-wrap text-zinc-700",
          !inheritTypography && "leading-relaxed",
          className,
        )}
      >
        {content}
      </div>
    );
  }

  return (
    <div
      data-tts-root
      className={cn(
        "story-html mt-4 text-zinc-700",
        !inheritTypography && "leading-relaxed",
        "[&_h1]:mt-0 [&_h1]:mb-4 [&_h1]:text-[1.25em] [&_h1]:font-extrabold [&_h1]:text-zinc-950",
        "[&_h2]:mt-6 [&_h2]:mb-3 [&_h2]:text-[1.1em] [&_h2]:font-extrabold [&_h2]:text-zinc-950",
        !inheritTypography &&
          "[&_h1]:leading-tight [&_h2]:leading-tight [&_li]:leading-relaxed",
        "[&_h3]:mt-5 [&_h3]:mb-2 [&_h3]:font-extrabold [&_h3]:text-zinc-950",
        "[&_h4]:mt-4 [&_h4]:mb-2 [&_h4]:font-bold [&_h4]:text-zinc-950",
        "[&_p]:mt-3 [&_p]:first:mt-0",
        "[&_ul]:mt-3 [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5",
        "[&_ol]:mt-3 [&_ol]:list-decimal [&_ol]:space-y-1 [&_ol]:pl-5",
        "[&_blockquote]:mt-3 [&_blockquote]:border-l-4 [&_blockquote]:border-orange-700/30 [&_blockquote]:pl-4 [&_blockquote]:italic",
        "[&_strong]:font-extrabold [&_strong]:text-zinc-900",
        "[&_b]:font-extrabold [&_b]:text-zinc-900",
        "[&_em]:italic",
        className,
      )}
      dangerouslySetInnerHTML={{ __html: content }}
    />
  );
}
