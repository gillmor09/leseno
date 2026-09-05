/**
 * Canonical user roles: admin + membership roles (basis / paket1–3).
 * Story composer is always `/geschichte`; package features come from DB.
 */

export const STORY_PATH = "/geschichte";

export const USER_ROLE_OPTIONS = [
  { id: "admin", label: "Admin" },
  { id: "basis", label: "Basis", path: STORY_PATH },
  { id: "paket1", label: "Paket 1", path: STORY_PATH },
  { id: "paket2", label: "Paket 2", path: STORY_PATH },
  { id: "paket3", label: "Paket 3", path: STORY_PATH },
] as const;

export type UserRoleId = (typeof USER_ROLE_OPTIONS)[number]["id"];

export const MEMBERSHIP_ROLE_OPTIONS = [
  { id: "basis", label: "Basis", path: STORY_PATH },
  { id: "paket1", label: "Paket 1", path: STORY_PATH },
  { id: "paket2", label: "Paket 2", path: STORY_PATH },
  { id: "paket3", label: "Paket 3", path: STORY_PATH },
] as const;

export type MembershipRoleId = (typeof MEMBERSHIP_ROLE_OPTIONS)[number]["id"];

export type UserAdminRow = {
  userId: string;
  email: string;
  role: UserRoleId;
  credits: number;
  createdAt: string;
};

/** Shared story composer for every membership role (and admin). */
export function storyPathForRole(
  _role?: string | null | undefined,
): string {
  return STORY_PATH;
}

export function isMembershipRoleId(value: string): value is MembershipRoleId {
  return MEMBERSHIP_ROLE_OPTIONS.some((entry) => entry.id === value);
}
