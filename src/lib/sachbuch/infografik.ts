/**
 * Sachbuch chapter Infografiken via Napkin AI (Herstellung).
 * Full-page business diagrams after chapter prose in PDF/ePub.
 * Auth: `NAPKIN_API_KEY`. Briefs are curated for Management-Sachbücher.
 */

import { createCanvas, loadImage } from "@napi-rs/canvas";
import { generateNapkinVisual } from "@/lib/ai/napkin";
import { assertSachbuchGuideAllows } from "@/lib/sachbuch/guide";
import {
  getSachbuchKontext,
  patchSachbuchKapitel,
} from "@/lib/sachbuch/repository";
import type { SachbuchKontext } from "@/lib/sachbuch/types";

export const SACHBUCH_INFOGRAFIK_SIZE = {
  width: 1200,
  height: 1800,
} as const;

/** Provider label for wait dialogs / admin UI. */
export const SACHBUCH_INFOGRAFIK_PROVIDER_LABEL = "Napkin AI";

export type SachbuchInfografikBrief = {
  /** 0-based chapter index. */
  kapitelIndex: number;
  title: string;
  /** Concrete layout instructions for the visual engine. */
  layoutBrief: string;
};

/**
 * High-value Infografik slots (index-based; works for 5+ chapter books).
 * Skip chapters without a clear diagram job by not listing them.
 */
export function sachbuchInfografikBriefsForBook(
  book: SachbuchKontext,
): SachbuchInfografikBrief[] {
  const n = book.kapitel.length;
  const briefs: SachbuchInfografikBrief[] = [];

  if (n >= 1) {
    briefs.push({
      kapitelIndex: 0,
      title: "Drei Kern-KPIs der unsichtbaren Kosten",
      layoutBrief: `Infografik-Titel: „Unsichtbare Kosten sichtbar machen“
Drei große Karten untereinander oder im Dreieck:
1) Datenhygiene-Quote (Data Health Rate) — Ziel > 85 %
2) Kosten je Karteileiche — 0,30–0,60 € / Monat
3) Verfallszeit unstrukturierter Ablagen — 14–30 Tage
Unten kleiner Hinweis: „Chargeback-Logik macht Kosten sichtbar“
KlarNetz AG nur als winzige Case-Zeile, kein Logo-Wirrwarr.`,
    });
  }
  if (n >= 2) {
    briefs.push({
      kapitelIndex: 1,
      title: "6-Fragen-Prozesskompass",
      layoutBrief: `Infografik-Titel: „Der 6-Fragen-Prozesskompass“
Sechs nummerierte Segmente im Kreis oder als 2×3-Raster — exakt diese Labels (kurz, deutsch):
1 Auftrag (Zweckbindung)
2 Menschen (Betroffenenkreis)
3 Datenminimum (Eingangsfilter)
4 Fehlerfreier Fluss (ohne Medienbruch)
5 Verantwortung (Rollen & Rechte)
6 Automatisches Ende (Lösch-Countdown)
Mitte: „Andon / Quality Gate vor dem Bau“
Fußzeile: „Keine Maske ohne sechs Antworten“
Nicht verwenden: Zweck/Datenfelder/Speicherdauer/Zugriff/Risiko/Löschpfad als alte Sechserliste.`,
    });
  }
  if (n >= 3) {
    briefs.push({
      kapitelIndex: 2,
      title: "14-Tage-Frontend-Sprint",
      layoutBrief: `Infografik-Titel: „14-Tage-Sprint am Frontend“
Horizontaler Zeitstrahl Tag 1–14 in fünf Blöcken:
Tage 1–3 Inventur & Streichen
Tage 4–6 Poka-Yoke & eine Quelle der Wahrheit
Tage 7–9 Freitext → Auswahlmenüs
Tage 10–12 Dashboard, CSV zu
Tage 13–14 Live & Vorher/Nachher
Nebenbei zwei Kennzahlen-Badges: Formular-Abbruchquote · First-Time-Right-Rate`,
    });
  }
  if (n >= 4) {
    briefs.push({
      kapitelIndex: 3,
      title: "30-Tage-Altdaten-Sprint",
      layoutBrief: `Infografik-Titel: „30-Tage-Altdaten-Sprint“
Vier Wochen-Spalten:
Woche 1 Herde finden
Woche 2 ROT tilgen
Woche 3 Schnittstellen & Rechte härten
Woche 4 Regelbetrieb mit Bordmitteln
Unten: „System · Owner · Datum — abzeichnen“`,
    });
  }
  if (n >= 5) {
    briefs.push({
      kapitelIndex: 4,
      title: "9-KPI-Cockpit & 5-Monats-Rollout",
      layoutBrief: `Infografik-Titel: „Privacy-Value- / VDP-Cockpit“
Oben: drei Säulen
Säule 1 Kosten & Bestand (+ Frontend-Hebel)
Säule 2 Bestandsbetrieb
Säule 3 KI-Readiness
Je Säule drei kurze KPI-Namen auf Deutsch (ohne lange Erklärungen).
Unten: fünf Monats-Schritte als Kette
1 Chargeback  2 Prozesssteckbrief  3 14-Tage-Sprint  4 30-Tage-Sprint  5 A3 & KI-Roadmap`,
    });
  }

  return briefs.filter((b) => b.kapitelIndex < n);
}

