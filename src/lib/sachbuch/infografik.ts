/**
 * Sachbuch chapter Infografiken via Gemini 3 Pro Image (Herstellung).
 * Briefs are keyed to manuscript „Abbildung …“ captions so PDF/ePub figures
 * match the in-text references. Multiple graphics per chapter allowed.
 * Model: `SACHBUCH_MODEL_INFOGRAFIK` (`gemini-3-pro-image`).
 */

import { createCanvas, loadImage } from "@napi-rs/canvas";
import { generateWithGeminiImage } from "@/lib/ai/gemini-images";
import { findWiredAiEndpoint } from "@/lib/ai/wired-models";
import { SACHBUCH_MODEL_INFOGRAFIK } from "@/lib/sachbuch/agent-defaults";
import { assertSachbuchGuideAllows } from "@/lib/sachbuch/guide";
import {
  getSachbuchKontext,
  patchSachbuchKapitel,
} from "@/lib/sachbuch/repository";
import { sachbuchKapitelInfografiken } from "@/lib/sachbuch/parse";
import type {
  SachbuchKapitel,
  SachbuchKapitelInfografik,
  SachbuchKontext,
} from "@/lib/sachbuch/types";

export { sachbuchKapitelInfografiken };

export const SACHBUCH_INFOGRAFIK_SIZE = {
  width: 1200,
  height: 1800,
} as const;

/** Provider label for wait dialogs / admin UI. */
export const SACHBUCH_INFOGRAFIK_PROVIDER_LABEL =
  findWiredAiEndpoint(SACHBUCH_MODEL_INFOGRAFIK)?.label ??
  "Gemini 3 Pro Image";

export type SachbuchInfografikBrief = {
  /** 0-based chapter index. */
  kapitelIndex: number;
  /** Stable id within the chapter (Abbildung / Tabelle label). */
  key: string;
  title: string;
  /** Concrete layout instructions for the visual engine. */
  layoutBrief: string;
  /** Table graphics use landscape; diagrams stay portrait. */
  kind?: "diagram" | "table";
};

/**
 * Infografik slots tied to manuscript Abbildung captions.
 * Only chapters that name a figure get a brief — no filler diagrams.
 */
