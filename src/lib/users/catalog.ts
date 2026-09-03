/**
 * Canonical user roles for Leseno admin and membership handling.
 */

export const USER_ROLE_OPTIONS = [
  { id: "admin", label: "Admin" },
  { id: "guest", label: "Gast" },
  { id: "member_tier_1", label: "Mitglied - Stufe 1" },
  { id: "member_tier_2", label: "Mitglied - Stufe 2" },
  { id: "member_tier_3", label: "Mitglied - Stufe 3" },
] as const;

export type UserRoleId = (typeof USER_ROLE_OPTIONS)[number]["id"];

export type UserAdminRow = {
  userId: string;
  email: string;
  role: UserRoleId;
  createdAt: string;
};
