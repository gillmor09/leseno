"use client";

/**
 * Editable prose with amber Stelle marks (Quill background format).
 * Dynamic import — Quill is browser-only; see `highlighted-prose-editor-inner.tsx`.
 */

import dynamic from "next/dynamic";

const HighlightedProseEditorInner = dynamic(
  () =>
    import("./highlighted-prose-editor-inner").then(
      (m) => m.HighlightedProseEditorInner,
    ),
  {
    ssr: false,
    loading: () => (
      <div className="flex min-h-48 items-center justify-center rounded-xl bg-zinc-50 text-sm font-semibold text-zinc-500 ring-1 ring-zinc-950/10">
        Editor wird geladen …
      </div>
    ),
  },
);

type Props = {
  value: string;
  onChange: (value: string) => void;
  quotes: string[];
  className?: string;
  rows?: number;
  disabled?: boolean;
  id?: string;
  placeholder?: string;
};

/**
 * Plain-text Quill editor; Stelle quotes are highlighted with background marks.
 */
export function HighlightedProseEditor({
  value,
  onChange,
  quotes,
  className,
  rows = 14,
  disabled = false,
  id,
  placeholder,
}: Props) {
  return (
    <HighlightedProseEditorInner
      value={value}
      onChange={onChange}
      quotes={quotes}
      className={className}
      rows={rows}
      disabled={disabled}
      id={id}
      placeholder={placeholder}
    />
  );
}
