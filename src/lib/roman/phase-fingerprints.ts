/**
 * Canonical fingerprints for phase freigabe (content hash of freigabe-relevant fields).
 */

import {
  exposeTextFromEditorial,
  type RomanEditorial,
} from "@/lib/roman/editorial";
import { formatCharaktere } from "@/lib/roman/fundament";
import { emptyVorsatz } from "@/lib/roman/front-matter";
import {
  fingerprintText,
  getPhaseState,
  withPhaseState,
} from "@/lib/roman/phase-state";
import type { ProcessPhase } from "@/lib/roman/pipeline/stages";
import { structuredKapitelGeruestToMarkdown } from "@/lib/roman/szenenplot-structured";
import { structuredSzenenplotToMarkdown } from "@/lib/roman/szenenplot-structured";
import type { RomanCharakter, RomanKontext } from "@/lib/roman/types";

/** Minimal roman fields needed to hash a process phase. */
export type PhaseFingerprintRoman = Pick<
  RomanKontext,
  | "title"
  | "genre"
  | "tonalitaet"
  | "perspektive"
  | "zeitform"
  | "charaktere"
  | "weltSchauplaetze"
  | "weltRegeln"
  | "manuskriptRaw"
> & {
  editorial: RomanEditorial;
  /** Optional — only needed for Export freigabe fingerprint. */
  coverImageDataUrl?: string;
  coverPrompt?: string;
  autorName?: string;
  vorsatz?: RomanKontext["vorsatz"] | null;
};

const EMPTY_FINGERPRINT_ROMAN: Omit<PhaseFingerprintRoman, "editorial"> = {
  title: "",
  genre: "",
  tonalitaet: "",
  perspektive: "",
  zeitform: "",
  charaktere: [],
  weltSchauplaetze: "",
  weltRegeln: "",
  manuskriptRaw: "",
  coverImageDataUrl: "",
  coverPrompt: "",
  autorName: "",
  vorsatz: emptyVorsatz(),
};

/** Compact cover token — avoid hashing multi-MB data URLs. */
function coverFingerprintToken(dataUrl: string | null | undefined): string {
  const raw = (dataUrl ?? "").trim();
  if (!raw) return "";
  return `cover:${raw.length}:${raw.slice(0, 24)}:${raw.slice(-24)}`;
}

export function fingerprintForPhase(
  phase: ProcessPhase,
  roman: PhaseFingerprintRoman,
): string {
  const ed = roman.editorial;
  switch (phase) {
    case "idee":
      return fingerprintText([ed.ideeKurz]);
    case "rahmen":
      return fingerprintText([
        roman.genre,
        roman.tonalitaet,
        roman.perspektive,
        roman.zeitform,
        ed.grobRegeln,
        ed.harteRegeln.join("|"),
        String(ed.zielWortzahlRoman ?? ""),
        String(ed.zielAlterMin ?? ""),
        String(ed.zielAlterMax ?? ""),
        ed.lesestufe,
      ]);
    case "fundament":
      return fingerprintText([
        formatCharaktere(roman.charaktere as RomanCharakter[]),
        roman.weltSchauplaetze,
        roman.weltRegeln,
      ]);
    case "expose":
      return fingerprintText([exposeTextFromEditorial(ed)]);
    case "graph":
      return fingerprintText([
        JSON.stringify(ed.wissensGraph?.nodes?.length ?? 0),
        JSON.stringify(
          (ed.wissensGraph?.nodes ?? [])
            .map((n) => `${n.id}:${n.label}:${JSON.stringify(n.attrs ?? {})}`)
            .slice(0, 200),
        ),
        (ed.wissensGraph?.hardInvariants ?? []).join("|"),
      ]);
    case "plot":
      return fingerprintText([
        ed.kapitelGeruestStructured
          ? structuredKapitelGeruestToMarkdown(ed.kapitelGeruestStructured)
          : ed.kapitelGeruestRaw,
      ]);
    case "szenen":
      return fingerprintText([
        ed.szenenplotStructured
          ? structuredSzenenplotToMarkdown(ed.szenenplotStructured)
          : roman.manuskriptRaw,
      ]);
    case "manuskript":
      return fingerprintText([ed.manuskriptText]);
    case "lektorat":
      return fingerprintText([
        ed.manuskriptText,
        ed.romanText,
        ed.manuskriptFreigabe?.checkedAt ?? "",
      ]);
    case "export":
      return fingerprintText([
        coverFingerprintToken(roman.coverImageDataUrl),
        roman.coverPrompt ?? "",
        roman.autorName ?? "",
        JSON.stringify(roman.vorsatz ?? null),
        ed.klappentext,
        ed.einzeiler,
        (ed.amazonKeywords ?? []).join("|"),
        JSON.stringify(ed.hoerbuchPrefs ?? null),
      ]);
    default:
      return fingerprintText([]);
  }
}

