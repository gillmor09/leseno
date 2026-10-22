"use server";

/**
 * Idea Q&A: Schreib-Coach turns woven into ideeKurz by Ideen-Redakteur.
 * Critique / Verbessern is handled by the vertical pipeline (Entwicklungslektor).
 */

import { revalidateRomanAdmin } from "@/lib/roman/revalidate-admin";
import { z } from "zod";
import { denyUnlessAdmin } from "@/lib/auth/require-admin";
import {
  emptyRomanEditorial,
  isBuchTypSet,
  type RomanBuchTyp,
  type RomanEditorial,
} from "@/lib/roman/editorial";
import {
  chatIdeeMitSchreibCoach,
  proposeIdeeCoachQuestions,
  weaveIdeeKurz,
} from "@/lib/roman/idea-qa";
import {
  getRomanKontext,
  setRomanIdeenChat,
  upsertRomanKontext,
} from "@/lib/roman/repository";
import type { RomanIdeaChatMessage, RomanKontext } from "@/lib/roman/types";
import type { ActionResult } from "@/lib/types/actions";

const romanIdeeQaTurnSchema = z.object({
  romanId: z.string().uuid({ message: "Ungültige Buch-ID." }),
  userMessage: z
    .string()
    .trim()
    .min(1, { message: "Nachricht eingeben." })
    // Align with Idee-doc growth — short 8k cap caused „Eingabe ist zu lang.“
    .max(20_000, { message: "Antwort ist zu lang (max. 20.000 Zeichen)." }),
});

const romanIdeeIdSchema = z.object({
  romanId: z.string().uuid({ message: "Ungültige Buch-ID." }),
});

async function persistIdeeKurz(
  roman: RomanKontext,
  editorial: RomanEditorial,
  ideeKurz: string,
): Promise<RomanKontext> {
  const nextEditorial = { ...editorial, ideeKurz };
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
 * One Q&A turn: coach chat → weave ideeKurz → save chat + editorial.
 */
export async function romanIdeeQaTurnAction(
  input: unknown,
): Promise<
  ActionResult<{
    roman: RomanKontext;
    reply: string;
    ideeKurz: string;
  }>
> {
  const denied = await denyUnlessAdmin();
  if (denied) return { success: false, error: denied };

  const parsed = romanIdeeQaTurnSchema.safeParse(input);
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
    const history = roman.ideenChat ?? [];
    const userMessage = parsed.data.userMessage;

    const schreiberSpracheTonalitaet = roman.tonalitaet ?? "";

    const coach = await chatIdeeMitSchreibCoach({
      buchTyp: buchTyp as RomanBuchTyp,
      ideeKurz: editorial.ideeKurz ?? "",
      history,
      userMessage,
      schreiberSpracheTonalitaet,
    });

    const woven = await weaveIdeeKurz({
      buchTyp: buchTyp as RomanBuchTyp,
      ideeKurz: editorial.ideeKurz ?? "",
      userMessage,
      coachReply: coach.reply,
      schreiberSpracheTonalitaet,
    });

    const nextChat: RomanIdeaChatMessage[] = [
      ...history,
      { role: "user" as const, content: userMessage },
      { role: "assistant" as const, content: coach.reply },
    ].slice(-60);

    const saved = await persistIdeeKurz(roman, editorial, woven.ideeKurz);
    await setRomanIdeenChat({ id: saved.id, messages: nextChat });

    const withChat: RomanKontext = { ...saved, ideenChat: nextChat };
    return {
      success: true,
      data: {
        roman: withChat,
        reply: coach.reply,
        ideeKurz: woven.ideeKurz,
      },
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Ideen-Q&A fehlgeschlagen.",
    };
  }
}

/**
 * Drop the open Coach question (trailing assistant message). IdeeKurz stays.
 */
export async function romanIdeeDiscardOpenQuestionsAction(
  input: unknown,
): Promise<ActionResult<{ messages: RomanIdeaChatMessage[] }>> {
  const denied = await denyUnlessAdmin();
  if (denied) return { success: false, error: denied };

  const parsed = romanIdeeIdSchema.safeParse(input);
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

    const history = roman.ideenChat ?? [];
    if (history.length === 0) {
      return { success: true, data: { messages: [] } };
    }

    const last = history[history.length - 1]!;
    if (last.role !== "assistant") {
      return {
        success: false,
        error: "Keine offene Coach-Frage zum Verwerfen.",
      };
    }

    const nextChat = history.slice(0, -1);
    await setRomanIdeenChat({ id: roman.id, messages: nextChat });
    revalidateRomanAdmin(roman.id);
    return { success: true, data: { messages: nextChat } };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Fragen verwerfen fehlgeschlagen.",
    };
  }
}

/**
 * Ask the Schreib-Coach for new open questions (no ideeKurz weave).
 */
export async function romanIdeeProposeQuestionsAction(
  input: unknown,
): Promise<
  ActionResult<{
    messages: RomanIdeaChatMessage[];
    reply: string;
  }>
> {
  const denied = await denyUnlessAdmin();
  if (denied) return { success: false, error: denied };

  const parsed = romanIdeeIdSchema.safeParse(input);
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
    const history = roman.ideenChat ?? [];
    if (history.length > 0 && history[history.length - 1]!.role === "assistant") {
      return {
        success: false,
        error: "Es gibt schon eine offene Frage — zuerst verwerfen oder beantworten.",
      };
    }

    const coach = await proposeIdeeCoachQuestions({
      buchTyp: buchTyp as RomanBuchTyp,
      ideeKurz: editorial.ideeKurz ?? "",
      history,
      schreiberSpracheTonalitaet: roman.tonalitaet ?? "",
    });

    const nextChat: RomanIdeaChatMessage[] = [
      ...history,
      { role: "assistant" as const, content: coach.reply },
    ].slice(-60);

    await setRomanIdeenChat({ id: roman.id, messages: nextChat });
    revalidateRomanAdmin(roman.id);
    return {
      success: true,
      data: { messages: nextChat, reply: coach.reply },
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Neue Fragen fehlgeschlagen.",
    };
  }
}
