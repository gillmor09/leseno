"use server";

/**
 * Manuskript freigeben: Canon + Ledger + deterministic Nahtdopplung (hard);
 * Assist Seam/Emotion/Timeline/Plot-Truth + Style (soft, advisory).
 * Soft findings do not block Roman Verbessern.
 * Co-Autor nachziehen: Canon → Formulierungs-Variation → Seam_dup → Ledger.
 * „Erneut prüfen“ keeps settled by default (`clearSettled` to wipe).
 * No Opus.
 */

import { z } from "zod";
import { denyUnlessAdmin } from "@/lib/auth/require-admin";
import {
  emptyRomanEditorial,
  hardManuskriptFreigabeFindings,
  manuskriptFreigabeFingerprint,
  withManuskriptFreigabe,
  withPipelineTabFertig,
  type ManuskriptFreigabeFinding,
  type ManuskriptFreigabeState,
} from "@/lib/roman/editorial";
import { runFreigabeAudits } from "@/lib/roman/manuskript-freigabe-audit";
import { runManuskriptSeamPayoffPass } from "@/lib/roman/manuskript-seam-payoff";
import { runManuskriptContinuityLedgerPass } from "@/lib/roman/manuskript-continuity-ledger";
import {
  applyManuskriptContinuityFixes,
  editorialAfterContinuityApply,
  scanManuskriptContinuity,
} from "@/lib/roman/manuskript-continuity-pass";
import {
  runManuskriptPhraseVariationPass,
  seedPhrasesFromFreigabeFindings,
} from "@/lib/roman/manuskript-phrase-variation";
import {
  filterFindingsAgainstSettled,
  mergeSettled,
  settledFromFinding,
  type ManuskriptFreigabeSettled,
} from "@/lib/roman/manuskript-freigabe-settle";
import { getRomanKontext, upsertRomanKontext } from "@/lib/roman/repository";
import { revalidateRomanAdmin } from "@/lib/roman/revalidate-admin";
import { hasFilledManuskript } from "@/lib/roman/suggest-manuskript";
import type { RomanKontext } from "@/lib/roman/types";
import type { ActionResult } from "@/lib/types/actions";

export { runFreigabeAudits };

const schema = z.object({
  romanId: z.string().uuid({ message: "Ungültige Buch-ID." }),
  /** When true, store overrideAt so Verbessern may run despite findings. */
  override: z.boolean().optional(),
  /**
   * Keep settled suppressions. Default true — „Erneut prüfen“ must not wipe
   * Nachziehen-Settlements (Assist otherwise re-lists forever).
   * Explicit `false` clears (legacy). Prefer `clearSettled`.
   */
  preserveSettled: z.boolean().optional(),
  /** Opt-in wipe of settled suppressions (full re-open of ignored hints). */
  clearSettled: z.boolean().optional(),
});

export type { ManuskriptFreigabeFinding };

function persistFields(roman: RomanKontext) {
  return {
    id: roman.id,
    title: roman.title,
    manuskriptRaw: roman.manuskriptRaw,
    stilbibel: roman.stilbibel,
    genre: roman.genre,
    praemisse: roman.praemisse,
    perspektive: roman.perspektive,
    zeitform: roman.zeitform,
    tonalitaet: roman.tonalitaet,
    charaktere: roman.charaktere,
    weltSchauplaetze: roman.weltSchauplaetze,
    weltRegeln: roman.weltRegeln,
    szenenRaster: roman.szenenRaster,
    kiRegelwerk: roman.kiRegelwerk,
    fanPersonaName: roman.fanPersonaName,
    fanPersonaProfil: roman.fanPersonaProfil,
  };
}

/**
 * Assist-model audit, save on editorial. Throws/errors on model failure
 * (never pretends “alles ok” via empty findings).
 */
export async function auditManuskriptFreigabeAction(
  input: unknown,
): Promise<
  ActionResult<{
    roman: RomanKontext;
    findings: ManuskriptFreigabeFinding[];
    summary: string;
    freigabe: ManuskriptFreigabeState;
  }>
