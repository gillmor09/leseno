/**
 * Amazon/KDP-oriented EPUB 3 export from revised roman scenes.
 * Reflowable XHTML + optional cover image; client-side via JSZip.
 */

import JSZip from "jszip";
import {
  emptyVorsatz,
  hasUsableVorsatz,
  type RomanVorsatz,
} from "@/lib/roman/front-matter";
import {
  collectRevisedScenes,
  type RomanExportScene,
} from "@/lib/roman/export-roman-pdf";

export type RomanEpubInput = {
  title: string;
  /** Creator / author line. */
  autorName: string;
  language?: string;
  vorsatz?: RomanVorsatz;
  coverImageDataUrl?: string;
  szenen: RomanExportScene[];
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

const EPUB_CSS = `body {
  font-family: serif;
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
  text-align: left;
  margin-top: 0;
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
  text-align: justify;
}
.titlepage p, .copyright p, .dedication p, .epigraph p, h1 + p {
  text-indent: 0;
}
.cover {
  text-align: center;
  margin: 0;
  padding: 0;
}
.cover img {
  max-width: 100%;
  height: auto;
}
`;

type CoverAsset = {
  path: string;
  mediaType: string;
  bytes: Uint8Array;
};

function parseCoverDataUrl(dataUrl: string): CoverAsset | null {
  const trimmed = dataUrl.trim();
  const match = /^data:(image\/(?:jpeg|jpg|png|webp));base64,(.+)$/i.exec(
    trimmed,
  );
  if (!match) return null;
  const mime = match[1]!.toLowerCase().replace("image/jpg", "image/jpeg");
  const b64 = match[2]!;
  try {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    const ext =
      mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg";
    return {
      path: `images/cover.${ext}`,
      mediaType: mime,
      bytes,
    };
  } catch {
    return null;
  }
}

type SpineItem = {
  id: string;
  href: string;
  title: string;
  landmark?: "cover" | "titlepage" | "bodymatter";
};

/**
 * Builds a reflowable EPUB 3 blob suitable for KDP upload / Kindle sideload.
 */
export async function buildRomanEpubBlob(
  input: RomanEpubInput,
): Promise<Blob> {
  const revised = collectRevisedScenes(input.szenen);
  if (!revised.length) {
    throw new Error("Noch keine revidierte Szene für das EPUB.");
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

  const cover = input.coverImageDataUrl
    ? parseCoverDataUrl(input.coverImageDataUrl)
    : null;

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
  const manifestExtra: string[] = [];

  if (cover) {
    oebps.file(cover.path, cover.bytes);
    manifestExtra.push(
      `<item id="cover-image" href="${cover.path}" media-type="${cover.mediaType}" properties="cover-image"/>`,
    );
    oebps.file(
      "cover.xhtml",
      xhtmlDoc(
        "Cover",
        `<section class="cover" epub:type="cover">
  <img src="${cover.path}" alt="Cover: ${escapeXml(title)}" />
</section>`,
      ),
    );
    spine.push({
      id: "cover",
      href: "cover.xhtml",
      title: "Cover",
      landmark: "cover",
    });
  }

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

  const byChapter = new Map<number, RomanExportScene[]>();
  for (const scene of revised) {
    const list = byChapter.get(scene.kapitelNr) ?? [];
    list.push(scene);
    byChapter.set(scene.kapitelNr, list);
  }

  let firstChapter = true;
  for (const [kapitelNr, scenes] of byChapter) {
    const href = `chapter-${String(kapitelNr).padStart(2, "0")}.xhtml`;
    const id = `chapter-${kapitelNr}`;
    const chapterTitle = `Kapitel ${kapitelNr}`;
    const bodyParts = scenes
      .map((s) => paragraphsToXhtml(s.entwurfRevidiert))
      .join("\n");
    oebps.file(
      href,
      xhtmlDoc(
        chapterTitle,
        `<section epub:type="chapter">
  <h1 class="chapter">${escapeXml(chapterTitle)}</h1>
  ${bodyParts}
</section>`,
      ),
    );
    spine.push({
      id,
      href,
      title: chapterTitle,
      landmark: firstChapter ? "bodymatter" : undefined,
    });
    firstChapter = false;
  }

  const navToc = spine
    .filter((s) => s.id.startsWith("chapter-") || s.landmark === "titlepage")
    .map(
      (s) =>
        `    <li><a href="${s.href}">${escapeXml(s.title)}</a></li>`,
    )
    .join("\n");

  const navLandmarks = spine
    .filter((s) => s.landmark)
    .map((s) => {
      const type =
        s.landmark === "cover"
          ? "cover"
          : s.landmark === "titlepage"
            ? "titlepage"
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
    ...manifestExtra,
    ...spine.map(
      (s) =>
        `<item id="${s.id}" href="${s.href}" media-type="application/xhtml+xml"/>`,
    ),
  ].join("\n    ");

  const spineXml = spine.map((s) => `<itemref idref="${s.id}"/>`).join("\n    ");

  const metaCover = cover
    ? `<meta name="cover" content="cover-image"/>`
    : "";

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
    ${metaCover}
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
