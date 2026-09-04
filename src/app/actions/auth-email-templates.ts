"use server";

import { revalidatePath } from "next/cache";
import { denyUnlessAdmin } from "@/lib/auth/require-admin";
import { saveAuthEmailTemplate } from "@/lib/auth/email-templates-repository";
import type { ActionResult } from "@/lib/types/actions";
import { saveAuthEmailTemplatesSchema } from "@/lib/validations/auth-email-templates";

/**
 * Saves auth email templates (register / forget) from the admin form.
 */
export async function saveAuthEmailTemplatesAction(
  input: unknown,
): Promise<ActionResult> {
  const denied = await denyUnlessAdmin();
  if (denied) {
    return { success: false, error: denied };
  }

  const parsed = saveAuthEmailTemplatesSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Die Angaben sind ungültig.",
    };
  }

  try {
    for (const template of parsed.data.templates) {
      await saveAuthEmailTemplate({
        id: template.id,
        subject: template.subject,
        htmlBody: template.htmlBody,
        enabled: template.enabled,
      });
    }
    revalidatePath("/admin/emails");
    revalidatePath("/hooks/auth/register");
    revalidatePath("/hooks/auth/forget");
    return { success: true };
  } catch (error) {
    console.error("[saveAuthEmailTemplatesAction]", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Speichern hat nicht geklappt.",
    };
  }
}