> {
  const denied = await denyUnlessAdmin();
  if (denied) return { success: false, error: denied };

  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Eingabe ungültig.",
    };
  }

  try {
    const roman0 = await getRomanKontext(parsed.data.romanId);
    if (!roman0) {
      return { success: false, error: "Buch nicht gefunden." };
    }
    const editorial0 = roman0.editorial ?? emptyRomanEditorial();
    if (editorial0.buchTyp === "clever_erzaehlt") {
      const freigabe: ManuskriptFreigabeState = {
        checkedAt: new Date().toISOString(),
        textFingerprint: manuskriptFreigabeFingerprint(
          editorial0.manuskriptText ?? "",
        ),
        findings: [],
        overrideAt: null,
      };
      const nextEd = withManuskriptFreigabe(editorial0, freigabe);
      const roman = await upsertRomanKontext({
        ...persistFields(roman0),
        editorial: nextEd,
      });
      revalidateRomanAdmin(roman.id);
      return {
        success: true,
        data: {
          roman,
          findings: [],
          summary: "Clever erzählt — Seam/Payoff-Check entfällt.",
          freigabe,
        },
      };
    }

    const text = (editorial0.manuskriptText ?? "").trim();
    if (!hasFilledManuskript(text)) {
      return {
        success: false,
        error: "Zuerst ein Manuskript anlegen, bevor du freigibst.",
      };
    }

    const structured = editorial0.szenenplotStructured ?? null;
    const rawFindings = await runFreigabeAudits({
      manuskriptText: text,
      structured,
      wissensGraph: editorial0.wissensGraph,
      storyState: editorial0.storyState,
      charaktere: roman0.charaktere,
      tonalitaet: roman0.tonalitaet,
    });

    // Default: keep settled. Only wipe when clearSettled or preserveSettled:false.
    const wipeSettled =
      parsed.data.clearSettled === true ||
      parsed.data.preserveSettled === false;
    const settled: ManuskriptFreigabeSettled[] | undefined = wipeSettled
      ? undefined
      : editorial0.manuskriptFreigabe?.settled;
    const findings = filterFindingsAgainstSettled(
      rawFindings,
      settled,
    );

    const hardCount = hardManuskriptFreigabeFindings(findings).length;
    const softCount = findings.length - hardCount;
    const now = new Date().toISOString();
    const freigabe: ManuskriptFreigabeState = {
      checkedAt: now,
      textFingerprint: manuskriptFreigabeFingerprint(text),
      findings,
      overrideAt:
        hardCount > 0 && parsed.data.override ? now : null,
      ...(settled?.length ? { settled } : {}),
    };

    const nextEd = withManuskriptFreigabe(editorial0, freigabe);
    const roman = await upsertRomanKontext({
      ...persistFields(roman0),
      editorial: nextEd,
    });
    revalidateRomanAdmin(roman.id);

    const softOnly = hardCount === 0 && findings.length > 0;
    const summary =
      findings.length === 0
        ? "Canon/Ledger/Nahtdopplung: keine harten Treffer — Freigabe ok für Stil-Pass."
        : softOnly
          ? `${softCount} weiche Assist-/Stil-Hinweis${softCount === 1 ? "" : "e"} (blockieren nicht) — Freigabe ok für Stil-Pass.`
          : parsed.data.override
            ? `Freigabe mit ${hardCount} harten Hinweis${hardCount === 1 ? "" : "en"} (Override)${softCount > 0 ? ` · ${softCount} weich` : ""}.`
            : `Noch ${hardCount} harte Hinweis${hardCount === 1 ? "" : "e"} (Canon/Ledger/Nahtdopplung)${softCount > 0 ? ` · ${softCount} weich` : ""} — bitte nachziehen oder überschreiben.`;

    return {
      success: true,
      data: { roman, findings, summary, freigabe },
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Freigabe-Check fehlgeschlagen.",
    };
  }
}

/**
 * Co-Autor nachziehen for open freigabe findings (Seam + Emotion + Ledger),
 * then re-audit. Cheap Flash/Co-Autor — not Opus. Optionally marks schreiben
 * fertig when the re-check is clean.
 */
export async function applyManuskriptFreigabeFixesAction(
  input: unknown,
): Promise<
  ActionResult<{
    roman: RomanKontext;
    findings: ManuskriptFreigabeFinding[];
    summary: string;
    freigabe: ManuskriptFreigabeState;
    patchedChapters: number[];
    autoFreigegeben: boolean;
  }>
