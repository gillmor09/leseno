import { z } from "zod";
import { STORY_SCHOOL_STAGES } from "@/lib/stories/options";

const listItemSchema = z
  .string()
  .trim()
  .min(1, "Eintrag darf nicht leer sein.")
  .max(120, "Eintrag ist zu lang (max. 120 Zeichen).");

const schoolStageIds = STORY_SCHOOL_STAGES.map((stage) => stage.id) as [
  (typeof STORY_SCHOOL_STAGES)[number]["id"],
  ...(typeof STORY_SCHOOL_STAGES)[number]["id"][],
];

export const childProfileFieldsSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(1, "Bitte gib den Namen des Kindes ein.")
    .max(80, "Name ist zu lang (max. 80 Zeichen)."),
  schoolStage: z.enum(schoolStageIds, {
    message: "Bitte eine gültige Schulstufe wählen.",
  }),
  friends: z.array(listItemSchema).max(50, "Maximal 50 Freunde."),
  interests: z.array(listItemSchema).max(50, "Maximal 50 Interessen."),
  experiences: z
    .array(listItemSchema)
    .max(50, "Maximal 50 Einträge unter „Das möchte ich mal erleben“."),
  fears: z
    .array(listItemSchema)
    .max(50, "Maximal 50 Einträge unter „Davor habe ich Angst“."),
  includeImages: z.boolean(),
  syllableHelp: z.boolean(),
  wordHighlight: z.boolean(),
  readableAloud: z.boolean(),
});

export const saveChildProfileSchema = childProfileFieldsSchema.extend({
  id: z.string().uuid().nullable(),
});

export const deleteChildProfileSchema = z.object({
  id: z.string().uuid({ message: "Ungültige Profil-ID." }),
});

/** @deprecated Use childProfileFieldsSchema */
export const userWorldSchema = childProfileFieldsSchema;
