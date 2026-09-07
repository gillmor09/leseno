import "@/lib/validations/configure-zod";
import { z } from "zod";
import { PAID_MEMBERSHIP_PACKAGE_IDS } from "@/lib/stripe/config";

const packageIdSchema = z.enum(PAID_MEMBERSHIP_PACKAGE_IDS);

export const createPromoAdminSchema = z
  .object({
    code: z
      .string()
      .trim()
      .min(2, { message: "Code zu kurz." })
      .max(64)
      .regex(/^[a-zA-Z0-9_-]+$/, {
        message: "Nur Buchstaben, Zahlen, _ und -.",
      })
      .transform((value) => value.toLowerCase()),
    label: z.string().trim().min(1, { message: "Bezeichnung fehlt." }).max(120),
    discountKind: z.enum(["percent", "amount", "free"]),
    percentOff: z.number().min(1).max(100).nullable().optional(),
    amountOffEur: z.number().min(0.5).max(500).nullable().optional(),
    durationKind: z.enum(["once", "repeating", "forever"]),
    durationMonths: z.number().int().min(1).max(36).nullable().optional(),
    packageIds: z
      .array(packageIdSchema)
      .min(1, { message: "Mindestens ein Paket wählen." }),
    active: z.boolean().default(true),
    startsAt: z.string().nullable().optional(),
    endsAt: z.string().nullable().optional(),
    maxRedemptions: z.number().int().min(1).max(100_000).nullable().optional(),
    notes: z.string().trim().max(500).nullable().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.discountKind === "percent") {
      if (value.percentOff == null) {
        ctx.addIssue({
          code: "custom",
          message: "Prozent angeben.",
          path: ["percentOff"],
        });
      }
    }
    if (value.discountKind === "amount") {
      if (value.amountOffEur == null) {
        ctx.addIssue({
          code: "custom",
          message: "Betrag in € angeben.",
          path: ["amountOffEur"],
        });
      }
    }
    if (value.durationKind === "repeating") {
      if (value.durationMonths == null) {
        ctx.addIssue({
          code: "custom",
          message: "Anzahl Monate angeben.",
          path: ["durationMonths"],
        });
      }
    }
  });

export const updatePromoAdminSchema = z.object({
  id: z.string().uuid(),
  label: z.string().trim().min(1).max(120),
  packageIds: z.array(packageIdSchema).min(1),
  active: z.boolean(),
  startsAt: z.string().nullable().optional(),
  endsAt: z.string().nullable().optional(),
  maxRedemptions: z.number().int().min(1).max(100_000).nullable().optional(),
  notes: z.string().trim().max(500).nullable().optional(),
});

export const deletePromoAdminSchema = z.object({
  id: z.string().uuid("Ungültige Promo-ID."),
});
