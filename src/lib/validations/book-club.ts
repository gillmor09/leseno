/**
 * Zod schemas for Mein Buchclub (friendship code, invites, share level).
 */

import "@/lib/validations/configure-zod";
import { z } from "zod";
import { BOOK_CLUB_SHARE_LEVELS } from "@/lib/book-club/share";

export const friendshipCodeSchema = z
  .string()
  .trim()
  .min(4, { message: "Kennung: mindestens 4 Zeichen." })
  .max(24, { message: "Kennung: höchstens 24 Zeichen." })
  .regex(/^[a-zA-Z0-9_-]+$/, {
    message: "Nur Buchstaben, Zahlen, Unterstrich und Bindestrich.",
  });

export const bookClubInviteEmailSchema = z
  .string()
  .trim()
  .email({ message: "Bitte eine gültige E-Mail-Adresse angeben." })
  .max(254, { message: "E-Mail ist zu lang." });

export const bookClubShareLevelSchema = z.enum(BOOK_CLUB_SHARE_LEVELS, {
  message: "Bitte Privat, Freunde oder Öffentlich wählen.",
});
