/**
 * Amazon/KDP-oriented EPUB 3 export from Manuskript chapters
 * (or legacy revised scenes). Reflowable XHTML; no book cover image
 * (PDF keeps the cover). Clever: chapter Infografik + Abenteuer-Wissen
 * after prose. Client-side via JSZip.
 */

import JSZip from "jszip";
import {
  abenteuerWissenExportLines,
} from "@/lib/roman/clever-geschichte";
import {
  emptyVorsatz,
  hasUsableVorsatz,
  type RomanVorsatz,
} from "@/lib/roman/front-matter";
import {
  formatManuskriptChapterHeading,
  type PlotChapter,
} from "@/lib/roman/plot-chapters";
import {
  resolveExportChapters,
  type RomanExportChapter,
  type RomanExportScene,
} from "@/lib/roman/export-roman-pdf";

export type RomanEpubInput = {
  title: string;
  /** Creator / author line. */
  autorName: string;
  language?: string;
  vorsatz?: RomanVorsatz;
  /** Manuskript chapters (preferred). */
  chapters?: RomanExportChapter[];
  /** Legacy: revised scenes grouped into chapters. */
  szenen?: RomanExportScene[];
};

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function slugifyFilename(title: string): string {
  const base = title
    .trim()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return base || "roman";
}

export function romanEpubFilename(title: string): string {
  return `${slugifyFilename(title)}.epub`;
}

function chapterHeadingLabel(chapter: RomanExportChapter): string {
  return formatManuskriptChapterHeading({
    number: chapter.number,
    title: chapter.title,
    body: "",
  } satisfies PlotChapter);
}

function paragraphsToXhtml(text: string): string {
  const parts = text
    .replace(/\r\n/g, "\n")
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  if (!parts.length) return "<p>&#160;</p>";
  return parts.map((p) => `<p>${escapeXml(p)}</p>`).join("\n");
}

function plainLinesToXhtml(text: string): string {
  const lines = text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  if (!lines.length) return "<p>&#160;</p>";
  return lines.map((l) => `<p>${escapeXml(l)}</p>`).join("\n");
}

function xhtmlDoc(title: string, body: string, cssHref = "styles.css"): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="de" xml:lang="de">
<head>
  <meta charset="UTF-8" />
  <title>${escapeXml(title)}</title>
  <link rel="stylesheet" type="text/css" href="${cssHref}" />
