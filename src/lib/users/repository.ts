/**
 * Admin access to Supabase Auth users with app-level roles in `app_metadata.role`.
 * This keeps user management independent from the custom PostgREST schema setup.
 */

import { createServiceClient } from "@/lib/supabase/service";
import type { UserAdminRow, UserRoleId } from "@/lib/users/catalog";

const ALLOWED_ROLES = new Set<UserRoleId>([
  "admin",
  "guest",
  "member_tier_1",
  "member_tier_2",
  "member_tier_3",
]);

export async function loadUsersForAdmin(): Promise<UserAdminRow[]> {
  const supabase = createServiceClient(null);
  const { data, error } = await supabase.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });

  if (error) {
    throw new Error(error.message);
  }

  return (data.users ?? [])
    .filter((user) => Boolean(user.email))
    .map((user) => {
      const rawRole = user.app_metadata?.role;
      const role = ALLOWED_ROLES.has(rawRole as UserRoleId)
        ? (rawRole as UserRoleId)
        : "guest";

      return {
        userId: user.id,
        email: user.email ?? "",
        role,
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
    const { data: updated, error: userError } = await supabase.auth.admin.updateUserById(
      row.userId,
      {
      email: row.email,
        app_metadata: { ...existingMetadata, role: row.role },
      },
    );

    if (userError || !updated.user) {
      throw new Error(userError?.message ?? "User konnte nicht aktualisiert werden.");
    }
  }
}
