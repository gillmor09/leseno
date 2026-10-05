/**
 * Stable book prompt prefix for provider prompt-caching.
 * Keep byte-identical across Gerüst batches / Verbessern turns until
 * Idee, Recherche, Spec, or Tonalität change — then rebuild.
 */

import {
  BUCHTYP_LABELS,
  exposeTextFromEditorial,
  type RomanBuchTyp,
  type RomanEditorial,
} from "@/lib/roman/editorial";
import { formatCharaktere } from "@/lib/roman/fundament";
import { CLIP } from "@/lib/roman/pipeline/quality-brief";
import type { RomanCharakter } from "@/lib/roman/types";

export type RomanStaticBookPrefixInput = {
  buchTyp: RomanBuchTyp;
  title: string;
  genre: string;
  ideeKurz: string;
  rechercheDossier?: string;
  tonalitaet?: string;
  grobRegeln?: string;
  editorial: RomanEditorial;
  charaktere: RomanCharakter[];
  weltSchauplaetze: string;
  weltRegeln: string;
};

/**
 * Fixed book bible block (Idee / Recherche / Spec / Ton).
 * Do NOT append live graph slices or chapter deltas here — that breaks cache.
 */
export function buildRomanStaticBookPrefix(
  input: RomanStaticBookPrefixInput,
): string {
  const expose = exposeTextFromEditorial(input.editorial);
  const chars = formatCharaktere(input.charaktere) || "(noch keine Steckbriefe)";
  const zielWort =
    input.editorial.zielWortzahlRoman != null
      ? String(input.editorial.zielWortzahlRoman)
      : "?";
  const recherche = (input.rechercheDossier ?? input.editorial.rechercheDossier ?? "")
    .trim();
  const ton = (input.tonalitaet ?? "").trim();
  const grob = (input.grobRegeln ?? input.editorial.grobRegeln ?? "").trim();

  return `# Buch (stabiler Kontext — Prompt-Cache)
Titel: ${input.title.trim() || "(ohne)"}
Buchtyp: ${BUCHTYP_LABELS[input.buchTyp]}
Genre: ${input.genre.trim() || "—"}
Zielwortzahl (Orientierung): ${zielWort}
Alter: ${
    input.editorial.zielAlterMin != null || input.editorial.zielAlterMax != null
      ? `${input.editorial.zielAlterMin ?? "?"}-${input.editorial.zielAlterMax ?? "?"}`
      : "?"
  } · Lesestufe: ${input.editorial.lesestufe || "—"}

# Ideendokumentation
${input.ideeKurz.trim().slice(0, CLIP.idee) || "(leer)"}

# Hintergrundrecherche
${recherche.slice(0, CLIP.recherche) || "(keine)"}

# Sprache & Tonalität (Schreiber)
${ton.slice(0, CLIP.grob) || "(keine)"}

# Grob-Regeln / Basis-Regeln
${grob.slice(0, CLIP.grob) || "(leer)"}

# Exposé
${expose.slice(0, CLIP.expose) || "(leer)"}

# Charaktere
${chars.slice(0, CLIP.charaktere)}

# Welt
Schauplätze: ${input.weltSchauplaetze.trim().slice(0, CLIP.weltSchau) || "(leer)"}
Regeln: ${input.weltRegeln.trim().slice(0, CLIP.weltRegeln) || "(leer)"}`;
}

/**
 * Split role system + stable book prefix + per-call delta for generateText.
 */
export function buildRomanCachedPrompt(input: {
  systemInstruction: string;
  staticPrefix: string;
  dynamicUser: string;
}): {
  systemInstruction: string;
  cacheablePrefix: string;
  userText: string;
} {
  return {
    systemInstruction: input.systemInstruction.trim(),
    cacheablePrefix: input.staticPrefix.trim(),
    userText: input.dynamicUser.trim(),
  };
}
