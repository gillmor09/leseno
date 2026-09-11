import "@/lib/validations/configure-zod";
import { z } from "zod";
import {
  HELP_PAGE_IDS,
  isValidHelpSlot,
  type HelpPageId,
} from "@/lib/help/catalog";

const helpPageIdSchema = z.enum(HELP_PAGE_IDS);

export const helpUpsertSchema = z
  .object({
    pageId: helpPageIdSchema,
    slotId: z
      .string()
      .trim()
      .min(1, { message: "Slot wählen." })
      .max(80),
    title: z
      .string()
      .trim()
      .min(1, { message: "Titel angeben." })
      .max(200),
    htmlBody: z.string().max(50_000),
  })
  .superRefine((value, ctx) => {
    if (!isValidHelpSlot(value.pageId as HelpPageId, value.slotId)) {
      ctx.addIssue({
        code: "custom",
        message: "Unbekannter Hilfe-Slot für diese Seite.",
        path: ["slotId"],
      });
    }
  });

export const helpPageIdParamSchema = z.object({
  pageId: helpPageIdSchema,
});
