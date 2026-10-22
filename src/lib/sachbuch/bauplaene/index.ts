/**
 * Bauplan registry — generation frameworks per Sachbuchtyp.
 */

import {
  formatTransformativesBusinessBauplanPrompt,
  TRANSFORMATIVES_BUSINESS_BAUPLAN_ID,
  TRANSFORMATIVES_BUSINESS_DEFAULT_THESIS,
} from "@/lib/sachbuch/bauplaene/transformatives-business-fallstudien";

export function formatBauplanForBookType(
  bookTypeId: string | null | undefined,
  opts?: { thesis?: string | null },
): string | null {
  const id = (bookTypeId ?? "").trim();
  if (!id) return null;
  if (id === TRANSFORMATIVES_BUSINESS_BAUPLAN_ID) {
    return formatTransformativesBusinessBauplanPrompt(opts);
  }
  return null;
}

export function defaultThesisForBookType(
  bookTypeId: string | null | undefined,
): string | null {
  const id = (bookTypeId ?? "").trim();
  if (!id) return null;
  if (id === TRANSFORMATIVES_BUSINESS_BAUPLAN_ID) {
    return TRANSFORMATIVES_BUSINESS_DEFAULT_THESIS;
  }
  return null;
}

export {
  formatTransformativesBusinessBauplanPrompt,
  TRANSFORMATIVES_BUSINESS_BAUPLAN_ID,
  TRANSFORMATIVES_BUSINESS_DEFAULT_THESIS,
  TRANSFORMATIVES_BUSINESS_ROLES,
  TRANSFORMATIVES_BUSINESS_CHAPTER_TRIAD,
  TRANSFORMATIVES_BUSINESS_CONTAINERS,
  TRANSFORMATIVES_BUSINESS_TONE,
  TRANSFORMATIVES_BUSINESS_CHAPTER_WORKFLOW,
} from "@/lib/sachbuch/bauplaene/transformatives-business-fallstudien";
