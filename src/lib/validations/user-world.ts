import { z } from "zod";

const listItemSchema = z
  .string()
  .trim()
  .min(1, "Eintrag darf nicht leer sein.")
  .max(120, "Eintrag ist zu lang (max. 120 Zeichen).");

export const userWorldSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(1, "Bitte gib deinen Namen ein.")
    .max(80, "Name ist zu lang (max. 80 Zeichen)."),
  friends: z.array(listItemSchema).max(50, "Maximal 50 Freunde."),
  interests: z.array(listItemSchema).max(50, "Maximal 50 Interessen."),
  experiences: z
    .array(listItemSchema)
    .max(50, "Maximal 50 Einträge unter „Das möchte ich mal erleben“."),
});
