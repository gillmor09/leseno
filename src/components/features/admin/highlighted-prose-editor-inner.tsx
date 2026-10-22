"use client";

/**
 * Quill-backed plain-text editor with background marks for Stelle quotes.
 * Emits plain text; highlights are Quill `background` formats (editable in place).
 */

import { useEffect, useMemo, useRef } from "react";
import ReactQuill from "react-quill-new";
import "react-quill-new/dist/quill.snow.css";
import { buildHighlightParts } from "@/lib/novel/feedback-marks";
import { cn } from "@/lib/utils";
import "./highlighted-prose-editor.css";

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

type QuillLike = {
  getText: () => string;
  getLength: () => number;
  setText: (text: string, source?: string) => void;
  formatText: (
    index: number,
    length: number,
    format: string,
    value: unknown,
    source?: string,
  ) => void;
  setSelection: (index: number, length?: number, source?: string) => void;
  getSelection: (focus?: boolean) => { index: number; length: number } | null;
};

function plainFromQuill(quill: QuillLike): string {
  let t = quill.getText();
  if (t.endsWith("\n")) t = t.slice(0, -1);
  return t;
}

function applyBackgroundMarks(
  quill: QuillLike,
  text: string,
  quotes: string[],
): void {
  const len = quill.getLength();
  if (len > 0) {
    quill.formatText(0, len, "background", false, "silent");
  }
  if (!text || quotes.length === 0) return;
  const parts = buildHighlightParts(text, quotes);
  let index = 0;
  for (const part of parts) {
    const n = part.text.length;
    if (part.marked && n > 0) {
      quill.formatText(index, n, "background", "#fcd34d", "silent");
    }
    index += n;
  }
}

export function HighlightedProseEditorInner({
  value,
  onChange,
  quotes,
  className,
  rows = 14,
  disabled = false,
  id,
  placeholder,
}: Props) {
  const quillRef = useRef<ReactQuill>(null);
  const lastEmittedRef = useRef(value);
  const quotesKey = useMemo(() => quotes.join("\u0001"), [quotes]);
  const quotesRef = useRef(quotes);
  quotesRef.current = quotes;

  const modules = useMemo(
    () => ({
      toolbar: false,
      clipboard: { matchVisual: false },
    }),
    [],
  );

  function getQuill(): QuillLike | undefined {
    return quillRef.current?.getEditor() as QuillLike | undefined;
  }

  // External value (scene switch, save round-trip) — replace body, keep caret if possible.
  useEffect(() => {
    let cancelled = false;
    const sync = () => {
      if (cancelled) return;
      const editor = getQuill();
      if (!editor) return;
      const current = plainFromQuill(editor);
      if (value === lastEmittedRef.current && value === current) return;
      if (value === current) {
        lastEmittedRef.current = value;
        return;
      }
      const sel = editor.getSelection();
      editor.setText(value, "silent");
      applyBackgroundMarks(editor, value, quotesRef.current);
      lastEmittedRef.current = value;
      if (sel) {
        const max = Math.max(0, editor.getLength() - 1);
        editor.setSelection(
          Math.min(sel.index, max),
          Math.min(sel.length, Math.max(0, max - sel.index)),
          "silent",
        );
      }
    };
    sync();
    const raf = requestAnimationFrame(sync);
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, [value]);

  // Stelle quotes changed (e.g. after Speichern & prüfen) — re-mark without touching text.
  useEffect(() => {
    let cancelled = false;
    const mark = () => {
      if (cancelled) return;
      const editor = getQuill();
      if (!editor) return;
      applyBackgroundMarks(editor, plainFromQuill(editor), quotesRef.current);
    };
    mark();
    const raf = requestAnimationFrame(mark);
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, [quotesKey]);

  const minHeight = Math.max(12, rows) * 1.625 * 16;

  return (
    <div
      id={id}
      className={cn(
        "highlighted-prose-quill min-w-0 overflow-hidden rounded-xl",
        className ?? "bg-white ring-1 ring-zinc-950/10",
      )}
      style={{ ["--hpq-min-height" as string]: `${minHeight}px` }}
    >
      <ReactQuill
        ref={quillRef}
        theme="snow"
        readOnly={disabled}
        modules={modules}
        formats={["background"]}
        placeholder={placeholder ?? "Text bearbeiten …"}
        defaultValue={value}
        onChange={(_html, _delta, source, editor) => {
          if (disabled || source !== "user") return;
          const plain = editor.getText().replace(/\n$/, "");
          lastEmittedRef.current = plain;
          onChange(plain);
        }}
      />
    </div>
  );
}
