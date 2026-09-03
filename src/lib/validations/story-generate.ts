import "@/lib/validations/configure-zod";
import { z } from "zod";
import { STORY_LENGTH_STEP_IDS } from "@/lib/stories/length";
import { STORY_MOODS, STORY_SCHOOL_STAGES } from "@/lib/stories/options";

const schoolStageIds = STORY_SCHOOL_STAGES.map((stage) => stage.id) as [
  (typeof STORY_SCHOOL_STAGES)[number]["id"],
  ...(typeof STORY_SCHOOL_STAGES)[number]["id"][],
];

const moodIds = STORY_MOODS.map((mood) => mood.id) as [
  (typeof STORY_MOODS)[number]["id"],
  ...(typeof STORY_MOODS)[number]["id"][],
];

const lengthStepIds = [...STORY_LENGTH_STEP_IDS] as [
  (typeof STORY_LENGTH_STEP_IDS)[number],
  ...(typeof STORY_LENGTH_STEP_IDS)[number][],
];

export const storyGenerateSchema = z.object({
  topic: z
    .string()
    .trim()
    .min(2, { message: "Bitte ein Thema mit mindestens 2 Zeichen angeben." })
    .max(240, { message: "Das Thema ist zu lang (max. 240 Zeichen)." }),
  schoolStage: z.enum(schoolStageIds, {
    message: "Bitte eine gültige Schulstufe wählen.",
  }),
  lengthStep: z.enum(lengthStepIds, {
    message: "Bitte eine gültige Textlänge wählen.",
  }),
  mood: z.enum(moodIds, {
    message: "Bitte eine gültige Stimmung wählen.",
  }),
});

export type StoryGenerateFormInput = z.infer<typeof storyGenerateSchema>;
