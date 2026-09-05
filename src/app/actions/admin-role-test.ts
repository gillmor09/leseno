"use server";

/**
 * Admin self-test: temporarily set `app_metadata.role` to a membership role
 * while keeping `admin_impersonation` so the session can restore to admin.
 */

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import type { ActionResult } from "@/lib/types/actions";
import {
  isMembershipRoleId,
  STORY_PATH,
  type MembershipRoleId,
} from "@/lib/users/catalog";
import { isAdminImpersonating } from "@/lib/auth/admin-impersonation";

async function applyOwnRoleMetadata(input: {
  role: "admin" | MembershipRoleId;
  impersonating: boolean;
}): Promise<ActionResult<{ role: string; redirectTo: string }>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "Nicht angemeldet." };
  }

  const meta = user.app_metadata as Record<string, unknown> | undefined;
  const maySwitch =
    meta?.role === "admin" || isAdminImpersonating(meta);
  if (!maySwitch) {
    return {
      success: false,
      error: "Nur Admins können Rollen zum Testen wechseln.",
    };
  }

  const existing = { ...(user.app_metadata ?? {}) } as Record<string, unknown>;
  const nextMetadata: Record<string, unknown> = {
    ...existing,
    role: input.role,
  };

  // Explicit false (not delete): Auth admin update may merge metadata.
  nextMetadata.admin_impersonation = input.impersonating;

  const adminClient = createServiceClient(null);
  const { error: updateError } = await adminClient.auth.admin.updateUserById(
    user.id,
    { app_metadata: nextMetadata },
  );

  if (updateError) {
    return {
      success: false,
      error: updateError.message || "Rollenwechsel fehlgeschlagen.",
    };
  }

  const { error: profileError } = await adminClient
    .schema("leseno")
    .from("user_profiles")
    .update({ role: input.role })
    .eq("user_id", user.id);

  if (profileError) {
    console.warn(
      "[admin-role-test] profile sync",
      user.id,
      profileError.message,
    );
  }

  const { error: refreshError } = await supabase.auth.refreshSession();
  if (refreshError) {
    console.warn("[admin-role-test] refreshSession", refreshError.message);
  }

  revalidatePath("/", "layout");

  const redirectTo =
    input.role === "admin" ? "/admin/users" : STORY_PATH;

  return {
    success: true,
    data: { role: input.role, redirectTo },
  };
}

/**
 * Switch the current admin into a membership role for UX testing.
 */
export async function startAdminRoleTestAction(
  role: unknown,
): Promise<ActionResult<{ role: string; redirectTo: string }>> {
  if (typeof role !== "string" || !isMembershipRoleId(role)) {
    return { success: false, error: "Ungültige Testrolle." };
  }

  return applyOwnRoleMetadata({
    role,
    impersonating: true,
  });
}

/**
 * Restore the current session to `admin` after a role test.
 */
export async function restoreAdminRoleAction(): Promise<
  ActionResult<{ role: string; redirectTo: string }>
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "Nicht angemeldet." };
  }

  if (!isAdminImpersonating(user.app_metadata as Record<string, unknown>)) {
    if (user.app_metadata?.role === "admin") {
      return {
        success: true,
        data: { role: "admin", redirectTo: "/admin/users" },
      };
    }
    return {
      success: false,
      error: "Kein aktiver Admin-Testmodus.",
    };
  }

  return applyOwnRoleMetadata({
    role: "admin",
    impersonating: false,
  });
}
