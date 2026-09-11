"use client";

/**
 * Client-only Quill instance with size/color and (optional) table + image.
 * Loaded via dynamic import from `rich-html-editor.tsx` (no SSR).
 */

import { useMemo } from "react";
import ReactQuill, { Quill } from "react-quill-new";
import Table from "quill/modules/table";
import "react-quill-new/dist/quill.snow.css";
import "./rich-html-editor.css";

type TableModuleApi = {
  insertTable: (rows: number, columns: number) => void;
  insertRowAbove: () => void;
  insertRowBelow: () => void;
  insertColumnLeft: () => void;
  insertColumnRight: () => void;
  deleteRow: () => void;
  deleteColumn: () => void;
  deleteTable: () => void;
};

let quillExtrasRegistered = false;

function ensureQuillExtras() {
  if (quillExtrasRegistered) return;
  quillExtrasRegistered = true;
  Table.register();
  Quill.register("modules/table", Table, true);
}

ensureQuillExtras();

const TOOLBAR_DEFAULT = [
  [{ header: [1, 2, 3, false] }],
  [{ size: ["small", false, "large", "huge"] }],
  [{ color: [] }, { background: [] }],
  ["bold", "italic", "underline"],
  [{ list: "ordered" }, { list: "bullet" }],
  ["link"],
  ["clean"],
] as const;

const TOOLBAR_ARTICLE = [
  [{ header: [1, 2, 3, false] }],
  [{ size: ["small", false, "large", "huge"] }],
  [{ color: [] }, { background: [] }],
  ["bold", "italic", "underline"],
  [{ list: "ordered" }, { list: "bullet" }],
  ["link", "image"],
  [
    {
      table: [
        "new",
        "row-above",
        "row-below",
        "col-left",
        "col-right",
        "del-row",
        "del-col",
        "del-table",
      ],
    },
  ],
  ["clean"],
] as const;

const MAX_IMAGE_BYTES = 3 * 1024 * 1024;

export type RichHtmlEditorVariant = "default" | "article";

export type RichHtmlEditorInnerProps = {
  value: string;
  onChange: (html: string) => void;
  disabled?: boolean;
  id?: string;
  placeholder?: string;
  variant?: RichHtmlEditorVariant;
};

function insertLocalImage(this: { quill: InstanceType<typeof Quill> }) {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/png,image/jpeg,image/webp,image/gif";
  input.click();
  input.onchange = () => {
    const file = input.files?.[0];
    if (!file) return;
    if (file.size > MAX_IMAGE_BYTES) {
      window.alert("Bild ist zu groß (max. 3 MB). Bitte verkleinern.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      if (typeof dataUrl !== "string") return;
      const range = this.quill.getSelection(true);
      const index = range?.index ?? this.quill.getLength();
      this.quill.insertEmbed(index, "image", dataUrl, Quill.sources.USER);
      this.quill.setSelection(index + 1, Quill.sources.SILENT);
    };
    reader.readAsDataURL(file);
  };
}

function handleTableAction(
  this: { quill: InstanceType<typeof Quill> },
  value: string | boolean,
) {
  if (!value || typeof value !== "string") return;
  const table = this.quill.getModule("table") as TableModuleApi | null;
  if (!table) return;
  switch (value) {
    case "new":
      table.insertTable(3, 3);
      break;
    case "row-above":
      table.insertRowAbove();
      break;
    case "row-below":
      table.insertRowBelow();
      break;
    case "col-left":
      table.insertColumnLeft();
      break;
    case "col-right":
      table.insertColumnRight();
      break;
    case "del-row":
      table.deleteRow();
      break;
    case "del-col":
      table.deleteColumn();
      break;
    case "del-table":
      table.deleteTable();
      break;
    default:
      break;
  }
}

/**
 * Controlled Quill editor used by the dynamic wrapper in `rich-html-editor.tsx`.
 */
export function RichHtmlEditorInner({
  value,
  onChange,
  disabled = false,
  id,
  placeholder = "Text schreiben …",
  variant = "default",
}: RichHtmlEditorInnerProps) {
  const isArticle = variant === "article";

  const modules = useMemo(() => {
    if (disabled) {
      return { toolbar: false as const };
    }
    if (!isArticle) {
      return { toolbar: [...TOOLBAR_DEFAULT] };
    }
    return {
      table: true,
      toolbar: {
        container: [...TOOLBAR_ARTICLE],
        handlers: {
          image: insertLocalImage,
          table: handleTableAction,
        },
      },
    };
  }, [disabled, isArticle]);

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
