/**
 * Print/layout markers for Sachbuch Herstellung (Haiku → PDF/ePub).
 * Markers are ASCII-stable so models and exports share one convention.
 *
 * <<<H>>> Zwischenüberschrift
 * <<<BOX onepager Titel>>> … <<<END BOX>>>
 * <<<BOX merksatz>>> … <<<END BOX>>>
 * <<<BOX infobox Titel>>> … <<<END BOX>>>
 * <<<BOX schaubild Titel>>> … <<<END BOX>>>
 */

export const SACHBUCH_LAYOUT_BOX_KINDS = [
  "onepager",
  "merksatz",
  "infobox",
  "schaubild",
] as const;

export type SachbuchLayoutBoxKind =
  (typeof SACHBUCH_LAYOUT_BOX_KINDS)[number];

export type SachbuchLayoutBlock =
  | { type: "prose"; text: string }
  | { type: "heading"; text: string }
  | {
      type: "box";
      kind: SachbuchLayoutBoxKind;
      title: string;
      body: string;
    };

const H_RE = /^<<<H>>>\s*(.+?)\s*$/i;
const BOX_OPEN_RE = /^<<<BOX\s+(\w+)(?:\s+(.+?))?\s*>>>\s*$/i;
const BOX_CLOSE_RE = /^<<<END\s+BOX>>>\s*$/i;

const BOX_KIND_SET = new Set<string>(SACHBUCH_LAYOUT_BOX_KINDS);

const BOX_LABEL_DE: Record<SachbuchLayoutBoxKind, string> = {
  onepager: "One-Pager",
  merksatz: "Merksatz",
  infobox: "Infobox",
  schaubild: "Schaubild",
};

/** German label for a layout box kind (PDF/ePub title fallback). */
export function sachbuchLayoutBoxLabel(kind: SachbuchLayoutBoxKind): string {
  return BOX_LABEL_DE[kind];
}

/** True when Herstellung markers are present. */
export function hasSachbuchLayoutMarkup(text: string): boolean {
  return /<<<H>>>|<<<BOX\s+/i.test(text);
}

function normalizeBoxKind(raw: string): SachbuchLayoutBoxKind | null {
  const k = raw.trim().toLowerCase();
  if (BOX_KIND_SET.has(k)) return k as SachbuchLayoutBoxKind;
  return null;
}

/**
 * Split Herstellung text into prose / Zwischenüberschriften / Kästen.
 * Unknown lines stay prose; unclosed boxes flush as prose.
 */
export function parseSachbuchLayoutBlocks(text: string): SachbuchLayoutBlock[] {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const blocks: SachbuchLayoutBlock[] = [];
  let proseBuf: string[] = [];
  let box: {
    kind: SachbuchLayoutBoxKind;
    title: string;
    lines: string[];
  } | null = null;

  const flushProse = () => {
    const t = proseBuf.join("\n").trim();
    proseBuf = [];
    if (t) blocks.push({ type: "prose", text: t });
  };

  for (const line of lines) {
    if (box) {
      if (BOX_CLOSE_RE.test(line.trim())) {
        blocks.push({
          type: "box",
          kind: box.kind,
          title: box.title,
          body: box.lines.join("\n").trim(),
        });
        box = null;
        continue;
      }
      box.lines.push(line);
      continue;
    }

    const trimmed = line.trim();
    const h = trimmed.match(H_RE);
    if (h) {
      flushProse();
      const title = h[1]!.trim();
      if (title) blocks.push({ type: "heading", text: title });
      continue;
    }

    const open = trimmed.match(BOX_OPEN_RE);
    if (open) {
      const kind = normalizeBoxKind(open[1] ?? "");
      if (kind) {
        flushProse();
        box = {
          kind,
          title: (open[2] ?? "").trim(),
          lines: [],
        };
        continue;
      }
    }

    proseBuf.push(line);
  }

  if (box) {
    // Unclosed: treat as prose so content is not lost.
    proseBuf.push(`<<<BOX ${box.kind}${box.title ? ` ${box.title}` : ""}>>>`);
    proseBuf.push(...box.lines);
  }
  flushProse();
  return blocks;
}

/** Strip layout markers for word-count / length checks. */
export function stripSachbuchLayoutMarkup(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/^<<<H>>>\s*/gim, "")
    .replace(/^<<<BOX\s+\w+(?:\s+.+?)?\s*>>>\s*$/gim, "")
    .replace(/^<<<END\s+BOX>>>\s*$/gim, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Human notes derived from markers (UI / book summary). */
export function summarizeSachbuchLayoutMarkup(text: string): string[] {
  const blocks = parseSachbuchLayoutBlocks(text);
  const notes: string[] = [];
  let headings = 0;
  const boxes: Record<SachbuchLayoutBoxKind, number> = {
    onepager: 0,
    merksatz: 0,
    infobox: 0,
    schaubild: 0,
  };
  for (const b of blocks) {
    if (b.type === "heading") {
      headings += 1;
      notes.push(`Unterkapitel: ${b.text}`);
    } else if (b.type === "box") {
      boxes[b.kind] += 1;
      const label = sachbuchLayoutBoxLabel(b.kind);
      notes.push(b.title ? `${label}: ${b.title}` : label);
    }
  }
  if (headings === 0 && Object.values(boxes).every((n) => n === 0)) {
    return ["Keine Layout-Marker gesetzt."];
  }
  return [
    `${headings} Unterkapitel · ${boxes.onepager} One-Pager · ${boxes.merksatz} Merksätze · ${boxes.infobox} Infoboxen · ${boxes.schaubild} Schaubilder`,
    ...notes.slice(0, 12),
  ];
}

/** ePub/XHTML fragment for Herstellung body (markers → h2 / aside). */
export function sachbuchLayoutBlocksToXhtml(
  text: string,
  escapeXml: (s: string) => string,
): string {
  const blocks = parseSachbuchLayoutBlocks(text);
  if (!blocks.length) return "";

  const proseParas = (body: string) =>
    body
      .split(/\n\s*\n/)
      .map((p) => p.replace(/\s+/g, " ").trim())
      .filter(Boolean)
      .map(
        (p) =>
          `<p>${escapeXml(p).replaceAll("\n", "<br />")}</p>`,
      )
      .join("\n");

  return blocks
    .map((b) => {
      if (b.type === "heading") {
        return `<h2 class="unterkapitel">${escapeXml(b.text)}</h2>`;
      }
      if (b.type === "box") {
        const label = sachbuchLayoutBoxLabel(b.kind);
        const title = b.title.trim() || label;
        const head =
          b.title.trim() && b.title.trim() !== label
            ? `${label}: ${b.title.trim()}`
            : title;
        return `<aside class="sachbuch-box sachbuch-box-${b.kind}">
  <h3>${escapeXml(head)}</h3>
  ${proseParas(b.body)}
</aside>`;
      }
      return proseParas(b.text);
    })
    .filter(Boolean)
    .join("\n");
}
