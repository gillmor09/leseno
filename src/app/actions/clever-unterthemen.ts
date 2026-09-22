"use server";

/**
 * Clever erzählt: Wissenssammler → 10 Unterthemen + Fakten;
 * Faktenchecker → per-chapter fact verification.
 */

import { z } from "zod";
import { denyUnlessAdmin } from "@/lib/auth/require-admin";
import {
  checkCleverUnterthemaKapitel,
  formatCleverUnterthemenMarkdown,
  applyCleverThemaTitlesToManuskript,
  replaceCriticalCleverFakten,
  suggestCleverUnterthemen,
  type CleverUnterthemen,
} from "@/lib/roman/clever-unterthemen";
import {
  emptyRomanEditorial,
  withPipelineTabFertig,
  type RomanEditorial,
} from "@/lib/roman/editorial";
import {
  normalizeManuskriptDocument,
  replaceManuskriptChapterBody,
} from "@/lib/roman/plot-chapters";
import { getRomanKontext, upsertRomanKontext } from "@/lib/roman/repository";
import { revalidateRomanAdmin } from "@/lib/roman/revalidate-admin";
import type { RomanKontext } from "@/lib/roman/types";
import type { ActionResult } from "@/lib/types/actions";

const idSchema = z.object({
  romanId: z.string().uuid({ message: "Ungültige Buch-ID." }),
});

const checkKapitelSchema = idSchema.extend({
  kapitelNummer: z.number().int().min(1).max(12),
});

/**
 * Drop all Kurzgeschichten when Unterthemen/Fakten are fully regenerated —
 * prose would no longer match the new Stoff.
 */
function clearAllCleverGeschichten(
  editorial: RomanEditorial,
): RomanEditorial {
  let next: RomanEditorial = {
    ...editorial,
    manuskriptText: "",
    manuskriptOriginalText: "",
    manuskriptOriginalSavedAt: null,
    cleverGeschichteImprove: null,
    cleverGeschichteImproveCount: null,
    cleverGeschichteOk: null,
    storyState: null,
  };
  if (editorial.pipelineFertig?.schreiben) {
    next = withPipelineTabFertig(next, "schreiben", false);
  }
  return next;
}

/** Drop one chapter’s story + Verbessern state after its facts change. */
function clearCleverGeschichteForKapitel(
  editorial: RomanEditorial,
  plotMarkdown: string,
  kapitelNummer: number,
): RomanEditorial {
  const prevMs = editorial.manuskriptText ?? "";
  if (!prevMs.trim()) {
    const improve = { ...(editorial.cleverGeschichteImprove ?? {}) };
    delete improve[String(kapitelNummer)];
    const counts = { ...(editorial.cleverGeschichteImproveCount ?? {}) };
    delete counts[String(kapitelNummer)];
    const ok = { ...(editorial.cleverGeschichteOk ?? {}) };
    delete ok[String(kapitelNummer)];
    return {
      ...editorial,
      cleverGeschichteImprove:
        Object.keys(improve).length > 0 ? improve : null,
      cleverGeschichteImproveCount:
        Object.keys(counts).length > 0 ? counts : null,
      cleverGeschichteOk: Object.keys(ok).length > 0 ? ok : null,
    };
  }
  const cleared = replaceManuskriptChapterBody(
    prevMs,
    plotMarkdown,
    kapitelNummer,
    "",
  );
  const cleaned = normalizeManuskriptDocument(cleared, {
    requiredFromPlot: plotMarkdown,
    titlesFromPlot: true,
  });
  const key = String(kapitelNummer);
  const improve = { ...(editorial.cleverGeschichteImprove ?? {}) };
  delete improve[key];
  const counts = { ...(editorial.cleverGeschichteImproveCount ?? {}) };
  delete counts[key];
  const ok = { ...(editorial.cleverGeschichteOk ?? {}) };
  delete ok[key];
  return {
    ...editorial,
    manuskriptText: cleaned,
    cleverGeschichteImprove:
      Object.keys(improve).length > 0 ? improve : null,
    cleverGeschichteImproveCount:
      Object.keys(counts).length > 0 ? counts : null,
    cleverGeschichteOk: Object.keys(ok).length > 0 ? ok : null,
  };
}

