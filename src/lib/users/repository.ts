/**
 * Admin access to Supabase Auth users with app-level roles in `app_metadata.role`.
 * Also keeps `leseno.user_profiles.role` in sync when updating.
 */

import { createServiceClient } from "@/lib/supabase/service";
import type { UserAdminRow, UserRoleId } from "@/lib/users/catalog";
import { USER_ROLE_OPTIONS } from "@/lib/users/catalog";
import { loadCreditsByUserIds } from "@/lib/users/billing";

const ALLOWED_ROLES = new Set<UserRoleId>(
  USER_ROLE_OPTIONS.map((role) => role.id),
);

export async function loadUsersForAdmin(): Promise<UserAdminRow[]> {
  const supabase = createServiceClient(null);
  const { data, error } = await supabase.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });

  if (error) {
    throw new Error(error.message);
  }

  const users = (data.users ?? []).filter((user) => Boolean(user.email));
  let creditsByUser = new Map<string, number>();
  try {
    creditsByUser = await loadCreditsByUserIds(users.map((user) => user.id));
  } catch (creditsError) {
    console.warn("[loadUsersForAdmin] credits", creditsError);
  }

  return users.map((user) => {
    const rawRole = user.app_metadata?.role;
    const role = ALLOWED_ROLES.has(rawRole as UserRoleId)
      ? (rawRole as UserRoleId)
      : "basis";

    return {
      userId: user.id,
      email: user.email ?? "",
      role,
      credits: creditsByUser.get(user.id) ?? 0,
      createdAt: user.created_at,
    };
  });
}

export async function updateUsersForAdmin(rows: UserAdminRow[]): Promise<void> {
  const supabase = createServiceClient(null);

  const { data, error } = await supabase.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });

  if (error) {
    throw new Error(error.message);
  }

  const metadataByUserId = new Map(
    (data.users ?? []).map((user) => [user.id, user.app_metadata ?? {}]),
  );

  for (const row of rows) {
    const existingMetadata = metadataByUserId.get(row.userId) ?? {};
    const { data: updated, error: userError } =
      await supabase.auth.admin.updateUserById(row.userId, {
        email: row.email,
        app_metadata: { ...existingMetadata, role: row.role },
      });

    if (userError || !updated.user) {
      throw new Error(
        userError?.message ?? "User konnte nicht aktualisiert werden.",
      );
    }

    const { error: profileError } = await supabase
      .schema("leseno")
      .from("user_profiles")
      .update({
        role: row.role,
        email: row.email,
        credits: row.credits,
      })
      .eq("user_id", row.userId);

    // Profile row may be missing on older accounts — Auth update still counts.
    if (profileError) {
      console.warn(
        "[updateUsersForAdmin] profile sync",
        row.userId,
        profileError.message,
      );
    }
  }
}

/**
 * Deletes an Auth user (cascades to `leseno.user_profiles` and related rows).
 */
export async function deleteUserForAdmin(userId: string): Promise<void> {
  const supabase = createServiceClient(null);
  const { error } = await supabase.auth.admin.deleteUser(userId);
  if (error) {
    throw new Error(error.message || "User konnte nicht gelöscht werden.");
  }
}
