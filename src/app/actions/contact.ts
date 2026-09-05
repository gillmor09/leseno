"use server";

import type { ActionResult } from "@/lib/types/actions";
import { insertContactRequest } from "@/lib/contact/repository";
import { assertBotGuard } from "@/lib/security/bot-guard";
import { contactFormSchema } from "@/lib/validations/contact";

/**
 * Saves a public contact inquiry (email + message). Bot-guarded.
 */
export async function submitContactRequestAction(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const botError = await assertBotGuard(input, {
    action: "contact-form",
    minFillMs: 2500,
    maxRequests: 5,
    windowMs: 60 * 60 * 1000,
  });
  if (botError) {
    return { success: false, error: botError };
  }

  const parsed = contactFormSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Die Angaben sind ungültig.",
    };
  }

  try {
    const row = await insertContactRequest(parsed.data);
    return { success: true, data: row };
  } catch (error) {
    console.error("[submitContactRequestAction]", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Senden hat nicht geklappt. Bitte später erneut versuchen.",
    };
  }
}