async function persistUnterthemen(
  roman: RomanKontext,
  unterthemen: CleverUnterthemen,
  editorialPatch?: Partial<RomanEditorial>,
): Promise<RomanKontext> {
  const editorial = roman.editorial ?? emptyRomanEditorial();
  const merged: RomanEditorial = {
    ...editorial,
    ...editorialPatch,
    cleverUnterthemen: unterthemen,
    buchTyp: "clever_erzaehlt",
  };
  // Thema titles are SoT — keep Manuskript headings in sync whenever Unterthemen change.
  const ms = merged.manuskriptText ?? "";
  if (ms.trim()) {
    merged.manuskriptText = applyCleverThemaTitlesToManuskript(ms, unterthemen);
  }
  return upsertRomanKontext({
    id: roman.id,
    title: roman.title,
    manuskriptRaw: formatCleverUnterthemenMarkdown(unterthemen),
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
    editorial: merged,
  });
}

/**
 * Generate 10 Unterthemen via Wissenssammler and save on editorial + manuskriptRaw.
 */
export async function cleverUnterthemenGenerateAction(
  input: unknown,
): Promise<
  ActionResult<{ roman: RomanKontext; unterthemen: CleverUnterthemen }>
> {
  const denied = await denyUnlessAdmin();
  if (denied) return { success: false, error: denied };

  const parsed = idSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Eingabe ungültig.",
    };
  }

  try {
    const roman = await getRomanKontext(parsed.data.romanId);
    if (!roman) {
      return { success: false, error: "Buch nicht gefunden." };
    }

    const editorial = roman.editorial ?? emptyRomanEditorial();
    if (editorial.buchTyp !== "clever_erzaehlt") {
      return { success: false, error: "Nur für Clever-erzählt-Bücher." };
    }

    const thema = (roman.genre ?? "").trim();
    if (thema.length < 2) {
      return {
        success: false,
        error: "Thema fehlt — bitte in Basics setzen.",
      };
    }

    const unterthemen = await suggestCleverUnterthemen({
      thema,
      editorial,
    });

    // Keep existing infographics when regenerating Unterthemen (match by number).
    // Stories are always cleared — new Fakten invalidate existing Kurzgeschichten.
    const prevByNum = new Map(
      (editorial.cleverUnterthemen?.kapitel ?? []).map((k) => [k.nummer, k]),
    );
    const merged: CleverUnterthemen = {
      ...unterthemen,
      kapitel: unterthemen.kapitel.map((k) => {
        const prev = prevByNum.get(k.nummer);
        if (!prev?.infografikDataUrl) return k;
        return {
          ...k,
          infografikDataUrl: prev.infografikDataUrl,
          infografikPrompt: prev.infografikPrompt,
          infografikGeneratedAt: prev.infografikGeneratedAt,
          infografikModelLabel: prev.infografikModelLabel,
        };
      }),
    };

    const clearedEd = clearAllCleverGeschichten(editorial);
    const saved = await persistUnterthemen(roman, merged, clearedEd);
    revalidateRomanAdmin(roman.id);
    return {
      success: true,
      data: { roman: saved, unterthemen: merged },
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Unterthemen erzeugen fehlgeschlagen.",
    };
  }
}

/**
 * Faktenchecker: verify all facts of one chapter; persist updated unterthemen.
 */
export async function cleverUnterthemenFaktenCheckKapitelAction(
  input: unknown,
): Promise<
  ActionResult<{ roman: RomanKontext; unterthemen: CleverUnterthemen }>
