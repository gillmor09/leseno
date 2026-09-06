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

/** Continue an existing story (“Wie könnte es weitergehen?”). */
export const storyContinueSchema = z.object({
  /** Library id of the predecessor (required for linking). */
  parentStoryId: z.string().uuid({ message: "Ungültige Vorgeschichte." }),
  schoolStage: z.enum(schoolStageIds, {
    message: "Bitte eine gültige Schulstufe wählen.",
  }),
  lengthStep: z.enum(lengthStepIds, {
    message: "Bitte eine gültige Textlänge wählen.",
  }),
  mood: z.enum(moodIds, {
    message: "Bitte eine gültige Stimmung wählen.",
  }),
  /** Optional direction hint; defaults to parent topic / „Fortsetzung“. */
  topic: z.string().trim().max(200).optional(),
});