</head>
<body>
${body}
</body>
</html>`;
}

/** Chapter heading one type step above body, bold; one blank line before prose. */
const EPUB_CSS = `body {
  font-family: serif;
  font-size: 1em;
  line-height: 1.5;
  margin: 1em;
}
h1 {
  font-size: 1.6em;
  font-weight: bold;
  text-align: center;
  margin: 2em 0 1em;
  page-break-before: always;
}
h1.chapter {
  font-size: 1.15em;
  font-weight: bold;
  text-align: left;
  margin: 0 0 1em;
  page-break-before: always;
}
.subtitle, .author, .imprint {
  text-align: center;
  margin: 0.4em 0;
}
.author { font-size: 1.15em; margin-top: 1.5em; }
.imprint { font-size: 0.9em; color: #444; margin-top: 2em; }
.copyright p, .dedication p, .epigraph p {
  margin: 0.75em 0;
}
.dedication, .epigraph {
  margin-top: 30%;
  text-align: center;
}
.epigraph p { font-style: italic; }
p {
  margin: 0 0 0.85em;
  text-indent: 1.2em;
  text-align: left;
}
.titlepage p, .copyright p, .dedication p, .epigraph p, h1.chapter + p {
  text-indent: 0;
}
.infografik {
  margin: 0;
  padding: 0;
  text-align: center;
  text-indent: 0;
  page-break-before: always;
  page-break-after: always;
  break-before: page;
  break-after: page;
}
.infografik img {
  display: block;
  width: 100%;
  max-width: none;
  height: auto;
}
.abenteuer-wissen {
  margin: 1.25em 0 0;
  padding: 1em 1.1em;
  background: #f5fdf9;
  border: 1px solid #d1fae5;
  border-radius: 0.75em;
  page-break-inside: avoid;
}
.abenteuer-wissen h2 {
  font-size: 1em;
  font-weight: bold;
  margin: 0 0 0.35em;
  text-indent: 0;
  color: #c2410c;
}
.abenteuer-wissen .hint {
  font-size: 0.95em;
  margin: 0 0 1.25em;
  text-indent: 0;
  color: #a16207;
}
.abenteuer-wissen ol {
  margin: 0;
  padding-left: 1.4em;
  list-style: none;
}
.abenteuer-wissen li {
  margin: 0 0 1.25em;
  text-indent: 0;
  text-align: left;
  padding-left: 0.2em;
  font-size: 14pt;
}
.abenteuer-wissen li:last-child {
  margin-bottom: 0;
}
.abenteuer-wissen li::before {
  content: "✓ ";
  color: #16a34a;
  font-weight: bold;
}
.toc {
  page-break-before: always;
  page-break-after: always;
}
.toc h1 {
  font-size: 1.4em;
  font-weight: bold;
  text-align: left;
  margin: 0 0 1em;
  page-break-before: avoid;
}
.toc ol {
  margin: 0;
  padding: 0;
  list-style: none;
}
.toc li {
  margin: 0;
  text-indent: 0;
  line-height: 2;
}
.toc a {
  color: #9a3412;
  font-weight: bold;
  text-decoration: none;
  line-height: 2;
}
`;

type SpineItem = {
  id: string;
  href: string;
  title: string;
  landmark?: "titlepage" | "bodymatter" | "toc";
};

type ManifestExtra = {
  id: string;
  href: string;
  mediaType: string;
};

function parseImageDataUrl(dataUrl: string): {
  mediaType: string;
  ext: string;
  bytes: Uint8Array;
} | null {
  const m = /^data:(image\/(jpeg|jpg|png|webp));base64,(.+)$/i.exec(
    dataUrl.trim(),
  );
  if (!m) return null;
  const mediaType = m[1]!.toLowerCase().replace("image/jpg", "image/jpeg");
  const kind = m[2]!.toLowerCase();
  const ext = kind === "jpg" || kind === "jpeg" ? "jpg" : kind;
  try {
    const bin = atob(m[3]!);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return { mediaType, ext, bytes };
  } catch {
    return null;
  }
}

function chapterBodyXhtml(
  chapter: RomanExportChapter,
  imageHref: string | null,
): string {
  const parts: string[] = [
    `<h1 class="chapter">${escapeXml(chapterHeadingLabel(chapter))}</h1>`,
    paragraphsToXhtml(chapter.body),
  ];
  if (imageHref) {
    parts.push(
      `<div class="infografik"><img src="${escapeXml(imageHref)}" alt="Infografik" /></div>`,
    );
  }
  const fakten = abenteuerWissenExportLines(
    chapter.abenteuerWissenFakten ?? [],
  );
  if (fakten.length > 0) {
    parts.push(`<aside class="abenteuer-wissen">
  <h2>💡 Abenteuer-Wissen</h2>
  <p class="hint">Was du aus diesem Abenteuer mitnimmst:</p>
  <ol>
${fakten
  .map((line) => {
    const text = line.replace(/^\d+\.\s*/, "");
    return `    <li>${escapeXml(text)}</li>`;
  })
  .join("\n")}
  </ol>
</aside>`);
  }
  return `<section epub:type="chapter">
  ${parts.join("\n  ")}
</section>`;
}

/**
 * Builds a reflowable EPUB 3 blob (Manuskript, ohne Buch-Cover).
 */
export async function buildRomanEpubBlob(
  input: RomanEpubInput,
): Promise<Blob> {
  const chapters = resolveExportChapters(input);
  if (!chapters.length) {
    throw new Error("Noch kein Manuskript für das EPUB.");
  }

  const vorsatz = input.vorsatz ?? emptyVorsatz();
  const title =
    vorsatz.titelseite.titel.trim() ||
    input.title.trim() ||
    "Unbenannter Roman";
  const author =
    vorsatz.titelseite.autor.trim() ||
    input.autorName.trim() ||
    "Autor:in";
  const language = (input.language ?? "de").trim() || "de";
  const bookId = `urn:uuid:${
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`
  }`;
  const modified = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");

  const zip = new JSZip();
  zip.file("mimetype", "application/epub+zip", { compression: "STORE" });
  zip.file(
    "META-INF/container.xml",
    `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`,
  );

  const oebps = zip.folder("OEBPS");
  if (!oebps) throw new Error("EPUB-Ordner konnte nicht angelegt werden.");

  oebps.file("styles.css", EPUB_CSS);

  const spine: SpineItem[] = [];
  const manifestExtra: ManifestExtra[] = [];

  if (hasUsableVorsatz(vorsatz) || title) {
    const t = vorsatz.titelseite;
    const body = `<section class="titlepage" epub:type="titlepage">
  <h1>${escapeXml(t.titel.trim() || title)}</h1>
  ${
    t.untertitel.trim()
      ? `<p class="subtitle">${escapeXml(t.untertitel.trim())}</p>`
      : ""
  }
  <p class="author">${escapeXml(t.autor.trim() || author)}</p>
  ${
    t.imprint.trim()
      ? `<p class="imprint">${escapeXml(t.imprint.trim())}</p>`
      : ""
  }
</section>`;
    oebps.file("titlepage.xhtml", xhtmlDoc(title, body));
    spine.push({
      id: "titlepage",
      href: "titlepage.xhtml",
      title: "Titelseite",
      landmark: "titlepage",
    });

    const imp = vorsatz.impressum;
    const copyrightBlocks: string[] = [];
    if (imp.hinweis.trim()) {
      copyrightBlocks.push(imp.hinweis.trim());
    } else if (imp.rechteinhaber.trim() || author) {
      copyrightBlocks.push(
        `© ${imp.jahr.trim() || String(new Date().getFullYear())} ${
          imp.rechteinhaber.trim() || author
        }. Alle Rechte vorbehalten.`,
      );
    }
    if (imp.disclaimer.trim()) copyrightBlocks.push(imp.disclaimer.trim());
    if (copyrightBlocks.length) {
      oebps.file(
        "copyright.xhtml",
        xhtmlDoc(
          "Impressum",
          `<section class="copyright" epub:type="copyright-page">
  <h1>Impressum</h1>
  ${copyrightBlocks.map((b) => `<p>${escapeXml(b)}</p>`).join("\n")}
</section>`,
        ),
      );
      spine.push({
        id: "copyright",
        href: "copyright.xhtml",
        title: "Impressum",
      });
    }

    if (vorsatz.widmung.trim()) {
      oebps.file(
        "dedication.xhtml",
        xhtmlDoc(
          "Widmung",
          `<section class="dedication" epub:type="dedication">
  ${plainLinesToXhtml(vorsatz.widmung)}
</section>`,
        ),
      );
      spine.push({
        id: "dedication",
        href: "dedication.xhtml",
        title: "Widmung",
      });
    }

    if (vorsatz.motto.trim()) {
      oebps.file(
        "epigraph.xhtml",
        xhtmlDoc(
          "Motto",
          `<section class="epigraph" epub:type="epigraph">
  ${plainLinesToXhtml(vorsatz.motto)}
</section>`,
        ),
      );
      spine.push({
        id: "epigraph",
        href: "epigraph.xhtml",
        title: "Motto",
      });
    }
  }

  // Readable TOC page (clickable links) before chapter 1 — separate from nav.xhtml.
  {
    const tocItems = chapters
      .map((chapter) => {
        const href = `chapter-${String(chapter.number).padStart(2, "0")}.xhtml`;
        return `    <li><a href="${href}">${escapeXml(chapterHeadingLabel(chapter))}</a></li>`;
      })
      .join("\n");
    oebps.file(
      "toc.xhtml",
      xhtmlDoc(
        "Inhaltsverzeichnis",
        `<section class="toc" epub:type="toc">
  <h1>Inhaltsverzeichnis</h1>
  <ol>
${tocItems}
  </ol>
</section>`,
      ),
    );
    spine.push({
      id: "toc",
      href: "toc.xhtml",
      title: "Inhaltsverzeichnis",
      landmark: "toc",
    });
  }

  let firstChapter = true;
  for (const chapter of chapters) {
    const href = `chapter-${String(chapter.number).padStart(2, "0")}.xhtml`;
    const id = `chapter-${chapter.number}`;
    const chapterTitle = chapterHeadingLabel(chapter);

    let imageHref: string | null = null;
    const parsed = chapter.infografikDataUrl
      ? parseImageDataUrl(chapter.infografikDataUrl)
      : null;
    if (parsed) {
      const imgName = `infografik-${String(chapter.number).padStart(2, "0")}.${parsed.ext}`;
      oebps.file(imgName, parsed.bytes);
      imageHref = imgName;
      manifestExtra.push({
        id: `img-infografik-${chapter.number}`,
        href: imgName,
        mediaType: parsed.mediaType,
      });
    }

    oebps.file(href, xhtmlDoc(chapterTitle, chapterBodyXhtml(chapter, imageHref)));
    spine.push({
      id,
      href,
      title: chapterTitle,
      landmark: firstChapter ? "bodymatter" : undefined,
    });
    firstChapter = false;
  }

  const navToc = spine
    .filter(
      (s) =>
        s.id.startsWith("chapter-") ||
        s.id === "toc" ||
        s.landmark === "titlepage",
    )
    .map(
      (s) =>
        `    <li><a href="${s.href}">${escapeXml(s.title)}</a></li>`,
    )
    .join("\n");

  const navLandmarks = spine
    .filter((s) => s.landmark)
    .map((s) => {
      const type =
        s.landmark === "titlepage"
          ? "titlepage"
          : s.landmark === "toc"
            ? "toc"
            : "bodymatter";
      return `    <li><a epub:type="${type}" href="${s.href}">${escapeXml(s.title)}</a></li>`;
    })
    .join("\n");

  oebps.file(
    "nav.xhtml",
    `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="de" xml:lang="de">
<head>
  <meta charset="UTF-8" />
  <title>Inhalt</title>
  <link rel="stylesheet" type="text/css" href="styles.css" />
</head>
<body>
  <nav epub:type="toc" id="toc">
    <h1>Inhalt</h1>
    <ol>
${navToc}
    </ol>
  </nav>
  <nav epub:type="landmarks" id="landmarks" hidden="hidden">
    <h1>Landmarks</h1>
    <ol>
${navLandmarks}
    </ol>
  </nav>
</body>
</html>`,
  );

  const manifestXml = [
    `<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>`,
    `<item id="css" href="styles.css" media-type="text/css"/>`,
    ...spine.map(
      (s) =>
        `<item id="${s.id}" href="${s.href}" media-type="application/xhtml+xml"/>`,
    ),
    ...manifestExtra.map(
      (m) =>
        `<item id="${m.id}" href="${m.href}" media-type="${m.mediaType}"/>`,
    ),
  ].join("\n    ");

  const spineXml = spine.map((s) => `<itemref idref="${s.id}"/>`).join("\n    ");

  oebps.file(
    "content.opf",
    `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="BookId" xml:lang="${escapeXml(language)}">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="BookId">${escapeXml(bookId)}</dc:identifier>
    <dc:title>${escapeXml(title)}</dc:title>
    <dc:creator>${escapeXml(author)}</dc:creator>
    <dc:language>${escapeXml(language)}</dc:language>
    <dc:publisher>${escapeXml(
      vorsatz.titelseite.imprint.trim() || "Eigenverlag",
    )}</dc:publisher>
    <meta property="dcterms:modified">${modified}</meta>
  </metadata>
  <manifest>
    ${manifestXml}
  </manifest>
  <spine>
    ${spineXml}
  </spine>
</package>`,
  );

  const blob = await zip.generateAsync({
    type: "blob",
    mimeType: "application/epub+zip",
    compression: "DEFLATE",
    compressionOptions: { level: 9 },
  });

  if (blob.size < 200) {
    throw new Error("EPUB kam leer oder ungültig zurück.");
  }
  return blob;
}