export function sachbuchInfografikBriefsForBook(
  book: SachbuchKontext,
): SachbuchInfografikBrief[] {
  const n = book.kapitel.length;
  const briefs: SachbuchInfografikBrief[] = [];

  if (n >= 1) {
    briefs.push({
      kapitelIndex: 0,
      key: "abb-1",
      title: "Abbildung 1: Qualitäts-Pyramide",
      layoutBrief: `Infografik-Titel: „Abbildung 1 — Die dreistufige Qualitäts-Pyramide“
Untertitel: Privacy Value Thinking

Drei klare Stockwerke einer Pyramide (unten breit → oben spitz), deutsche Labels:
1) Fundament (unten): Organisatorisches & risikobasiertes Fundament — Kapitel 1–2
2) Motor (mitte): Methodischer Motor — Kapitel 3–6
3) Kundenergebnis (oben): Sichtbares Kundenergebnis — Kapitel 7–8

Neben der Spitze kleiner Hinweis: Gesamtsteuerung — Kapitel 9
Fußzeile kurz: „Zweck vor Daten · Qualität im Fluss“
Flaches Architektur-Schaubild, nummerierte Stockwerke, keine Fotos.`,
    });
    briefs.push({
      kapitelIndex: 0,
      key: "abb-2",
      title: "Abbildung 2: Privacy Solution Canvas",
      layoutBrief: `Infografik-Titel: „Abbildung 2 — Privacy Solution Canvas“
Untertitel: Sechs Architekturfelder des Prozesskompasses

2×3-Raster oder Canvas-Karte mit exakt diesen sechs nummerierten Feldern (kurz, deutsch) —
identisch mit dem Sechs-Fragen-Prozesskompass:
Feld 1: Betriebswirtschaftliches Problem & Zweckbindung
Feld 2: Direkter Gegenwert an der Benutzerschnittstelle
Feld 3: Minimaler Datensatz für die technische Funktion
Feld 4: Tragfähige Rechtsgrundlage (nicht Einwilligung als Default)
Feld 5: Rollenbasierter Zugriff & technische Begrenzung
Feld 6: Ablaufdatum & automatisierte Löschroutine

Mitte oder Fuß: „Andon / Quality Gate vor dem Bau“
Fußzeile: „Keine Maske ohne sechs Antworten“`,
    });
    briefs.push({
      kapitelIndex: 0,
      key: "tab-1",
      title: "Tabelle 1: Ausgangsprofil KlarNetz AG",
      kind: "table",
      layoutBrief: `Tabellen-Titel oben: „Tabelle 1 — Ausgangsprofil und Referenzmetriken der KlarNetz AG“
Untertitel: Composite-Unternehmen · ~600.000 aktive Kundenkonten

Saubere 2-Spalten-Tabelle (Kennzahl | Wert), deutsch, druckscharf:
| Kennzahl | Wert |
| Aktive Kundenkonten gesamt | ca. 600.000 |
| Geschäftsbereich 1 | B2B-Cloud-Plattform |
| Geschäftsbereich 2 | B2C-Tarif „KlarHome“ |
| Rolle im Buch | Fiktives Composite / durchgängiges Fallbeispiel |
| Steuerungslogik | Privacy Value Thinking · Value-Driven Privacy |

Keine Fotos, keine 3D-Effekte. Klare Linien, Zinc-Schrift, Orange nur für Titelakzent.`,
    });
  }

  if (n >= 4) {
    briefs.push({
      kapitelIndex: 3,
      key: "tab-vdp-matrix",
      title: "Tabelle: VDP-Übersetzungsmatrix",
      kind: "table",
      layoutBrief: `Tabellen-Titel: „Die VDP-Übersetzungsmatrix im Überblick“
Vier Spalten, drei Inhaltszeilen (plus Kopfzeile), deutsch:

Kopf: Lean-Prinzip | VDP-Werkzeug | Technischer Hebel | Business-Effekt

Zeile 1 — Überproduktion vermeiden:
Fünf-Tage-Minimierungs-Sprint / Datenbudget | Feldkürzung + Register-Anreicherung | Weniger Abbruch, schnellerer Abschluss

Zeile 2 — Fehler an der Quelle:
Just-in-Time-Abfragen / Progressive Profiling | Browser-Validierung + Autovervollständigung | Keine Dummy-Eingaben, weniger CRM-Nacharbeit

Zeile 3 — 5S-Ordnung:
Data Contracts / Retention by Design | Gateways + Drop-Partition | Weniger Overfetching und DB-Ballast

Kompakte Management-Tabelle, lesbare Schrift, keine Dekoration.`,
    });
  }

  if (n >= 3) {
    briefs.push({
      kapitelIndex: 2,
      key: "abb-3",
      title: "Abbildung 3: 5-stufiges VDP-Nachweissystem",
      layoutBrief: `Infografik-Titel: „Abbildung 3 — Das 5-stufige VDP-Nachweissystem“
Untertitel: Audit by Design · geschlossene Evidenzkette

Vertikale oder horizontale Prozesskette mit fünf nummerierten Stufen und Pfeilen:
Stufe 1: Anforderung im Ticket (geschäftlich / vertraglich / gesetzlich)
Stufe 2: Architekturentscheidung
Stufe 3: Systemeinbettung
Stufe 4: Automatisierte Laufzeit-Protokolle
Stufe 5: Technischer Änderungs-Trigger im PDCA-Regelkreis

Geschlossener Kreis-Hinweis am Ende: PDCA / kontinuierliche Nachschärfung
Labels kurz und druckscharf, Management-Schaubild.`,
    });
  }

  if (n >= 5) {
    briefs.push({
      kapitelIndex: 4,
      key: "abb-5",
      title: "Abbildung 5: 5S-Lifecycle-Modell",
      layoutBrief: `Infografik-Titel: „Abbildung 5 — Das 5S-Lifecycle-Modell“
Untertitel: Schlanke Datenhygiene von Altlasten bis Selbstdisziplin im Code

Fünf nummerierte Stationen im Kreis oder als Lifecycle-Band (deutsch):
1 Seiri — Sortieren: digitaler Kehraus / Altlasten trennen
2 Seiton — Systematisieren: klare Orte & Zustände
3 Seiso — Säubern: laufende Bereinigung
4 Seiketsu — Standardisieren: Regeln & Automatisierung
5 Shitsuke — Selbstdisziplin: Code & Betrieb halten den Standard

Optional kleine Fußzeile: „Trigger → Zustand → technische Umsetzung“
Keine Fotos, klare Icons oder Zahlenkreise.`,
    });
  }

  if (n >= 9) {
    briefs.push({
      kapitelIndex: 8,
      key: "abb-9-1",
      title: "Abbildung 9.1: 4-Schleusen-KI-Pipeline-Check",
      layoutBrief: `Infografik-Titel: „Abbildung 9.1 — Der 4-Schleusen-KI-Pipeline-Check“
Untertitel: Architekturmodell für sichere KI-Datenflüsse

Vier Schleusen / Gates von links nach rechts (oder oben nach unten), mit Pfeilen:
Schleuse 1: Poka-Yoke bei der Datenaufnahme
Schleuse 2: Deterministische Vektor-Trennung
Schleuse 3: Inferenz-Kontrolle
Schleuse 4: Zero-Data-Retention-Ausgabe

Fußzeile: „Kein Rohdatenstrom ohne Schleuse“
Technisches Architektur-Schaubild, flach, deutsch beschriftet.`,
    });
    briefs.push({
      kapitelIndex: 8,
      key: "tab-9-1",
      title: "Tabelle 9.1: 90-Tage-VDP-Rollout-Plan",
      kind: "table",
      layoutBrief: `Tabellen-Titel: „Tabelle 9.1 — Der 90-Tage-VDP-Rollout-Plan im Überblick“
Vier Spalten: Phase | Fokus / Meilensteine | Werkzeuge | Vorstands-KPIs

Zeile Phase 1 (Tag 1–30): Dekontamination & Baseline | 5S-Sprint, Engpassanalyse, Quick Wins | Ticket-Liegezeit, verspätete Einwände, Wartezeiten
Zeile Phase 2 (Tag 31–60): Agiles Einweben | Triage, Canvas, Nachweissystem in Sprints | First-Pass-Yield, Durchsatz
Zeile Phase 3 (Tag 61–90): Steuerung & Skalierung | Management-Review, Rollout Nachbarbereiche | Ampel-Quote, Kundenergebnis-Metriken

Fußzeile kurz: „Messbar steuern — nicht nur dokumentieren“
Klare Tabellenoptik, deutsch, druckscharf.`,
    });
    briefs.push({
      kapitelIndex: 8,
      key: "tab-9-2",
      title: "Tabelle 9.2: Transformation KlarNetz in Zahlen",
      kind: "table",
      layoutBrief: `Tabellen-Titel: „Tabelle 9.2 — Die Transformation der KlarNetz AG in Zahlen“
Untertitel: Bilanz nach 90 Tagen VDP-Rollout (KlarHome + B2B-Plattform)

Drei Spalten: Metrik | Ausgangslage (vor VDP) | nach 90 Tagen
Beispielhafte, glaubwürdige Management-Kennzahlen (keine Fantasie-Prozentorgie), z. B.:
- Ticket-Liegezeit Datenschutz
- First-Pass-Yield Freigaben
- Anteil manueller Tabellenexporte
- Verspätete Einwände vor Go-Live
- Kundenzufriedenheit / Trust-Proxy (KlarHome)

Zellen kurz halten. Fußzeile: „Richtung stimmt — Regelbetrieb beginnt“
Professionelle KPI-Tabelle, deutsch.`,
    });
  }

  return briefs.filter((b) => b.kapitelIndex < n);
}

