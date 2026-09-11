/**
 * Help text domain types (member-page help slots).
 */

import type { HelpPageId } from "@/lib/help/catalog";

export type HelpText = {
  pageId: HelpPageId;
  slotId: string;
  title: string;
  htmlBody: string;
  updatedAt: string | null;
};

/** Map slot_id → help content for one page (only non-empty bodies). */
export type HelpTextMap = Record<
  string,
  { title: string; htmlBody: string }
>;
