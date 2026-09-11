"use server";

/**
 * Admin + member loaders for page/card help texts.
 */

import { revalidatePath } from "next/cache";
import { denyUnlessAdmin } from "@/lib/auth/require-admin";
import {
  getHelpPage,
  isHelpPageId,
  type HelpPageId,
} from "@/lib/help/catalog";
import {
  listAllHelpTexts,
  listHelpTextsForPage,
  listHelpTextsFromDefaultsOnly,
  upsertHelpText,
} from "@/lib/help/repository";
import type { HelpText, HelpTextMap } from "@/lib/help/types";
import type { ActionResult } from "@/lib/types/actions";
import {
  helpPageIdParamSchema,
  helpUpsertSchema,
} from "@/lib/validations/help-admin";

function revalidateHelp(pageId: HelpPageId) {
  revalidatePath("/admin/hilfe");
  revalidatePath(getHelpPage(pageId).route);
}

export async function loadHelpAdminWorkspaceAction(): Promise<
  ActionResult<{ texts: HelpText[] }>
> {
  const denied = await denyUnlessAdmin();
  if (denied) return { success: false, error: denied };

  try {
    const texts = await listAllHelpTexts();
    return { success: true, data: { texts } };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Hilfetexte laden fehlgeschlagen.",
    };
  }
}

export async function saveHelpTextAction(
  input: unknown,
): Promise<ActionResult<{ text: HelpText }>> {
  const denied = await denyUnlessAdmin();
  if (denied) return { success: false, error: denied };

  const parsed = helpUpsertSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Angaben ungültig.",
    };
  }

  try {
    const text = await upsertHelpText(parsed.data);
    revalidateHelp(parsed.data.pageId);
    return { success: true, data: { text } };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Hilfetext speichern fehlgeschlagen.",
    };
  }
}

/**
 * Member pages: non-empty, sanitized help map for one page.
 */
export async function getHelpTextsForPageAction(
  input: unknown,
): Promise<ActionResult<{ texts: HelpTextMap }>> {
  const parsed = helpPageIdParamSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Seite ungültig.",
    };
  }

  try {
    const texts = await listHelpTextsForPage(parsed.data.pageId);
    return { success: true, data: { texts } };
  } catch (error) {
    // Migration missing → built-in defaults so Info icons still work.
    console.error("[getHelpTextsForPageAction]", error);
    return {
      success: true,
      data: { texts: listHelpTextsFromDefaultsOnly(parsed.data.pageId) },
    };
  }
}

/** Server-component helper (same as action, without ActionResult wrapper). */
export async function loadHelpTextsForPage(
  pageId: HelpPageId | string,
): Promise<HelpTextMap> {
  if (!isHelpPageId(pageId)) return {};
  try {
    return await listHelpTextsForPage(pageId);
  } catch (error) {
    console.error("[loadHelpTextsForPage]", error);
    // Table/RPC missing: still show built-in defaults so Info icons work.
    return listHelpTextsFromDefaultsOnly(pageId);
  }
}
