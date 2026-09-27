/**
 * Revalidate Sachbuch admin paths after mutations.
 */

import { revalidatePath } from "next/cache";

export function revalidateSachbuchAdmin(sachbuchId?: string) {
  revalidatePath("/admin/sachbuch");
  if (sachbuchId) {
    revalidatePath(`/admin/sachbuch/${sachbuchId}`);
  }
}
