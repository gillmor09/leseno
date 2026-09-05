/**
 * Story generation credit costs by length step (marketing `/preise`).
 */

import type { StoryLengthStepId } from "@/lib/stories/length";

export const STORY_CREDITS_BY_LENGTH: Record<StoryLengthStepId, number> = {
  sehr_kurz: 10,
  kurz: 20,
  mittel: 30,
  lang: 40,
  sehr_lang: 50,
};

/** Credits charged for one story of the given length. */
export function storyCreditsForLength(lengthStep: StoryLengthStepId): number {
  return STORY_CREDITS_BY_LENGTH[lengthStep];
}