> {
  const denied = await denyUnlessAdmin();
  if (denied) return { success: false, error: denied };

  const parsed = checkKapitelSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Eingabe ungültig.",
    };
  }

  try {
    const roman = await getRomanKontext(parsed.data.romanId);
    if (!roman) {
      return { success: false, error: "Buch nicht gefunden." };
    }

    const editorial = roman.editorial ?? emptyRomanEditorial();
    if (editorial.buchTyp !== "clever_erzaehlt") {
      return { success: false, error: "Nur für Clever-erzählt-Bücher." };
    }

    const doc = editorial.cleverUnterthemen;
    if (!doc || doc.kapitel.length === 0) {
      return { success: false, error: "Zuerst Unterthemen erzeugen." };
    }

    const kapitel = doc.kapitel.find(
      (k) => k.nummer === parsed.data.kapitelNummer,
    );
    if (!kapitel) {
      return {
        success: false,
        error: `Kapitel ${parsed.data.kapitelNummer} nicht gefunden.`,
      };
    }

    const thema = (roman.genre ?? "").trim() || doc.thema;
    const { kapitel: checked, modelLabel } =
      await checkCleverUnterthemaKapitel({
        thema,
        editorial,
        kapitel,
      });

    const kapitelNext = doc.kapitel.map((k) =>
      k.nummer === checked.nummer ? checked : k,
    );
    const allDone = kapitelNext.every((k) => k.checkStatus !== "ungeprueft");
    const unterthemen: CleverUnterthemen = {
      ...doc,
      kapitel: kapitelNext,
      checkModelLabel: modelLabel,
      checkedAt: allDone ? new Date().toISOString() : doc.checkedAt,
    };

    const saved = await persistUnterthemen(roman, unterthemen);
    revalidateRomanAdmin(roman.id);
    return { success: true, data: { roman: saved, unterthemen } };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Faktencheck fehlgeschlagen.",
    };
  }
}

/**
 * Wissenssammler: replace critical (fehlerhaft/unsicher) facts of one chapter.
 */
export async function cleverUnterthemenFaktenErsetzenKapitelAction(
  input: unknown,
): Promise<
  ActionResult<{
    roman: RomanKontext;
    unterthemen: CleverUnterthemen;
    replacedCount: number;
  }>
> {
  const denied = await denyUnlessAdmin();
  if (denied) return { success: false, error: denied };

  const parsed = checkKapitelSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Eingabe ungültig.",
    };
  }

  try {
    const roman = await getRomanKontext(parsed.data.romanId);
    if (!roman) {
      return { success: false, error: "Buch nicht gefunden." };
    }

    const editorial = roman.editorial ?? emptyRomanEditorial();
    if (editorial.buchTyp !== "clever_erzaehlt") {
      return { success: false, error: "Nur für Clever-erzählt-Bücher." };
    }

    const doc = editorial.cleverUnterthemen;
    if (!doc || doc.kapitel.length === 0) {
      return { success: false, error: "Zuerst Unterthemen erzeugen." };
    }

    const kapitel = doc.kapitel.find(
      (k) => k.nummer === parsed.data.kapitelNummer,
    );
    if (!kapitel) {
      return {
        success: false,
        error: `Kapitel ${parsed.data.kapitelNummer} nicht gefunden.`,
      };
    }

    const thema = (roman.genre ?? "").trim() || doc.thema;
    const { kapitel: replaced, replacedCount, modelLabel } =
      await replaceCriticalCleverFakten({
        thema,
        editorial,
        kapitel,
      });

    const unterthemen: CleverUnterthemen = {
      ...doc,
      kapitel: doc.kapitel.map((k) =>
        k.nummer === replaced.nummer ? replaced : k,
      ),
      modelLabel: doc.modelLabel || modelLabel,
      checkedAt: null,
    };

    // New facts → drop that chapter’s Kurzgeschichte (and Verbessern state).
    const plotMd = formatCleverUnterthemenMarkdown(unterthemen);
    const clearedEd = clearCleverGeschichteForKapitel(
      editorial,
      plotMd,
      replaced.nummer,
    );
    const saved = await persistUnterthemen(roman, unterthemen, clearedEd);
    revalidateRomanAdmin(roman.id);
    return {
      success: true,
      data: { roman: saved, unterthemen, replacedCount },
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Fakten ersetzen fehlgeschlagen.",
    };
  }
}

