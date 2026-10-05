"use server";

/**
 * Recherche Q&A: Gemini + Google Search coach turns woven into rechercheDossier.
 */

import { z } from "zod";
import { denyUnlessAdmin } from "@/lib/auth/require-admin";
import {
  emptyRomanEditorial,
  isBuchTypSet,
  mergeRechercheSources,
  type RomanBuchTyp,
  type RomanEditorial,
} from "@/lib/roman/editorial";
import {
  chatRechercheCoach,
  weaveRechercheDossier,
} from "@/lib/roman/recherche-qa";
import { revalidateRomanAdmin } from "@/lib/roman/revalidate-admin";
import { getRomanKontext, upsertRomanKontext } from "@/lib/roman/repository";
import type { RomanIdeaChatMessage, RomanKontext } from "@/lib/roman/types";
import type { ActionResult } from "@/lib/types/actions";

const turnSchema = z.object({
  romanId: z.string().uuid({ message: "Ungültige Buch-ID." }),
  userMessage: z
    .string()
    .trim()
    .min(1, { message: "Nachricht eingeben." })
    .max(8000),
});

async function persistRecherche(
  roman: RomanKontext,
  editorial: RomanEditorial,
  dossier: string,
  chat: RomanIdeaChatMessage[],
  sources: RomanEditorial["rechercheSources"],
): Promise<RomanKontext> {
  const nextEditorial: RomanEditorial = {
    ...editorial,
    rechercheDossier: dossier,
    rechercheChat: chat,
    rechercheSources: sources,
  };
  const saved = await upsertRomanKontext({
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
    editorial: nextEditorial,
  });
  revalidateRomanAdmin(roman.id);
  return { ...saved, ideenChat: roman.ideenChat };
}

/**
 * One Q&A turn: search-backed coach → weave dossier → save chat + sources.
 */
export async function romanRechercheQaTurnAction(
  input: unknown,
): Promise<
  ActionResult<{
    roman: RomanKontext;
    reply: string;
    rechercheDossier: string;
  }>
> {
  const denied = await denyUnlessAdmin();
  if (denied) return { success: false, error: denied };

  const parsed = turnSchema.safeParse(input);
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

    const buchTyp = roman.editorial?.buchTyp ?? "unbekannt";
    if (!isBuchTypSet(buchTyp as RomanBuchTyp)) {
      return {
        success: false,
        error: "Zuerst Buchtyp wählen (Belletristik oder Sachbuch).",
      };
    }

    const editorial = roman.editorial ?? emptyRomanEditorial();
    const ideeKurz = (editorial.ideeKurz ?? "").trim();
    if (ideeKurz.length < 40) {
      return {
        success: false,
        error: "Zuerst im Schritt Idee eine Dokumentation erarbeiten.",
      };
    }

    const history = editorial.rechercheChat ?? [];
    const userMessage = parsed.data.userMessage;
    const currentDossier = editorial.rechercheDossier ?? "";

    const coach = await chatRechercheCoach({
      buchTyp: buchTyp as RomanBuchTyp,
      ideeKurz,
      dossier: currentDossier,
      history,
      userMessage,
    });

    const woven = await weaveRechercheDossier({
      buchTyp: buchTyp as RomanBuchTyp,
      ideeKurz,
      dossier: currentDossier,
      userMessage,
      coachReply: coach.reply,
    });

    const nextChat: RomanIdeaChatMessage[] = [
      ...history,
      { role: "user" as const, content: userMessage },
      { role: "assistant" as const, content: coach.reply },
    ].slice(-60);

    const sources = mergeRechercheSources(
      editorial.rechercheSources,
      mergeRechercheSources(coach.sources, woven.sources),
    );

    const saved = await persistRecherche(
      roman,
      editorial,
      woven.dossier,
      nextChat,
      sources,
    );

    return {
      success: true,
      data: {
        roman: saved,
        reply: coach.reply,
        rechercheDossier: woven.dossier,
      },
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Recherche-Q&A fehlgeschlagen.",
    };
  }
}
