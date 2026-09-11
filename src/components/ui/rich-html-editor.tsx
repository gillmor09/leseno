"use client";

/**
 * Shared Quill rich-text editor (HTML out) for admin content such as help texts.
 */

import dynamic from "next/dynamic";
import { useMemo } from "react";
import "react-quill-new/dist/quill.snow.css";
import "./rich-html-editor.css";

const ReactQuill = dynamic(() => import("react-quill-new"), {
  ssr: false,
  loading: () => (
    <div className="flex min-h-48 items-center justify-center rounded-2xl bg-gray-100 text-sm font-semibold text-zinc-500 ring-1 ring-zinc-950/10">
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

type RichHtmlEditorProps = {
  value: string;
  onChange: (html: string) => void;
  disabled?: boolean;
  id?: string;
  placeholder?: string;
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
}: RichHtmlEditorProps) {
  const modules = useMemo(
    () => ({
      toolbar: disabled ? false : [...TOOLBAR],
    }),
    [disabled],
  );

  return (
    <div
      id={id}
      className="rich-html-quill mt-1 overflow-hidden rounded-2xl bg-white ring-1 ring-zinc-950/10 focus-within:ring-2 focus-within:ring-orange-700"
    >
      <ReactQuill
        theme="snow"
        value={value}
        readOnly={disabled}
        modules={modules}
        useSemanticHTML={false}
        placeholder={placeholder}
        onChange={(html) => {
          if (disabled) return;
          onChange(html);
        }}
      />
    </div>
  );
}
