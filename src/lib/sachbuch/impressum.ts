/**
 * Tolino-media Impressum for Sachbuch Titelei (Print page 2 + eBook front).
 * @see https://www.tolino-media.de/blog/impressum-was-ist-pflicht-was-ist-kuer/
 *
 * Pflicht (Pressegesetze): Klarname + ladungsfähige Anschrift.
 * Tolino: Impressum am Buchanfang, Überschrift „Impressum“;
 * Print: Seite 2 der Innendatei, oben ≥5 cm / unten ≥3 cm frei für Druckvermerk.
 * KI: alle eingesetzten Systeme nennen.
 */

import type { RomanVorsatz } from "@/lib/roman/front-matter";

/** Klarname Herausgeber (nicht Pseudonym). */
export const SACHBUCH_HERAUSGEBER_NAME = "Bernd Krpec";

/** Default author line on the title page (Sachbuch editions). */
export const SACHBUCH_DEFAULT_AUTHOR = SACHBUCH_HERAUSGEBER_NAME;

/** Ladungsfähige Anschrift — Wohnort laut Herausgeber. */
export const SACHBUCH_HERAUSGEBER_ANSCHRIFT = "46286 Dorsten";

export const SACHBUCH_HERAUSGEBER_EMAIL = "info@privacyvalue.de";

export const SACHBUCH_HERAUSGEBER_WEBSITE = "https://privacyvalue.de";

/** Imprint / Verlagzeile on the title page (Sachbuch). */
export const SACHBUCH_DEFAULT_IMPRINT = "privacyvalue.de";

/** Tolino Print: free band above / below Impressum for Druckvermerk. */
export const SACHBUCH_IMPRESSUM_PRINT_TOP_MM = 50;
export const SACHBUCH_IMPRESSUM_PRINT_BOTTOM_MM = 30;

/**
 * Build impressum block for Sachbuch Vorsatz (PDF page 2 / ePub Impressum).
 * `rechteinhaber` = Klarname; cover author may still be a Pseudonym on the title page.
 */
export function buildSachbuchImpressum(input: {
  jahr?: string;
  /** Pseudonym / Autorenzeile auf der Titelseite (optional Nennung). */
  autorPseudonym?: string;
  /** Edition line, e.g. „1. Auflage“. Default: first edition. */
  auflage?: string;
}): RomanVorsatz["impressum"] {
  const year =
    (input.jahr ?? "").trim() || String(new Date().getFullYear());
  const pseudonym = (input.autorPseudonym ?? "").trim();
  const auflage = (input.auflage ?? "1. Auflage").trim() || "1. Auflage";
  const absatz: string[] = [
    `Herausgeber\n${SACHBUCH_HERAUSGEBER_NAME}\n${SACHBUCH_HERAUSGEBER_ANSCHRIFT}\n${SACHBUCH_HERAUSGEBER_EMAIL}\n${SACHBUCH_HERAUSGEBER_WEBSITE}`,
    `${auflage} ${year}`,
  ];
  if (pseudonym && pseudonym !== SACHBUCH_HERAUSGEBER_NAME) {
    absatz.push(`Autor: ${pseudonym}`);
  }
  // One KI/Credits block (Tolino Print: Impressum must fit with 5 cm top / 3 cm bottom free).
  absatz.push(
    `Bei der Erstellung dieses Buches wurden KI-Systeme eingesetzt: Textgenerierung und -überarbeitung (u. a. Gemini); Umschlaggestaltung und Kapitel-Infografiken (Gemini 3 Pro Image). Satz und Titelei: ${SACHBUCH_DEFAULT_IMPRINT}. Der Herausgeber hat die Inhalte redaktionell geprüft und verantwortet.`,
  );

  return {
    jahr: year,
    rechteinhaber: SACHBUCH_HERAUSGEBER_NAME,
    hinweis: `© ${year} ${SACHBUCH_HERAUSGEBER_NAME} · ${SACHBUCH_DEFAULT_IMPRINT}. Alle Rechte vorbehalten.`,
    disclaimer:
      "Dieses Sachbuch gibt Orientierung und operatives Erfahrungswissen wieder. Es ersetzt keine Rechtsberatung und keine juristische Prüfung konkreter Prozesse oder Sachverhalte. Keine Garantie für Vollständigkeit oder individuelle Ergebnisse. Bei Bedarf fachlichen Rat einholen.",
    absatz,
  };
}
