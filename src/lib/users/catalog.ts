/**
 * Canonical user roles: admin + one role per membership story page.
 * Page access is 1:1 (`basis` → `/basis`, `paket1` → `/paket1`, …).
 */

export const USER_ROLE_OPTIONS = [
  { id: "admin", label: "Admin" },
  { id: "basis", label: "Basis", path: "/basis" },
  { id: "paket1", label: "Paket 1", path: "/paket1" },
  { id: "paket2", label: "Paket 2", path: "/paket2" },
  { id: "paket3", label: "Paket 3", path: "/paket3" },
] as const;

export type UserRoleId = (typeof USER_ROLE_OPTIONS)[number]["id"];

export const MEMBERSHIP_ROLE_OPTIONS = [
  { id: "basis", label: "Basis", path: "/basis" },
  { id: "paket1", label: "Paket 1", path: "/paket1" },
  { id: "paket2", label: "Paket 2", path: "/paket2" },
  { id: "paket3", label: "Paket 3", path: "/paket3" },
] as const;

export type MembershipRoleId = (typeof MEMBERSHIP_ROLE_OPTIONS)[number]["id"];

export type UserAdminRow = {
  userId: string;
  email: string;
  role: UserRoleId;
  credits: number;
  createdAt: string;
};

/** Story route for a membership role; defaults to `/basis` for admin / unknown. */
export function storyPathForRole(
  role: string | null | undefined,
): string {
  const match = MEMBERSHIP_ROLE_OPTIONS.find((entry) => entry.id === role);
  return match?.path ?? "/basis";
}

export function isMembershipRoleId(value: string): value is MembershipRoleId {
  return MEMBERSHIP_ROLE_OPTIONS.some((entry) => entry.id === value);
}