/**
 * Image prompt for Gemini 3 Pro Image — diagram (portrait) or table (landscape).
 */
function buildGeminiInfografikPrompt(
  brief: SachbuchInfografikBrief,
  bookTitle: string,
): string {
  const isTable = brief.kind === "table";
  return [
    isTable
      ? "Professionelle deutschsprachige Management-Tabelle / Tabellen-Infografik für den Buchdruck, Querformat 3:2."
      : "Professionelle deutschsprachige Business-Infografik / Architektur-Schaubild für den Buchdruck, Hochformat 2:3.",
    `Buchkontext: Sachbuch „${bookTitle}".`,
    isTable
      ? "Diese Grafik IST die genannte Tabelle im Buch — Kopfzeile und Zellen müssen zur Caption passen."
      : "Diese Grafik IST die genannte Abbildung im Buch — Titel und Inhalt müssen zur Caption passen.",
    `Thema / Titel: ${brief.title}.`,
    "",
    "Layout und Inhalt (Labels exakt, alle Texte auf Deutsch):",
    brief.layoutBrief,
    "",
    "Stil: flaches Vektor-Layout, viel Weißraum, hellgrauer/weißer Hintergrund,",
    "dunkle Zinc-Schrift (#18181b), warmer Orange-Akzent (#ea580c), klare Hierarchie,",
    "druckscharf und gut lesbar. Keine Fotos, kein 3D, keine Comic-Figuren,",
    "keine Wasserzeichen, keine englischen Fließtexte.",
    isTable
      ? "Echte Tabellenoptik mit Linien/Zellen — keine bloße Aufzählung als Fließtext."
      : "Der Abbildungstitel darf klein oben stehen.",
  ].join("\n");
}