/**
 * Downstream / side-effect updates (Graph-Grow, Kontinuitäts-Sync, Prompt-Freeze)
 * may change freigabe-relevant bytes while the author still stands by the phase.
 * Refresh the stored fingerprint so freigabe does not look revoked.
 * Does not restore freigabe when status is already `stale`/`draft`.
 */
export function retainApprovedPhaseFingerprint(
  editorial: RomanEditorial,
  phase: ProcessPhase,
  roman?: Partial<Omit<PhaseFingerprintRoman, "editorial">>,
): RomanEditorial {
  const entry = getPhaseState(editorial, phase);
  if (entry.status !== "approved") return editorial;
  const fp = fingerprintForPhase(phase, {
    ...EMPTY_FINGERPRINT_ROMAN,
    ...roman,
    editorial,
    manuskriptRaw: roman?.manuskriptRaw ?? EMPTY_FINGERPRINT_ROMAN.manuskriptRaw,
  });
  if (!fp || entry.fingerprint === fp) return editorial;
  return withPhaseState(editorial, phase, {
    ...entry,
    fingerprint: fp,
    staleReason: null,
  });
}

/**
 * Downstream Plot/Szenen/Manuskript may grow `wissensGraph` while Graph stays
 * author-approved. Refresh the stored fingerprint so freigabe does not look
 * revoked. Does not restore freigabe when status is already `stale`/`draft`
 * (upstream edit or revoke).
 */
export function retainApprovedGraphFingerprint(
  editorial: RomanEditorial,
): RomanEditorial {
  return retainApprovedPhaseFingerprint(editorial, "graph");
}

/**
 * After Manuskript craft sync / freeze stamps touch Szenen (and optionally Plot),
 * keep those freigaben when still `approved`.
 */
export function retainApprovedStructureFingerprints(
  editorial: RomanEditorial,
  roman?: Partial<Omit<PhaseFingerprintRoman, "editorial">>,
): RomanEditorial {
  // Guard: callers must pass RomanEditorial directly. A wrapper like
  // `{ editorial: nextEd, … }` has no top-level ideeKurz/phaseState; returning
  // it (or feeding it to parseRomanEditorial) wiped live roman editorials.
  const maybeWrapped = editorial as unknown as {
    editorial?: RomanEditorial;
    ideeKurz?: unknown;
  };
  if (
    maybeWrapped &&
    typeof maybeWrapped === "object" &&
    maybeWrapped.editorial &&
    typeof maybeWrapped.editorial === "object" &&
    typeof maybeWrapped.ideeKurz !== "string"
  ) {
    throw new Error(
      "retainApprovedStructureFingerprints: pass RomanEditorial as first arg, not { editorial: … }",
    );
  }
  let next = retainApprovedGraphFingerprint(editorial);
  next = retainApprovedPhaseFingerprint(next, "plot", roman);
  next = retainApprovedPhaseFingerprint(next, "szenen", roman);
  return next;
}
