"use client";

/**
 * Quill rich-text editor for Auth email HTML bodies (admin only).
 * Client-only: Quill needs the DOM. Placeholders like {{email}} stay as text.
 */

import dynamic from "next/dynamic";
import { useMemo } from "react";
import "react-quill-new/dist/quill.snow.css";
import "./auth-email-html-editor.css";

const ReactQuill = dynamic(() => import("react-quill-new"), {
  ssr: false,
  loading: () => (
    <div className="flex min-h-64 items-center justify-center rounded-2xl bg-gray-100 text-sm font-semibold text-zinc-500 ring-1 ring-zinc-950/10">
      Editor wird geladen …
    </div>
  ),
});

const TOOLBAR = [
  [{ header: [1, 2, 3, false] }],
  ["bold", "italic", "underline"],
  [{ list: "ordered" }, { list: "bullet" }],
  ["link"],
  ["clean"],
] as const;

type AuthEmailHtmlEditorProps = {
  value: string;
  onChange: (html: string) => void;
  disabled?: boolean;
  id?: string;
};

/**
 * Controlled Quill editor; emits HTML suitable for email templates.
 */
export function AuthEmailHtmlEditor({
  value,
  onChange,
  disabled = false,
  id,
}: AuthEmailHtmlEditorProps) {
  const modules = useMemo(
    () => ({
      toolbar: disabled ? false : [...TOOLBAR],
    }),
    [disabled],
  );

  return (
    <div
      id={id}
      className="auth-email-quill mt-1 overflow-hidden rounded-2xl bg-white ring-1 ring-zinc-950/10 focus-within:ring-2 focus-within:ring-orange-700"
    >
      <ReactQuill
        theme="snow"
        value={value}
        readOnly={disabled}
        modules={modules}
        useSemanticHTML={false}
        placeholder="E-Mail-Inhalt schreiben …"
        onChange={(html) => {
          if (disabled) return;
          onChange(html);
        }}
      />
    </div>
  );
}
