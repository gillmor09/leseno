"use server";

/**
 * Manuskript freigeben: cheap Seam/Payoff (+ Emotion) audit + optional
 * Co-Autor nachziehen. Persists freigabe on editorial — Roman Verbessern
 * blocked until clean or override. No Opus.
 */

import { z } from "zod";
import { denyUnlessAdmin } from "@/lib/auth/require-admin";
import {
  emptyRomanEditorial,
  manuskriptFreigabeFingerprint,
  withManuskriptFreigabe,
  withPipelineTabFertig,
  type ManuskriptFreigabeFinding,
  type ManuskriptFreigabeState,
} from "@/lib/roman/editorial";
import {
  auditManuskriptEmotionalConsequence,
  runManuskriptEmotionalConsequencePass,
} from "@/lib/roman/manuskript-emotional-consequence";
import {
  auditManuskriptSeamAndPayoff,
  runManuskriptSeamPayoffPass,
} from "@/lib/roman/manuskript-seam-payoff";
import { getRomanKontext, upsertRomanKontext } from "@/lib/roman/repository";
import { revalidateRomanAdmin } from "@/lib/roman/revalidate-admin";
import { hasFilledManuskript } from "@/lib/roman/suggest-manuskript";
import type { RomanSzenenplotStructured } from "@/lib/roman/szenenplot-structured";
import type { RomanKontext } from "@/lib/roman/types";
import type { ActionResult } from "@/lib/types/actions";

const schema = z.object({
  romanId: z.string().uuid({ message: "Ungültige Buch-ID." }),
  /** When true, store overrideAt so Verbessern may run despite findings. */
  override: z.boolean().optional(),
});

export type { ManuskriptFreigabeFinding };

async function runFreigabeAudits(input: {
  manuskriptText: string;
  structured: RomanSzenenplotStructured | null;
}): Promise<ManuskriptFreigabeFinding[]> {
  const [seam, emotion] = await Promise.all([
    auditManuskriptSeamAndPayoff({
      manuskriptText: input.manuskriptText,
      structured: input.structured,
      strict: true,
    }),
    auditManuskriptEmotionalConsequence({
      manuskriptText: input.manuskriptText,
      structured: input.structured,
      strict: true,
    }),
  ]);
  return [
    ...seam.map((f) => ({
      source: "seam" as const,
      kind: f.kind,
      chapterNumbers: f.chapterNumbers,
      summary: f.summary,
    })),
    ...emotion.map((f) => ({
      source: "emotion" as const,
      kind: f.kind,
      chapterNumbers: f.chapterNumbers,
      summary: f.summary,
    })),
  ];
}

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
    const findings = await runFreigabeAudits({
      manuskriptText: text,
      structured,
    });

    const now = new Date().toISOString();
    const freigabe: ManuskriptFreigabeState = {
      checkedAt: now,
      textFingerprint: manuskriptFreigabeFingerprint(text),
      findings,
      overrideAt:
        findings.length > 0 && parsed.data.override ? now : null,
    };

    const nextEd = withManuskriptFreigabe(editorial0, freigabe);
    const roman = await upsertRomanKontext({
      ...persistFields(roman0),
      editorial: nextEd,
    });
    revalidateRomanAdmin(roman.id);

    const summary =
      findings.length === 0
        ? "Seam/Payoff und Emotion: keine klaren Schwächen — Freigabe ok für Stil-Pass."
        : parsed.data.override
          ? `Freigabe mit ${findings.length} offenen Hinweis${findings.length === 1 ? "" : "en"} (Override).`
          : `Noch ${findings.length} Hinweis${findings.length === 1 ? "" : "e"} vor dem Feinschliff — bitte nachziehen oder überschreiben.`;

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
 * Co-Autor nachziehen for open freigabe findings (Seam + Emotion), then
 * re-audit. Cheap Flash/Co-Autor — not Opus. Optionally marks schreiben fertig
 * when the re-check is clean.
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

    const seam = await runManuskriptSeamPayoffPass({ roman });
    roman = seam.roman;
    const emo = await runManuskriptEmotionalConsequencePass({ roman });
    roman = emo.roman;

    const ed = roman.editorial ?? emptyRomanEditorial();
    const text = (ed.manuskriptText ?? "").trim();
    const findings = await runFreigabeAudits({
      manuskriptText: text,
      structured: ed.szenenplotStructured ?? null,
    });

    const now = new Date().toISOString();
    const freigabe: ManuskriptFreigabeState = {
      checkedAt: now,
      textFingerprint: manuskriptFreigabeFingerprint(text),
      findings,
      overrideAt: null,
    };

    const patchedChapters = [
      ...new Set([...seam.patchedChapters, ...emo.patchedChapters]),
    ].sort((a, b) => a - b);

    let nextEd = withManuskriptFreigabe(ed, freigabe);
    const autoFreigegeben = findings.length === 0;
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
        : "keine sichtbare Patch-Wirkung";
    const summary = autoFreigegeben
      ? `Hinweise behoben (${patchNote}) — Manuskript freigegeben.`
      : `Nachziehen (${patchNote}). Noch ${findings.length} Hinweis${findings.length === 1 ? "" : "e"} — bitte prüfen oder erneut nachziehen.`;

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
