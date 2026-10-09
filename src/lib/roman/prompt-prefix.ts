/**
 * Stable book prompt prefix for provider prompt-caching.
 * Keep byte-identical across Gerüst batches / Verbessern turns until
 * Idee, Recherche, Spec, or Tonalität change — then rebuild.
 *
 * Manuskript prose (Sonnet) should prefer {@link buildRomanSlimCanon} + chapter
 * packet — not the full bible — to cut input tokens.
 */

import {
  BUCHTYP_LABELS,
  exposeTextFromEditorial,
  type RomanBuchTyp,
  type RomanEditorial,
  type RomanWissensGraph,
} from "@/lib/roman/editorial";
import { formatCharaktere } from "@/lib/roman/fundament";
import { CLIP } from "@/lib/roman/pipeline/quality-brief";
import type { RomanCharakter } from "@/lib/roman/types";

/** Tight budgets for Sonnet prose prefix (chars ≈ tokens/3–4 DE). */
const SLIM = {
  idee: 900,
  /** Voice/humor/wordplay must survive — keep generous. */
  ton: 1_800,
  grob: 1_200,
  expose: 1_400,
  charaktere: 1_800,
  weltSchau: 500,
  weltRegeln: 500,
  invariants: 1_200,
} as const;

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
 * Compact canon for Manuskript Co-Autor (Sonnet): enough voice/rules,
 * not the full Recherche/Spec dump. Stable enough for light prompt-caching.
 */
export function buildRomanSlimCanon(
  input: RomanStaticBookPrefixInput & {
    wissensGraph?: RomanWissensGraph | null;
  },
): string {
  const expose = exposeTextFromEditorial(input.editorial);
  const chars = formatCharaktere(input.charaktere) || "(noch keine Steckbriefe)";
  const ton = (input.tonalitaet ?? "").trim();
  const grob = (input.grobRegeln ?? input.editorial.grobRegeln ?? "").trim();
  const invariants = (input.wissensGraph?.hardInvariants ?? [])
    .filter((h) => h.trim())
    .slice(0, 12)
    .map((h) => `– ${h.trim().slice(0, 160)}`)
    .join("\n");

  return `# Slim-Canon (verbindlich für Prosa — Stimme & Regeln; Plot kommt aus dem Kapitel-Paket)
Titel: ${input.title.trim() || "(ohne)"}
Buchtyp: ${BUCHTYP_LABELS[input.buchTyp]} · Genre: ${input.genre.trim() || "—"}
Alter: ${
    input.editorial.zielAlterMin != null || input.editorial.zielAlterMax != null
      ? `${input.editorial.zielAlterMin ?? "?"}-${input.editorial.zielAlterMax ?? "?"}`
      : "?"
  } · Lesestufe: ${input.editorial.lesestufe || "—"}

# Prämisse (kurz)
${input.ideeKurz.trim().slice(0, SLIM.idee) || "(leer)"}

# Ton (MUSS spürbar)
${ton.slice(0, SLIM.ton) || "(aus Spec ableiten)"}

# Harte Regeln (MUSS einhalten)
${grob.slice(0, SLIM.grob) || "(leer)"}

# Exposé (Kern)
${expose.slice(0, SLIM.expose) || "(leer)"}

# Figuren (kurz)
${chars.slice(0, SLIM.charaktere)}

# Welt (kurz)
Schauplätze: ${input.weltSchauplaetze.trim().slice(0, SLIM.weltSchau) || "(leer)"}
Regeln: ${input.weltRegeln.trim().slice(0, SLIM.weltRegeln) || "(leer)"}

# Harte Invarianten (Graph — kein Widerspruch)
${invariants || "(keine)"}`.trim();
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
