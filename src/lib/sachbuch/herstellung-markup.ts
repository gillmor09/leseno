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
  return dedupeSachbuchLayoutBlocks(blocks);
}

function splitParas(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function joinParas(paras: string[]): string {
  return paras.join("\n\n");
}

function normKey(s: string): string {
  return s
    .toLowerCase()
    .replace(/[„“”"']/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Drop box-body lead-ins that only repeat the chrome title
 * ("Merksatz: …", "Infobox: Titel", first para === title).
 */
export function dedupeSachbuchBoxBody(
  kind: SachbuchLayoutBoxKind,
  title: string,
  body: string,
): string {
  const label = sachbuchLayoutBoxLabel(kind);
  const titleTrim = title.trim();
  let paras = splitParas(body);
  if (!paras.length) return body.trim();

  const kindLead: Record<SachbuchLayoutBoxKind, RegExp> = {
    merksatz: /^Merksatz:\s*/i,
    infobox: /^Infobox:\s*/i,
    schaubild: /^(Schaubild|Die\s+.+?\s+auf einen Blick)[:.]?\s*/i,
    onepager:
      /^(One-?Pager|Blatt für den Montagmorgen|Ihr Blatt für den Montagmorgen|Ihr Kapitel-Artefakt[^:]*|Vorlage|Projektplan)[:.]?\s*/i,
  };

  // Strip "Merksatz:" / "Infobox:" from first para (keep the rest).
  const lead = kindLead[kind];
  if (lead.test(paras[0]!)) {
    const rest = paras[0]!.replace(lead, "").trim();
    if (!rest) paras = paras.slice(1);
    else paras[0] = rest;
  }

  // Drop / trim first para if it only restates the box title / label.
  if (paras.length && titleTrim) {
    const raw0 = paras[0]!;
    const p0 = normKey(raw0);
    const t = normKey(titleTrim);
    const titleWords = new Set(t.split(" ").filter((w) => w.length > 2));
    const paraWords = p0.split(" ").filter((w) => w.length > 2);
    const overlap =
      titleWords.size === 0
        ? 0
        : paraWords.filter((w) => titleWords.has(w)).length / titleWords.size;
    const nearExact =
      p0 === t ||
      p0 === normKey(`${label}: ${titleTrim}`) ||
      p0 === normKey(`Infobox: ${titleTrim}`) ||
      p0 === normKey(`Schaubild: ${titleTrim}`) ||
      (p0.startsWith(t) && raw0.length <= titleTrim.length + 28);
    // Near-duplicate banner before real body (e.g. Infobox title + "im Überblick").
    const bannerEcho =
      overlap >= 0.7 &&
      raw0.length <= Math.max(titleTrim.length + 48, 110) &&
      paras.length > 1;
    if (nearExact || bannerEcho) {
      paras = paras.slice(1);
    } else if (overlap >= 0.7 && p0.startsWith(t)) {
      // Same title then continuation in one paragraph — keep the tail.
      const stripped = stripHeadingEchoFromProse(titleTrim, raw0);
      if (stripped && normKey(stripped) !== p0) paras[0] = stripped;
    }
  }

  return joinParas(paras);
}

/**
 * Display title for a box chrome line (no "Infobox: Infobox").
 * Merksatz without title → "Merksatz"; titled boxes → title only (kind via style).
 */
export function sachbuchBoxChromeTitle(
  kind: SachbuchLayoutBoxKind,
  title: string,
): string {
  const t = title.trim();
  if (t) return t;
  return sachbuchLayoutBoxLabel(kind);
}

/** Remove Unterkapitel echo from the following prose block. */
export function stripHeadingEchoFromProse(
  heading: string,
  prose: string,
): string {
  const h = heading.trim();
  if (!h) return prose;
  let t = prose.trimStart();
  const hn = normKey(h);
  // Whole first paragraph is the heading (or heading + thin suffix).
  const paras = splitParas(t);
  if (paras.length) {
    const p0 = normKey(paras[0]!);
    if (p0 === hn || (p0.startsWith(hn) && p0.length <= hn.length + 16)) {
      return joinParas(paras.slice(1));
    }
  }
  // Same sentence continues after the heading words.
  if (normKey(t).startsWith(hn)) {
    // Slice by original casing length where possible.
    if (t.startsWith(h)) {
      t = t.slice(h.length).replace(/^[:.\s—–\-]+/, "").trimStart();
    } else {
      // Case-insensitive: drop matching prefix word-by-word.
      const hWords = h.split(/\s+/);
      const tWords = t.split(/\s+/);
      let i = 0;
      while (
        i < hWords.length &&
        i < tWords.length &&
        normKey(hWords[i]!) === normKey(tWords[i]!)
      ) {
        i += 1;
      }
      if (i >= Math.min(3, hWords.length)) {
        t = tWords.slice(i).join(" ").replace(/^[:.\s—–\-]+/, "").trimStart();
      }
    }
  }
  return t;
}

/**
 * Remove redundant titles between chrome / Unterkapitel and body text.
 * Applied at the end of parse so PDF, ePub and preview stay in sync.
 */
export function dedupeSachbuchLayoutBlocks(
  blocks: SachbuchLayoutBlock[],
): SachbuchLayoutBlock[] {
  const out: SachbuchLayoutBlock[] = [];
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i]!;
    if (b.type === "box") {
      out.push({
        ...b,
        body: dedupeSachbuchBoxBody(b.kind, b.title, b.body),
      });
      continue;
    }
    if (b.type === "heading") {
      out.push(b);
      const next = blocks[i + 1];
      if (next?.type === "prose") {
        const stripped = stripHeadingEchoFromProse(b.text, next.text);
        blocks[i + 1] = { type: "prose", text: stripped };
      }
      continue;
    }
    if (b.type === "prose" && !b.text.trim()) continue;
    out.push(b);
  }
  return out;
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

  const proseParas = (body: string) => {
    // Keep blank-line paragraphs; also keep single-newline list rows (• / - / 1.).
    const chunks = body
      .replace(/\r\n/g, "\n")
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .filter(Boolean);
    return chunks
      .map((chunk) => {
        const lines = chunk.split("\n").map((l) => l.trim()).filter(Boolean);
        const listish =
          lines.length > 1 &&
          lines.every((l) => /^(?:[•\-–—]|\d+[.)])\s+/.test(l));
        if (listish) {
          const items = lines
            .map((l) => l.replace(/^(?:[•\-–—]|\d+[.)])\s+/, "").trim())
            .map((l) => `<li>${escapeXml(l)}</li>`)
            .join("\n  ");
          return `<ul>\n  ${items}\n</ul>`;
        }
        return `<p>${escapeXml(chunk.replace(/\s+/g, " "))}</p>`;
      })
      .join("\n");
  };

  return blocks
    .map((b) => {
      if (b.type === "heading") {
        return `<h2 class="unterkapitel">${escapeXml(b.text)}</h2>`;
      }
      if (b.type === "box") {
        const head = sachbuchBoxChromeTitle(b.kind, b.title);
        const kind = sachbuchLayoutBoxLabel(b.kind);
        const kindLine =
          b.title.trim() && b.title.trim() !== kind
            ? `<p class="box-kind">${escapeXml(kind)}</p>\n  `
            : "";
        return `<aside class="sachbuch-box sachbuch-box-${b.kind}">
  ${kindLine}<h3>${escapeXml(head)}</h3>
  ${proseParas(b.body)}
</aside>`;
      }
      return proseParas(b.text);
    })
    .filter(Boolean)
    .join("\n");
}
