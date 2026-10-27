/**
 * WYSIWYG-ish preview of Herstellung markers → Unterkapitel + Kästen.
 * Same parse path as PDF/ePub (`parseSachbuchLayoutBlocks`).
 */

import {
  parseSachbuchLayoutBlocks,
  sachbuchBoxChromeTitle,
  sachbuchLayoutBoxLabel,
  type SachbuchLayoutBoxKind,
} from "@/lib/sachbuch/herstellung-markup";
import { cn } from "@/lib/utils";

const BOX_STYLE: Record<SachbuchLayoutBoxKind, string> = {
  onepager: "border-orange-200 bg-orange-50/80",
  merksatz: "border-amber-200 bg-amber-50/90",
  infobox: "border-sky-200 bg-sky-50/80",
  schaubild: "border-violet-200 bg-violet-50/70",
};

function proseParas(text: string): string[] {
  const chunks = text
    .replace(/\r\n/g, "\n")
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  const out: string[] = [];
  for (const chunk of chunks) {
    const lines = chunk.split("\n").map((l) => l.trim()).filter(Boolean);
    const listish =
      lines.length > 1 &&
      lines.every((l) => /^(?:[•\-–—]|\d+[.)])\s+/.test(l));
    if (listish || (lines.length === 1 && /^(?:[•\-–—]|\d+[.)])\s+/.test(lines[0]!))) {
      for (const l of lines) out.push(l);
    } else {
      out.push(chunk.replace(/\s+/g, " ").trim());
    }
  }
  return out;
}

export function SachbuchHerstellungPreview({ text }: { text: string }) {
  const blocks = parseSachbuchLayoutBlocks(text);
  if (!blocks.length) {
    return (
      <p className="text-sm font-semibold text-zinc-500">Kein Text.</p>
    );
  }

  return (
    <div className="space-y-4 text-sm leading-relaxed text-zinc-800">
      {blocks.map((b, i) => {
        if (b.type === "heading") {
          return (
            <h4
              key={`h-${i}`}
              className="scroll-mt-4 border-b border-zinc-200 pb-1 text-base font-extrabold text-zinc-950"
            >
              {b.text}
            </h4>
          );
        }
        if (b.type === "box") {
          const head = sachbuchBoxChromeTitle(b.kind, b.title);
          const kindLabel = sachbuchLayoutBoxLabel(b.kind);
          return (
            <aside
              key={`b-${i}`}
              className={cn(
                "rounded-2xl border px-4 py-3 shadow-sm",
                BOX_STYLE[b.kind],
              )}
            >
              {b.title.trim() && b.title.trim() !== kindLabel ? (
                <p className="text-[10px] font-extrabold tracking-wide text-zinc-500 uppercase">
                  {kindLabel}
                </p>
              ) : null}
              <p className="text-xs font-extrabold tracking-wide text-zinc-600 uppercase">
                {head}
              </p>
              <div className="mt-3.5 space-y-2">
                {proseParas(b.body).map((p, j) => (
                  <p key={`box-${i}-p-${j}`} className="font-semibold">
                    {p}
                  </p>
                ))}
              </div>
            </aside>
          );
        }
        return (
          <div key={`p-${i}`} className="space-y-3">
            {proseParas(b.text).map((p, j) => (
              <p key={`prose-${i}-p-${j}`} className="font-semibold">
                {p}
              </p>
            ))}
          </div>
        );
      })}
    </div>
  );
}