/**
 * Infografik-Designer + Gemini Flash Image → per-chapter Abenteuer-Wissen graphic.
 */
export async function cleverInfografikGenerateKapitelAction(
  input: unknown,
): Promise<
  ActionResult<{
    roman: RomanKontext;
    unterthemen: CleverUnterthemen;
    kapitelNummer: number;
  }>
> {
  const denied = await denyUnlessAdmin();
  if (denied) return { success: false, error: denied };

  const parsed = checkKapitelSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Eingabe ungültig.",
    };
  }

  try {
    const roman = await getRomanKontext(parsed.data.romanId);
    if (!roman) {
      return { success: false, error: "Buch nicht gefunden." };
    }

    const editorial = roman.editorial ?? emptyRomanEditorial();
    if (editorial.buchTyp !== "clever_erzaehlt") {
      return { success: false, error: "Nur für Clever-erzählt-Bücher." };
    }

    const doc = editorial.cleverUnterthemen;
    if (!doc || doc.kapitel.length === 0) {
      return { success: false, error: "Zuerst Unterthemen erzeugen." };
    }

    const kapitel = doc.kapitel.find(
      (k) => k.nummer === parsed.data.kapitelNummer,
    );
    if (!kapitel) {
      return {
        success: false,
        error: `Kapitel ${parsed.data.kapitelNummer} nicht gefunden.`,
      };
    }

    const {
      generateCleverKapitelInfografik,
      storyBodyForKapitel,
    } = await import("@/lib/roman/clever-infografik");

    const { kapitel: nextKap } = await generateCleverKapitelInfografik({
      thema: (roman.genre ?? "").trim() || doc.thema,
      editorial,
      kapitel,
      storyBody: storyBodyForKapitel(editorial, kapitel.nummer),
      tonalitaet: roman.tonalitaet,
    });

    const unterthemen: CleverUnterthemen = {
      ...doc,
      kapitel: doc.kapitel.map((k) =>
        k.nummer === nextKap.nummer ? nextKap : k,
      ),
    };

    const saved = await persistUnterthemen(roman, unterthemen);
    revalidateRomanAdmin(roman.id);
    return {
      success: true,
      data: {
        roman: saved,
        unterthemen,
        kapitelNummer: nextKap.nummer,
      },
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Infografik erzeugen fehlgeschlagen.",
    };
  }
}

/**
 * Clear infographic for one chapter.
 */
export async function cleverInfografikClearKapitelAction(
  input: unknown,
): Promise<
  ActionResult<{ roman: RomanKontext; unterthemen: CleverUnterthemen }>
> {
  const denied = await denyUnlessAdmin();
  if (denied) return { success: false, error: denied };

  const parsed = checkKapitelSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Eingabe ungültig.",
    };
  }

  try {
    const roman = await getRomanKontext(parsed.data.romanId);
    if (!roman) {
      return { success: false, error: "Buch nicht gefunden." };
    }

    const editorial = roman.editorial ?? emptyRomanEditorial();
    const doc = editorial.cleverUnterthemen;
    if (!doc) {
      return { success: false, error: "Keine Unterthemen." };
    }

    const unterthemen: CleverUnterthemen = {
      ...doc,
      kapitel: doc.kapitel.map((k) =>
        k.nummer === parsed.data.kapitelNummer
          ? {
              ...k,
              infografikDataUrl: null,
              infografikPrompt: "",
              infografikGeneratedAt: null,
              infografikModelLabel: "",
            }
          : k,
      ),
    };

    const saved = await persistUnterthemen(roman, unterthemen);
    revalidateRomanAdmin(roman.id);
    return { success: true, data: { roman: saved, unterthemen } };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Infografik löschen fehlgeschlagen.",
    };
  }
}