> {
  const denied = await denyUnlessAdmin();
  if (denied) return { success: false, error: denied };

  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Eingabe ungültig.",
    };
  }

  try {
    let roman = await getRomanKontext(parsed.data.romanId);
    if (!roman) {
      return { success: false, error: "Buch nicht gefunden." };
    }
    const editorial0 = roman.editorial ?? emptyRomanEditorial();
    if (editorial0.buchTyp === "clever_erzaehlt") {
      return {
        success: false,
        error: "Clever erzählt braucht keinen Seam/Payoff-Nachzug.",
      };
    }
    if (!hasFilledManuskript(editorial0.manuskriptText ?? "")) {
      return { success: false, error: "Kein Manuskript zum Nachziehen." };
    }

    // Use the Freigabe-Check findings the author just saw — a fresh Assist
    // re-audit often returns empty/different findings, so Nachziehen looked
    // like a no-op. Style/stockphrase still need Dimensions-Stil.
    const stored = editorial0.manuskriptFreigabe?.findings ?? [];
    // Hard seam only: deterministic Nahtdopplung (Assist seam is soft).
    const seamSeeds = stored
      .filter(
        (f) =>
          !f.soft &&
          f.source === "seam" &&
          f.kind === "seam_dup" &&
          !/kein\s+problem|kein\s+befund|\bok\b\s*$/i.test(f.summary),
      )
      .map((f) => ({
        kind: "seam" as const,
        chapterNumbers: f.chapterNumbers,
        summary: f.summary,
        patchFocus: f.summary.slice(0, 320),
      }));
    const ledgerSeeds = stored
      .filter(
        (f) =>
          !f.soft &&
          f.source === "ledger" &&
          (f.kind === "timeline" ||
            f.kind === "money" ||
            f.kind === "knowledge"),
      )
      .map((f) => ({
        kind: f.kind as "timeline" | "money" | "knowledge",
        chapterNumbers: f.chapterNumbers,
        summary: f.summary,
      }));

    const hardStored = hardManuskriptFreigabeFindings(stored);
    const hasCanonHard = hardStored.some((f) => f.source === "canon");
    const stylePhrases = seedPhrasesFromFreigabeFindings(stored);
    const hasStyleRepeat =
      stylePhrases.length > 0 ||
      stored.some(
        (f) =>
          f.source === "style" &&
          (f.kind === "style_repeat" ||
            /stockphrase|formulierungs-variation/i.test(f.summary)),
      );
    const patchableHard =
      seamSeeds.length + ledgerSeeds.length + (hasCanonHard ? 1 : 0);
    const patchableAny = patchableHard + (hasStyleRepeat ? 1 : 0);
    if (patchableAny === 0) {
      if (stored.length === 0) {
        return {
          success: false,
          error: "Keine Hinweise zum Nachziehen.",
        };
      }
      return {
        success: false,
        error:
          "Nur weiche Assist-/Stil-Hinweise offen — die blockieren nicht. Nachziehen greift Canon, Ledger, Nahtdopplung und Formulierungs-Wiederholungen.",
      };
    }

    // One pass per click. Canon → Formulierungs-Variation → Seam → Emotion → Ledger.
    let seamPatched: number[] = [];
    let ledgerPatched: number[] = [];
    let canonPatched: number[] = [];
    let stylePatched: number[] = [];
    /** Stale Canon freigabe rows that a fresh scan no longer flags. */
    let canonAlreadyClean = false;
    /** Style freigabe listed sagte-sie noise — refresh only. */
    let styleAlreadyClean = false;
    let passSummary = "";
    /** Findings this click addressed — suppressed on re-audit until Erneut prüfen. */
    let addressedFindings: ManuskriptFreigabeFinding[] = [];
    if (hasCanonHard) {
      addressedFindings = stored.filter((f) => !f.soft && f.source === "canon");
      const edCanon = roman.editorial ?? emptyRomanEditorial();
      const text0 = (edCanon.manuskriptText ?? "").trim();
      const scan = await scanManuskriptContinuity({
        sourceText: text0,
        target: "manuskript",
        wissensGraph: edCanon.wissensGraph,
        charaktere: roman.charaktere,
      });
      if (scan.fixes.length > 0) {
        const applied = applyManuskriptContinuityFixes({
          sourceText: text0,
          docFormat: "manuskript",
          wissensGraph: edCanon.wissensGraph,
          fixes: scan.fixes,
        });
        if (applied.appliedCount > 0) {
          const appliedFixes = scan.fixes.filter((f) =>
            applied.appliedIds.includes(f.id),
          );
          const nextEd = editorialAfterContinuityApply(edCanon, {
            target: "manuskript",
            text: applied.text,
            wissensGraph: applied.wissensGraph,
            appliedFixes,
          });
          roman = await upsertRomanKontext({
            ...persistFields(roman),
            editorial: nextEd,
          });
          canonPatched = [
            ...new Set(appliedFixes.map((f) => f.chapter)),
          ].sort((a, b) => a - b);
          passSummary = `Canon-Kontinuität: ${applied.appliedCount} Korrektur${
            applied.appliedCount === 1 ? "" : "en"
          } (Kap. ${canonPatched.join(", ")})`;
        } else {
          passSummary =
            "Canon-Kontinuität: Scan hatte Treffer, aber keine Ersetzung gegriffen.";
        }
      } else {
        // Old scanner matched Kennzeichen across cars → Freigabe showed
        // flip-flops; nearest-prop scan is already clean.
        canonAlreadyClean = true;
        passSummary =
          "Canon-Kontinuität: Kennzeichen/Maße bereits konsistent — Prüfung aktualisiert.";
      }
    } else if (hasStyleRepeat) {
      addressedFindings = stored.filter(
        (f) =>
          f.source === "style" &&
          (f.kind === "style_repeat" ||
            /stockphrase|formulierungs-variation/i.test(f.summary)),
      );
      const style = await runManuskriptPhraseVariationPass({
        roman,
        seedPhrases: stylePhrases,
      });
      roman = style.roman;
      stylePatched = style.patchedChapters;
      passSummary = style.summary;
      styleAlreadyClean = Boolean(style.alreadyClean);
    } else if (seamSeeds.length > 0) {
      addressedFindings = stored.filter(
        (f) =>
          !f.soft && f.source === "seam" && f.kind === "seam_dup",
      );
      const seam = await runManuskriptSeamPayoffPass({
        roman,
        seedFindings: seamSeeds,
      });
      roman = seam.roman;
      seamPatched = seam.patchedChapters;
      passSummary = seam.summary;
    } else if (ledgerSeeds.length > 0) {
      addressedFindings = stored.filter(
        (f) =>
          !f.soft &&
          f.source === "ledger" &&
          (f.kind === "timeline" ||
            f.kind === "money" ||
            f.kind === "knowledge"),
      );
      const ledger = await runManuskriptContinuityLedgerPass({
        roman,
        seedFindings: ledgerSeeds,
      });
      roman = ledger.roman;
      ledgerPatched = ledger.patchedChapters;
      passSummary = ledger.summary;
    }

    const patchedChapters = [
      ...new Set([
        ...canonPatched,
        ...seamPatched,
        ...ledgerPatched,
        ...stylePatched,
      ]),
    ].sort((a, b) => a - b);

    if (
      patchedChapters.length === 0 &&
      patchableAny > 0 &&
      !canonAlreadyClean &&
      !styleAlreadyClean
    ) {
      return {
        success: false,
        error:
          passSummary.trim() ||
          "Keine sichtbare Textänderung — bitte erneut versuchen oder Hinweise in der Dimensions-Logik/Stil bearbeiten.",
      };
    }

    const ed = roman.editorial ?? emptyRomanEditorial();
    const text = (ed.manuskriptText ?? "").trim();
    // Fail-soft: patches are already saved; a truncated Emotion-JSON must not
    // roll the whole Nachziehen back to “nothing happened”.
    let findings: ManuskriptFreigabeFinding[] = [];
    let reauditNote = "";
    try {
      findings = await runFreigabeAudits({
        manuskriptText: text,
        structured: ed.szenenplotStructured ?? null,
        wissensGraph: ed.wissensGraph,
        storyState: ed.storyState,
        charaktere: roman.charaktere,
        tonalitaet: roman.tonalitaet,
      });
    } catch (auditErr) {
      findings = ed.manuskriptFreigabe?.findings ?? stored;
      reauditNote =
        auditErr instanceof Error
          ? ` Nachprüfung unvollständig: ${auditErr.message.slice(0, 120)}`
          : " Nachprüfung unvollständig.";
    }

    const now = new Date().toISOString();
    const newlySettled = addressedFindings.map((f) =>
      settledFromFinding(f, now),
    );
    const settled = mergeSettled(
      editorial0.manuskriptFreigabe?.settled,
      newlySettled,
    );
    // Drop the block just nachgezogen — Assist/phrase scan otherwise re-lists it.
    findings = filterFindingsAgainstSettled(findings, settled);

    const freigabe: ManuskriptFreigabeState = {
      checkedAt: now,
      textFingerprint: manuskriptFreigabeFingerprint(text),
      findings,
      overrideAt: null,
      ...(settled.length ? { settled } : {}),
    };

    let nextEd = withManuskriptFreigabe(ed, freigabe);
    const hardLeft = hardManuskriptFreigabeFindings(findings).length;
    const autoFreigegeben = hardLeft === 0;
    if (autoFreigegeben) {
      nextEd = withPipelineTabFertig(nextEd, "schreiben", true);
    }

    roman = await upsertRomanKontext({
      ...persistFields(roman),
      editorial: nextEd,
    });
    revalidateRomanAdmin(roman.id);

    const patchNote =
      patchedChapters.length > 0
        ? `Kap. ${patchedChapters.join(", ")} nachgezogen`
        : passSummary || "Prüfung aktualisiert";
    const summary = `${
      autoFreigegeben
        ? `Harte Hinweise behoben (${patchNote}) — Manuskript freigegeben.`
        : `Nachziehen (${patchNote}). Noch ${hardLeft} harte Hinweis${hardLeft === 1 ? "" : "e"} — bitte erneut „Hinweise nachziehen“ für den nächsten Block.`
    }${reauditNote}`;

    return {
      success: true,
      data: {
        roman,
        findings,
        summary,
        freigabe,
        patchedChapters,
        autoFreigegeben,
      },
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Nachziehen fehlgeschlagen.",
    };
  }
}
