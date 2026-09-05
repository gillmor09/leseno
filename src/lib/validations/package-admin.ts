/**
 * Zod schemas for membership package admin form saves.
 */

import { z } from "zod";
import {
  PACKAGE_FEATURE_IDS,
  USER_PACKAGE_IDS,
} from "@/lib/users/packages";

export const membershipPackagesFormSchema = z.object({
  packages: z
    .array(
      z.object({
        id: z.enum(USER_PACKAGE_IDS),
        label: z
          .string()
          .trim()
          .min(1, "Bezeichnung fehlt.")
          .max(80, "Bezeichnung ist zu lang."),
        priceEur: z.coerce
          .number()
          .min(0, "Preis muss ≥ 0 sein.")
          .max(9999, "Preis ist zu hoch."),
        credits: z.coerce
          .number()
          .int("Credits müssen ganzzahlig sein.")
          .min(0, "Credits müssen ≥ 0 sein.")
          .max(1_000_000, "Credits sind zu hoch."),
        features: z.array(z.enum(PACKAGE_FEATURE_IDS)),
        sortOrder: z.coerce.number().int().min(0).max(999),
      }),
    )
    .min(1),
});
