"use client";

/**
 * Shared Quill rich-text editor (HTML out) for admin content.
 * `variant="article"` adds image upload and table tools (blog).
 */

import dynamic from "next/dynamic";
import type { RichHtmlEditorVariant } from "./rich-html-editor-inner";

const RichHtmlEditorInner = dynamic(
  () =>
    import("./rich-html-editor-inner").then((m) => m.RichHtmlEditorInner),
  {
    ssr: false,
    loading: () => (
      <div className="flex min-h-48 items-center justify-center rounded-2xl bg-gray-100 text-sm font-semibold text-zinc-500 ring-1 ring-zinc-950/10">
        Editor wird geladen …
      </div>
    ),
  },
);

type RichHtmlEditorProps = {
  value: string;
  onChange: (html: string) => void;
  disabled?: boolean;
  id?: string;
  placeholder?: string;
  /** `article`: size/color + image + tables (blog). Default: size/color without media. */
  variant?: RichHtmlEditorVariant;
};

/**
 * Controlled Quill editor; emits HTML suitable for sanitized in-app display.
 */
export function RichHtmlEditor({
  value,
  onChange,
  disabled = false,
  id,
  placeholder = "Text schreiben …",
  variant = "default",
}: RichHtmlEditorProps) {
  return (
    <RichHtmlEditorInner
      value={value}
      onChange={onChange}
      disabled={disabled}
      id={id}
      placeholder={placeholder}
      variant={variant}
    />
  );
}