function parseDataUrl(dataUrl: string): Buffer {
  const m = /^data:image\/[a-zA-Z0-9+.-]+;base64,([\s\S]+)$/.exec(
    dataUrl.trim(),
  );
  if (!m?.[1]) throw new Error("Ungültige Infografik (data URL).");
  return Buffer.from(m[1], "base64");
}

/** Fit generated art onto a white page with quiet margin (portrait or landscape). */
async function normalizeInfografikPage(
  dataUrl: string,
  options: { landscape?: boolean } = {},
): Promise<string> {
  const W = options.landscape ? 1600 : SACHBUCH_INFOGRAFIK_SIZE.width;
  const H = options.landscape ? 1100 : SACHBUCH_INFOGRAFIK_SIZE.height;
  const image = await loadImage(parseDataUrl(dataUrl));
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);
  const pad = Math.round(Math.min(W, H) * 0.04);
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

function syncLegacyInfografikFields(
  list: SachbuchKapitelInfografik[],
): Pick<
  SachbuchKapitel,
  "infografiken" | "infografikDataUrl" | "infografikTitle" | "infografikPrompt"
> {
  const first = list[0];
  return {
    infografiken: list,
    infografikDataUrl: first?.dataUrl ?? null,
    infografikTitle: first?.title ?? "",
    infografikPrompt: first?.prompt ?? "",
  };
}

/**
 * Generate and upsert one Abbildung Infografik into the chapter list.
 */
export async function generateSachbuchKapitelInfografik(input: {
  sachbuchId: string;
  kapitelId: string;
  brief: SachbuchInfografikBrief;
}): Promise<SachbuchKontext> {
  const book = await getSachbuchKontext(input.sachbuchId);
  if (!book) throw new Error("Sachbuch nicht gefunden.");
  assertSachbuchGuideAllows(book, "herstellung");
  const { isSachbuchDerivedEdition, isSachbuchTeaser } = await import(
    "@/lib/sachbuch/guide"
  );
  if (isSachbuchDerivedEdition(book)) {
    throw new Error(
      isSachbuchTeaser(book)
        ? "Teaser ist text-only — Infografiken gehören nur in den Hauptband."
        : "Kompakt-Ausgabe ist text-only — Infografiken gehören nur in den Hauptband.",
    );
  }

  const kap = book.kapitel.find((k) => k.id === input.kapitelId);
  if (!kap) throw new Error("Kapitel nicht gefunden.");

  const prompt = buildGeminiInfografikPrompt(input.brief, book.title);
  const promptLog = `GEMINI ${SACHBUCH_MODEL_INFOGRAFIK} [${input.brief.key}]:\n${prompt}`;
  const isTable = input.brief.kind === "table";

  const rendered = await generateWithGeminiImage({
    modelSlug: SACHBUCH_MODEL_INFOGRAFIK,
    prompt,
    aspectRatio: isTable ? "3:2" : "2:3",
    imageSize: "2K",
  });

  let dataUrl = rendered.dataUrl;
  try {
    dataUrl = await normalizeInfografikPage(rendered.dataUrl, {
      landscape: isTable,
    });
  } catch {
    if (!dataUrl.startsWith("data:image/")) {
      throw new Error("Gemini lieferte kein Bild.");
    }
  }

  const nextItem: SachbuchKapitelInfografik = {
    key: input.brief.key,
    title: input.brief.title,
    dataUrl,
    prompt: promptLog,
  };

  // Only keep slots that still match Abbildung/Tabelle briefs for this chapter.
  const chapterBriefs = sachbuchInfografikBriefsForBook(book).filter(
    (b) => b.kapitelIndex === input.brief.kapitelIndex,
  );
  const allowedKeys = new Set(chapterBriefs.map((b) => b.key));
  const allowedTitles = new Set(chapterBriefs.map((b) => b.title.trim()));
  const existing = sachbuchKapitelInfografiken(kap).filter((i) => {
    const k =
      (i.key?.trim() || "").length > 0
        ? i.key!.trim()
        : null;
    if (k) {
      return allowedKeys.has(k) && k !== input.brief.key;
    }
    return (
      allowedTitles.has(i.title.trim()) &&
      i.title.trim() !== input.brief.title.trim()
    );
  });
  const merged = [...existing, nextItem];
  merged.sort((a, b) => {
    const ka = a.key || "";
    const kb = b.key || "";
    const ia = chapterBriefs.findIndex(
      (x) => x.key === ka || x.title === a.title,
    );
    const ib = chapterBriefs.findIndex(
      (x) => x.key === kb || x.title === b.title,
    );
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });

  const now = new Date().toISOString();
  return patchSachbuchKapitel(input.sachbuchId, input.kapitelId, {
    ...syncLegacyInfografikFields(merged),
    updatedAt: now,
  });
}

