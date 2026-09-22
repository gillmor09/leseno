/**
 * Next.js path revalidation for Roman / Sachbuch / Clever-erzählt admin modules.
 */

import { revalidatePath } from "next/cache";
import {
  ROMAN_ADMIN_MODULES,
  romanAdminPaths,
} from "@/lib/roman/admin-module";

/** Refresh list (+ optional detail) under all admin modules. */
export function revalidateRomanAdmin(romanId?: string) {
  for (const path of romanAdminPaths(romanId)) {
    revalidatePath(path);
  }
}

/** List indexes only (avoid remounting open workspace). */
export function revalidateRomanAdminLists() {
  for (const mod of Object.values(ROMAN_ADMIN_MODULES)) {
    revalidatePath(mod.basePath);
  }
}

/** KI-Rollen pages under all modules. */
export function revalidateRomanAdminRollen() {
  for (const mod of Object.values(ROMAN_ADMIN_MODULES)) {
    revalidatePath(`${mod.basePath}/rollen`);
  }
}
