"use server";

/**
 * Author freigabe for process phases (canon switch).
 * Separate from Hard-Gates and pipelineFertig chrome.
 */

import { z } from "zod";
import { denyUnlessAdmin } from "@/lib/auth/require-admin";
import { emptyRomanEditorial } from "@/lib/roman/editorial";
import { fingerprintForPhase } from "@/lib/roman/phase-fingerprints";
import {
  approvePhase,
  getPhaseState,
  markDownstreamPhasesStale,
  revokePhaseApproval,
  type RomanSourceRef,
} from "@/lib/roman/phase-state";
import { PROCESS_PHASES } from "@/lib/roman/pipeline/stages";
import {
  historyEvent,
  startPipelineHistoryRun,
  updatePipelineHistoryRun,
} from "@/lib/roman/pipeline/history";
import {
  getRomanKontext,
  setRomanEditorial,
} from "@/lib/roman/repository";
import { revalidateRomanAdmin } from "@/lib/roman/revalidate-admin";
import { freezeSzenenplotSchreibPrompts } from "@/lib/roman/suggest-szenenplot-detail";
import type { ActionResult } from "@/lib/types/actions";

const phaseSchema = z.enum(PROCESS_PHASES);

function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Eingabe ungültig.";
}

/**
 * Approve a phase with current fingerprint; marks downstream stale.
 */
export async function approveRomanPhaseAction(
  input: unknown,
): Promise<
  ActionResult<{ roman: NonNullable<Awaited<ReturnType<typeof getRomanKontext>>> }>
> {
  const denied = await denyUnlessAdmin();
  if (denied) return { success: false, error: denied };

  const parsed = z
    .object({
      romanId: z.string().uuid({ message: "Ungültige Buch-ID." }),
      phase: phaseSchema,
    })
    .safeParse(input);
  if (!parsed.success) {
    return { success: false, error: firstIssue(parsed.error) };
  }

  try {
    const roman = await getRomanKontext(parsed.data.romanId);
    if (!roman) return { success: false, error: "Buch nicht gefunden." };
    const editorial = roman.editorial ?? emptyRomanEditorial();
    const fp = fingerprintForPhase(parsed.data.phase, {
      ...roman,
      editorial,
    });
    if (!fp) {
      return {
        success: false,
        error: "Phase hat noch keinen freigabefähigen Inhalt.",
      };
    }
    const prevEntry = getPhaseState(editorial, parsed.data.phase);
    const prevFp = (prevEntry.fingerprint ?? "").trim();
    // Same content re-confirmed (e.g. stale from soft upstream note, or freeze
    // stamp): keep downstream freigaben — only cascade when the hash moved.
    const contentChanged = !prevFp || prevFp !== fp;
    let nextEd = approvePhase(editorial, parsed.data.phase, fp);
    // Szenen-Freigabe freezes schreibPrompts (was Fertig-Toggle side effect).
    if (
      parsed.data.phase === "szenen" &&
      nextEd.szenenplotStructured?.chapters.length
    ) {
      nextEd = {
        ...nextEd,
        szenenplotStructured: freezeSzenenplotSchreibPrompts(
          nextEd.szenenplotStructured,
        ),
      };
      // Freeze may change structured bytes — keep freigabe on the new hash.
      const fpAfterFreeze = fingerprintForPhase(parsed.data.phase, {
        ...roman,
        editorial: nextEd,
      });
      if (fpAfterFreeze && fpAfterFreeze !== fp) {
        nextEd = approvePhase(nextEd, parsed.data.phase, fpAfterFreeze);
      }
    }
    if (contentChanged) {
      nextEd = markDownstreamPhasesStale(
        nextEd,
        parsed.data.phase,
        `Freigabe „${parsed.data.phase}“ — Downstream prüfen`,
      );
    }
    await setRomanEditorial(parsed.data.romanId, nextEd);

    const historyStage =
      parsed.data.phase === "lektorat" || parsed.data.phase === "export"
        ? "manuskript"
        : parsed.data.phase;
    const event = historyEvent({
      type: "info",
      stage: historyStage,
      summary: `Freigabe · ${parsed.data.phase}`,
      detail: `Fingerprint ${fp.slice(0, 12)}…`,
    });
    const runId = await startPipelineHistoryRun({
      romanId: parsed.data.romanId,
      trigger: "phase_freigabe",
      originStage: historyStage,
      firstEvent: event,
    });
    await updatePipelineHistoryRun({
      runId,
      status: "ok",
      events: [event],
    });

    revalidateRomanAdmin(parsed.data.romanId);
    const saved = await getRomanKontext(parsed.data.romanId, {
      omitCover: true,
    });
    if (!saved) return { success: false, error: "Buch nicht gefunden." };
    return { success: true, data: { roman: saved } };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Freigabe fehlgeschlagen.",
    };
  }
}