/**
 * Generate all Abbildung Infografiken (skips matching titles unless force).
 * Clears outdated graphics on chapters that have no Abbildung brief.
 */
export async function generateAllSachbuchInfografiken(input: {
  sachbuchId: string;
  force?: boolean;
  onProgress?: (label: string) => void;
}): Promise<SachbuchKontext> {
  let book = await getSachbuchKontext(input.sachbuchId);
  if (!book) throw new Error("Sachbuch nicht gefunden.");
  assertSachbuchGuideAllows(book, "herstellung");
  const { isSachbuchDerivedEdition, isSachbuchTeaser } = await import(
    "@/lib/sachbuch/guide"
  );
  if (isSachbuchDerivedEdition(book)) {
    throw new Error(
      isSachbuchTeaser(book)
        ? "Teaser ist text-only — Infografiken gehören nur in den Hauptband."
        : "Kompakt-Ausgabe ist text-only — Infografiken gehören nur in den Hauptband.",
    );
  }

  const briefs = sachbuchInfografikBriefsForBook(book);
  const chaptersWithBrief = new Set(briefs.map((b) => b.kapitelIndex));

  // Drop leftover Napkin/KPI graphics that are not Abbildung slots.
  for (let i = 0; i < book.kapitel.length; i++) {
    const kap = book.kapitel[i]!;
    const current = sachbuchKapitelInfografiken(kap);
    if (!current.length) continue;

    if (!chaptersWithBrief.has(i)) {
      input.onProgress?.(
        `Kap. ${i + 1}: veraltete Infografik entfernt (keine Abbildung im Text)`,
      );
      book = await patchSachbuchKapitel(input.sachbuchId, kap.id, {
        ...syncLegacyInfografikFields([]),
        updatedAt: new Date().toISOString(),
      });
      continue;
    }

    const chapterBriefs = briefs.filter((b) => b.kapitelIndex === i);
    const allowedTitles = new Set(chapterBriefs.map((b) => b.title.trim()));
    const allowedKeys = new Set(chapterBriefs.map((b) => b.key));
    const pruned = current
      .filter((x) => {
        if (x.key && allowedKeys.has(x.key)) return true;
        return allowedTitles.has(x.title.trim());
      })
      .sort((a, b) => {
        const ia = chapterBriefs.findIndex(
          (x) => x.key === a.key || x.title === a.title,
        );
        const ib = chapterBriefs.findIndex(
          (x) => x.key === b.key || x.title === b.title,
        );
        return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
      });
    if (pruned.length === current.length) continue;
    input.onProgress?.(
      `Kap. ${i + 1}: ${current.length - pruned.length} Fremd-Infografik(en) entfernt`,
    );
    book = await patchSachbuchKapitel(input.sachbuchId, kap.id, {
      ...syncLegacyInfografikFields(pruned),
      updatedAt: new Date().toISOString(),
    });
  }

  for (const brief of briefs) {
    const kap = book.kapitel[brief.kapitelIndex];
    if (!kap) continue;
    const existing = sachbuchKapitelInfografiken(kap).find(
      (i) =>
        i.key === brief.key || i.title.trim() === brief.title.trim(),
    );
    if (!input.force && existing) {
      input.onProgress?.(
        `Kap. ${brief.kapitelIndex + 1}: ${brief.title} — schon vorhanden`,
      );
      continue;
    }
    input.onProgress?.(
      `Kap. ${brief.kapitelIndex + 1}: ${brief.title} (${SACHBUCH_INFOGRAFIK_PROVIDER_LABEL}) …`,
    );
    book = await generateSachbuchKapitelInfografik({
      sachbuchId: input.sachbuchId,
      kapitelId: kap.id,
      brief,
    });
  }
  return book;
}