/**
 * Napkin wants substantive German content (not an English image-prompt).
 */
function buildNapkinContent(
  brief: SachbuchInfografikBrief,
  bookTitle: string,
): { content: string; context: string } {
  const content = `Infografik: ${brief.title}

${brief.layoutBrief}`;

  const context = `Sachbuch „${bookTitle}“.
Professionelle deutschsprachige Business-Infografik für den Druck (Hochformat).
Stil: flach, klar, viel Weißraum, dunkle Zinc-Schrift, warmer Orange-Akzent (#ea580c).
Keine Fotos, kein 3D, keine Comic-Figuren, keine englischen Fließtexte — alle Labels auf Deutsch.
Privacy Value Thinking (Mindset) und Value-Driven Privacy / VDP (Praxis) dürfen als Rahmen vorkommen, wenn sie zum Diagramm passen.`;

  return { content, context };
}

function parseDataUrl(dataUrl: string): Buffer {
  const m = /^data:image\/[a-zA-Z0-9+.-]+;base64,([\s\S]+)$/.exec(
    dataUrl.trim(),
  );
  if (!m?.[1]) throw new Error("Ungültige Infografik (data URL).");
  return Buffer.from(m[1], "base64");
}

/** Fit generated art onto a white portrait page with quiet margin. */
async function normalizeInfografikPage(dataUrl: string): Promise<string> {
  const { width: W, height: H } = SACHBUCH_INFOGRAFIK_SIZE;
  const image = await loadImage(parseDataUrl(dataUrl));
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);
  const pad = Math.round(W * 0.04);
  const innerW = W - pad * 2;
  const innerH = H - pad * 2;
  const scale = Math.min(innerW / image.width, innerH / image.height);
  const dw = image.width * scale;
  const dh = image.height * scale;
  const x = pad + (innerW - dw) / 2;
  const y = pad + (innerH - dh) / 2;
  ctx.drawImage(image, x, y, dw, dh);
  const out = canvas.toBuffer("image/jpeg", 86);
  return `data:image/jpeg;base64,${out.toString("base64")}`;
}

/**
 * Generate and persist one chapter Infografik from a curated brief (Napkin).
 */
export async function generateSachbuchKapitelInfografik(input: {
  sachbuchId: string;
  kapitelId: string;
  brief: SachbuchInfografikBrief;
}): Promise<SachbuchKontext> {
  const book = await getSachbuchKontext(input.sachbuchId);
  if (!book) throw new Error("Sachbuch nicht gefunden.");
  assertSachbuchGuideAllows(book, "herstellung");

  const kap = book.kapitel.find((k) => k.id === input.kapitelId);
  if (!kap) throw new Error("Kapitel nicht gefunden.");

  const { content, context } = buildNapkinContent(input.brief, book.title);
  const napkinPromptLog = `NAPKIN content:\n${content}\n\nNAPKIN context:\n${context}`;

  const rendered = await generateNapkinVisual({
    content,
    context,
    format: "png",
    language: "de-DE",
    numberOfVisuals: 1,
    orientation: "portrait",
  });

  let dataUrl = rendered.dataUrl;
  try {
    dataUrl = await normalizeInfografikPage(rendered.dataUrl);
  } catch {
    // SVG or exotic MIME: keep raw Napkin payload if canvas normalize fails.
    if (!dataUrl.startsWith("data:image/")) {
      throw new Error("Napkin lieferte kein Bild.");
    }
  }

  const now = new Date().toISOString();

  return patchSachbuchKapitel(input.sachbuchId, input.kapitelId, {
    infografikDataUrl: dataUrl,
    infografikTitle: input.brief.title,
    infografikPrompt: napkinPromptLog,
    updatedAt: now,
  });
}

/**
 * Generate all curated Infografiken for a book (skips chapters already filled unless force).
 */
export async function generateAllSachbuchInfografiken(input: {
  sachbuchId: string;
  force?: boolean;
  onProgress?: (label: string) => void;
}): Promise<SachbuchKontext> {
  let book = await getSachbuchKontext(input.sachbuchId);
  if (!book) throw new Error("Sachbuch nicht gefunden.");
  assertSachbuchGuideAllows(book, "herstellung");

  const briefs = sachbuchInfografikBriefsForBook(book);
  for (const brief of briefs) {
    const kap = book.kapitel[brief.kapitelIndex];
    if (!kap) continue;
    if (!input.force && kap.infografikDataUrl?.startsWith("data:image/")) {
      input.onProgress?.(
        `Kap. ${brief.kapitelIndex + 1}: bereits vorhanden — übersprungen`,
      );
      continue;
    }
    input.onProgress?.(
      `Kap. ${brief.kapitelIndex + 1}: ${brief.title} (Napkin) …`,
    );
    book = await generateSachbuchKapitelInfografik({
      sachbuchId: input.sachbuchId,
      kapitelId: kap.id,
      brief,
    });
  }
  return book;
}
