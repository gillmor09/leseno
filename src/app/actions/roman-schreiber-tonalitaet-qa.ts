"use server";

/**
 * Basics: coach dialog to craft `roman.tonalitaet` (Sprache & Tonalität Schreiber).
 */

import { z } from "zod";
import { denyUnlessAdmin } from "@/lib/auth/require-admin";
import {
  emptyRomanEditorial,
  isBuchTypSet,
  type RomanBuchTyp,
  type RomanEditorial,
} from "@/lib/roman/editorial";
import { revalidateRomanAdmin } from "@/lib/roman/revalidate-admin";
import {
  chatSchreiberTonalitaetCoach,
  weaveSchreiberTonalitaetBrief,
} from "@/lib/roman/schreiber-tonalitaet-qa";
import { getRomanKontext, upsertRomanKontext } from "@/lib/roman/repository";
import type { RomanIdeaChatMessage, RomanKontext } from "@/lib/roman/types";
import type { ActionResult } from "@/lib/types/actions";

const turnSchema = z.object({
  romanId: z.string().uuid({ message: "Ungültige Buch-ID." }),
  userMessage: z
    .string()
    .trim()
    .min(1, { message: "Nachricht eingeben." })
    .max(6000),
});

async function persistTonalitaetTurn(
  roman: RomanKontext,
  editorial: RomanEditorial,
  tonalitaet: string,
  chat: RomanIdeaChatMessage[],
): Promise<RomanKontext> {
  const nextEditorial: RomanEditorial = {
    ...editorial,
    schreiberTonalitaetChat: chat,
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
    tonalitaet,
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
 * One coach turn → update tonalitaet brief + persist chat on editorial.
 */
export async function romanSchreiberTonalitaetQaTurnAction(
  input: unknown,
): Promise<
  ActionResult<{
    roman: RomanKontext;
    reply: string;
    tonalitaet: string;
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

    const buchTyp = (roman.editorial?.buchTyp ?? "unbekannt") as RomanBuchTyp;
    if (!isBuchTypSet(buchTyp)) {
      return {
        success: false,
        error: "Zuerst Buchtyp wählen.",
      };
    }

    const editorial = roman.editorial ?? emptyRomanEditorial();
    const history = editorial.schreiberTonalitaetChat ?? [];
    const userMessage = parsed.data.userMessage;
    const currentBrief = roman.tonalitaet ?? "";

    const coach = await chatSchreiberTonalitaetCoach({
      buchTyp,
      genre: roman.genre,
      lesestufe: editorial.lesestufe ?? "",
      currentBrief,
      history,
      userMessage,
    });

    const woven = await weaveSchreiberTonalitaetBrief({
      buchTyp,
      genre: roman.genre,
      lesestufe: editorial.lesestufe ?? "",
      currentBrief,
      userMessage,
      coachReply: coach.reply,
    });

    const nextChat: RomanIdeaChatMessage[] = [
      ...history,
      { role: "user" as const, content: userMessage },
      { role: "assistant" as const, content: coach.reply },
    ].slice(-40);

    const saved = await persistTonalitaetTurn(
      roman,
      editorial,
      woven.brief,
      nextChat,
    );

    return {
      success: true,
      data: {
        roman: saved,
        reply: coach.reply,
        tonalitaet: woven.brief,
      },
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Tonalitäts-Dialog fehlgeschlagen.",
    };
  }
}
