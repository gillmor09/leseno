/**
 * Shared result shape for free-story generation (action + admin job poll).
 */

import type { StoryGenerateResult } from "@/lib/ai/pipeline";

export type StoryGenerateActionData = StoryGenerateResult & {
  /** Remaining balance after a paid generation (omit in trial). */
  creditsRemaining?: number;
  /** Credits charged for this story (omit in trial). */
  creditsCharged?: number;
  /** Library id when auto-saved (`buecherei`). */
  libraryStoryId?: string;
  /** Personal seed chosen for this generation (Meine Welt). */
  personalSeed?: {
    topic: string;
    seedSource: "interest" | "experience";
    gentleFear: string | null;
  };
};
