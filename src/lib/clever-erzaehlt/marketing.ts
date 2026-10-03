/**
 * Public Clever-erzählt series marketing copy (landing `/clever-erzaehlt`).
 */

import { BUCH_DER_WOCHE_SLOGAN } from "@/lib/buch-der-woche/catalog";
import { CLEVER_ERZAEHLT_AMAZON_SERIES_URL } from "@/lib/roman/clever-erzaehlt";

/** Series brand slogan — same as IG / Buch-der-Woche creatives. */
export const CLEVER_ERZAEHLT_SLOGAN = BUCH_DER_WOCHE_SLOGAN;

/** Amazon series page — see `CLEVER_ERZAEHLT_AMAZON_SERIES_URL` in `clever-erzaehlt.ts`. */
export { CLEVER_ERZAEHLT_AMAZON_SERIES_URL };

/** Familiar kids’ topics — atmosphere on the series landing. */
export const CLEVER_ERZAEHLT_TOPIC_CLASSICS = [
  "Dinosaurier",
  "Weltall",
  "Wald & Bäume",
  "Vulkane",
  "Tiefsee",
] as const;

/**
 * Less common kids’-book topics the series also covers
 * (everyday life, body, tech, school …).
 */
export const CLEVER_ERZAEHLT_TOPIC_UNUSUAL = [
  "Hausaufgaben",
  "Gehirn & Gefühle",
  "Geld & Wirtschaft",
  "Internet & digitale Welt",
  "Chemie im Alltag",
  "Kriminalistik",
  "Herz, Blut & Immunsystem",
  "Nachhaltigkeit",
] as const;