/** Revoke freigabe back to draft. */
export async function revokeRomanPhaseAction(
  input: unknown,
): Promise<
  ActionResult<{ roman: NonNullable<Awaited<ReturnType<typeof getRomanKontext>>> }>
> {
  const denied = await denyUnlessAdmin();
  if (denied) return { success: false, error: denied };

  const parsed = z
    .object({
      romanId: z.string().uuid({ message: "Ungültige Buch-ID." }),
      phase: phaseSchema,
    })
    .safeParse(input);
  if (!parsed.success) {
    return { success: false, error: firstIssue(parsed.error) };
  }

  try {
    const roman = await getRomanKontext(parsed.data.romanId);
    if (!roman) return { success: false, error: "Buch nicht gefunden." };
    const editorial = roman.editorial ?? emptyRomanEditorial();
    const nextEd = revokePhaseApproval(editorial, parsed.data.phase);
    await setRomanEditorial(parsed.data.romanId, nextEd);
    revalidateRomanAdmin(parsed.data.romanId);
    const saved = await getRomanKontext(parsed.data.romanId, {
      omitCover: true,
    });
    if (!saved) return { success: false, error: "Buch nicht gefunden." };
    return { success: true, data: { roman: saved } };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Freigabe zurücknehmen fehlgeschlagen.",
    };
  }
}

/**
 * Import freitext into Idee and register a source citation.
 */
export async function importRomanIdeeTextAction(
  input: unknown,
): Promise<
  ActionResult<{ roman: NonNullable<Awaited<ReturnType<typeof getRomanKontext>>> }>
> {
  const denied = await denyUnlessAdmin();
  if (denied) return { success: false, error: denied };

  const parsed = z
    .object({
      romanId: z.string().uuid({ message: "Ungültige Buch-ID." }),
      text: z
        .string()
        .trim()
        .min(40, { message: "Bitte mindestens 40 Zeichen importieren." })
        .max(40_000),
      label: z.string().trim().max(120).optional(),
      replace: z.boolean().optional(),
    })
    .safeParse(input);
  if (!parsed.success) {
    return { success: false, error: firstIssue(parsed.error) };
  }

  try {
    const roman = await getRomanKontext(parsed.data.romanId);
    if (!roman) return { success: false, error: "Buch nicht gefunden." };
    const editorial = roman.editorial ?? emptyRomanEditorial();
    const source: RomanSourceRef = {
      id: `imp_${Date.now().toString(36)}`,
      kind: "import",
      label: parsed.data.label?.trim() || "Freitext-Import",
      excerpt: parsed.data.text.slice(0, 400),
      createdAt: new Date().toISOString(),
    };
    const prevIdee = (editorial.ideeKurz ?? "").trim();
    const nextIdee = parsed.data.replace
      ? parsed.data.text.trim()
      : prevIdee
        ? `${prevIdee}\n\n---\n\n${parsed.data.text.trim()}`
        : parsed.data.text.trim();
    const sources = [...(editorial.romanSources ?? []), source].slice(-40);
    let nextEd = markDownstreamPhasesStale(
      {
        ...editorial,
        ideeKurz: nextIdee,
        romanSources: sources,
      },
      "idee",
      "Idee-Import",
    );
    // Invalidate freigabe on idee when content changes
    nextEd = revokePhaseApproval(nextEd, "idee");
    await setRomanEditorial(parsed.data.romanId, nextEd);
    revalidateRomanAdmin(parsed.data.romanId);
    const saved = await getRomanKontext(parsed.data.romanId, {
      omitCover: true,
    });
    if (!saved) return { success: false, error: "Buch nicht gefunden." };
    return { success: true, data: { roman: saved } };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Import fehlgeschlagen.",
    };
  }
}
