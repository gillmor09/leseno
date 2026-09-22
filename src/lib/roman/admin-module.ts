/**
 * Admin pipeline modules: Roman (Belletristik), Sachbuch, Clever erzählt.
 * Same UI/workspace; buchTyp is fixed per module (no typ picker).
 */

import type { RomanBuchTyp } from "@/lib/roman/editorial";

export type RomanAdminModuleId = "roman" | "sachbuch" | "clever_erzaehlt";

export type RomanAdminModule = {
  id: RomanAdminModuleId;
  /** Nav / page heading */
  label: string;
  /** Fixed editorial.buchTyp for this module */
  buchTyp: Exclude<RomanBuchTyp, "unbekannt" | "serie_welt">;
  basePath: string;
  /** Singular noun for UI copy (list empty state, delete, …) */
  itemLabel: string;
  /** Plural for “Alle …” links */
  itemLabelPlural: string;
};

export const ROMAN_ADMIN_MODULES: Record<
  RomanAdminModuleId,
  RomanAdminModule
> = {
  roman: {
    id: "roman",
    label: "Roman",
    buchTyp: "belletristik",
    basePath: "/admin/roman",
    itemLabel: "Roman",
    itemLabelPlural: "Romane",
  },
  sachbuch: {
    id: "sachbuch",
    label: "Sachbuch",
    buchTyp: "sachbuch",
    basePath: "/admin/sachbuch",
    itemLabel: "Sachbuch",
    itemLabelPlural: "Sachbücher",
  },
  clever_erzaehlt: {
    id: "clever_erzaehlt",
    label: "Clever erzählt",
    buchTyp: "clever_erzaehlt",
    basePath: "/admin/clever-erzaehlt",
    itemLabel: "Buch",
    itemLabelPlural: "Bücher",
  },
};

export function getRomanAdminModule(
  id: RomanAdminModuleId,
): RomanAdminModule {
  return ROMAN_ADMIN_MODULES[id];
}

/** Which module owns a stored buchTyp (legacy unknown → Roman). */
export function adminModuleForBuchTyp(
  buchTyp: RomanBuchTyp | null | undefined,
): RomanAdminModuleId {
  if (buchTyp === "sachbuch") return "sachbuch";
  if (buchTyp === "clever_erzaehlt") return "clever_erzaehlt";
  return "roman";
}

/** List filter: each module shows only its buchTyp (Roman = everything else). */
export function matchesAdminModule(
  buchTyp: RomanBuchTyp | null | undefined,
  moduleId: RomanAdminModuleId,
): boolean {
  return adminModuleForBuchTyp(buchTyp) === moduleId;
}

/** Revalidate all module trees after shared CRUD / pipeline writes. */
export function romanAdminPaths(romanId?: string): string[] {
  const bases = Object.values(ROMAN_ADMIN_MODULES).map((m) => m.basePath);
  if (!romanId) return bases;
  return [
    ...bases,
    ...bases.map((base) => `${base}/${romanId}`),
    ...bases.map((base) => `${base}/rollen`),
  ];
}
