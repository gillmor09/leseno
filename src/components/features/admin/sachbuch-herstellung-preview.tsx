/**
 * WYSIWYG-ish preview of Herstellung markers → Unterkapitel + Kästen + Figuren.
 * Same parse path as PDF/ePub (`parseSachbuchLayoutBlocks` + figure keys).
 * Bezeichnung lives on the graphic / in the Kasten — no extra caption under images.
 */

import type { ReactNode } from "react";
import {
  sachbuchFigureByKey,
  sachbuchFigureKeyFromText,
  splitProseAroundFigureCaption,
  stripKnownFigureCaptions,
  type SachbuchFigure,
} from "@/lib/sachbuch/figures";
import {
  parseSachbuchLayoutBlocks,
  sachbuchBoxChromeTitle,
  splitSachbuchProseLeadingSubtitle,
  type SachbuchLayoutBoxKind,
} from "@/lib/sachbuch/herstellung-markup";
import { cn } from "@/lib/utils";

const BOX_STYLE: Record<SachbuchLayoutBoxKind, string> = {
  onepager: "border-orange-200 bg-orange-50/80",
  merksatz: "border-zinc-200 bg-zinc-100",
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

function FigureImage({ figure }: { figure: SachbuchFigure }) {
  return (
    <figure className="my-3 mb-5 overflow-hidden rounded-2xl bg-white ring-1 ring-zinc-950/10">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={figure.dataUrl}
        alt={figure.title || "Abbildung"}
        className="mx-auto max-h-[48vh] w-auto max-w-full object-contain"
      />
    </figure>
  );
}

function ProseWithFigures({
  text,
  figures,
  usedKeys,
}: {
  text: string;
  figures: SachbuchFigure[];
  usedKeys: Set<string>;
}) {
  const nodes: ReactNode[] = [];
  proseParas(text).forEach((p, j) => {
    const parts = splitProseAroundFigureCaption(p);
    if (!parts.figureKey) {
      nodes.push(
        <p key={`p-${j}`} className="font-semibold">
          {p}
        </p>,
      );
      return;
    }
    if (parts.before) {
      nodes.push(
        <p key={`p-${j}-b`} className="font-semibold">
          {parts.before}
        </p>,
      );
    }
    const fig = sachbuchFigureByKey(figures, parts.figureKey);
    if (fig && !usedKeys.has(fig.key)) {
      usedKeys.add(fig.key);
      nodes.push(<FigureImage key={`p-${j}-f`} figure={fig} />);
    } else if (!fig && parts.caption) {
      // No graphic — keep the manuscript caption as prose.
      nodes.push(
        <p key={`p-${j}-c`} className="font-semibold">
          {parts.caption}
        </p>,
      );
    }
    // Graphic already placed elsewhere: omit caption (title is on the art).
    if (parts.after) {
      nodes.push(
        <p key={`p-${j}-a`} className="font-semibold">
          {parts.after}
        </p>,
      );
    }
  });
  return <div className="space-y-3">{nodes}</div>;
}

export function SachbuchHerstellungPreview({
  text,
  figures = [],
}: {
  text: string;
  /** Kapitel-Abbildungen / Tabellen (wie im Export). */
  figures?: SachbuchFigure[];
}) {
  const blocks = parseSachbuchLayoutBlocks(text);
  const usedKeys = new Set<string>();

  if (!blocks.length) {
    return (
      <p className="text-sm font-semibold text-zinc-500">Kein Text.</p>
    );
  }

  return (
    <div className="space-y-4 text-sm leading-relaxed text-zinc-800">
      {blocks.map((b, i) => {
        if (b.type === "heading") {
          const next = blocks[i + 1];
          const subtitle =
            next?.type === "prose"
              ? splitSachbuchProseLeadingSubtitle(next.text).subtitle
              : null;
          return (
            <div
              key={`h-${i}`}
              className="scroll-mt-4 space-y-0.5 border-b border-zinc-300 pt-2 pb-2"
            >
              <h4 className="text-lg font-extrabold tracking-tight text-zinc-950">
                {b.text}
              </h4>
              {subtitle ? (
                <p className="text-[0.95rem] font-bold text-zinc-600">
                  {subtitle}
                </p>
              ) : null}
            </div>
          );
        }
        if (b.type === "box") {
          const head = sachbuchBoxChromeTitle(b.kind, b.title);
          const boxKey =
            sachbuchFigureKeyFromText(`${b.title} ${b.body.slice(0, 400)}`) ||
            sachbuchFigureKeyFromText(b.body);
          // Caption line → graphic after the Kasten (same as PDF); omit caption text.
          const bodySansCaptions = stripKnownFigureCaptions(b.body, (key) =>
            Boolean(sachbuchFigureByKey(figures, key)),
          );
          const boxFig =
            boxKey && !usedKeys.has(boxKey)
              ? sachbuchFigureByKey(figures, boxKey)
              : undefined;
          if (boxFig) usedKeys.add(boxFig.key);
          return (
            <div key={`b-${i}`} className="space-y-3">
              <aside
                className={cn(
                  "rounded-2xl border px-4 py-3.5 shadow-sm",
                  BOX_STYLE[b.kind],
                )}
              >
                {head ? (
                  <p className="text-sm font-extrabold text-zinc-900">{head}</p>
                ) : null}
                <div className={cn("space-y-2", head && "mt-2.5")}>
                  <ProseWithFigures
                    text={bodySansCaptions}
                    figures={figures}
                    usedKeys={usedKeys}
                  />
                </div>
              </aside>
              {boxFig ? <FigureImage figure={boxFig} /> : null}
            </div>
          );
        }
        const prev = blocks[i - 1];
        const proseText =
          prev?.type === "heading"
            ? splitSachbuchProseLeadingSubtitle(b.text).rest
            : b.text;
        if (!proseText.trim()) return null;
        return (
          <ProseWithFigures
            key={`p-${i}`}
            text={proseText}
            figures={figures}
            usedKeys={usedKeys}
          />
        );
      })}
      {figures
        .filter((f) => !usedKeys.has(f.key))
        .map((f) => (
          <FigureImage key={`tail-${f.key}`} figure={f} />
        ))}
    </div>
  );
}
