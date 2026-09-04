/**
 * Flag in Auth `app_metadata` while an admin temporarily uses a membership role.
 * Cleared when restoring to `admin`. See `admin-role-test` actions.
 */

export const ADMIN_IMPERSONATION_KEY = "admin_impersonation";

/**
 * True when this Auth user may restore admin (currently testing as a package role).
 */
export function isAdminImpersonating(
  appMetadata: Record<string, unknown> | undefined | null,
): boolean {
  return appMetadata?.[ADMIN_IMPERSONATION_KEY] === true;
}
