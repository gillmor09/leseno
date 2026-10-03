/**
 * Zod schemas for Buch-der-Woche admin Server Actions.
 */

import { z } from "zod";

export const buchDerWocheSaveSchema = z.object({
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Ungültiger Slug."),
  romanId: z.string().uuid("Roman-ID ungültig."),
  teaserHeadline: z.string().trim().max(160),
  teaserLead: z.string().trim().max(400),
  setCurrent: z.boolean().optional(),
});

export const buchDerWocheSetCurrentSchema = z.object({
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Ungültiger Slug."),
});

export const buchDerWocheGenerateIgSchema = z.object({
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Ungültiger Slug."),
});

export const buchDerWocheSaveIgSchema = z.object({
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Ungültiger Slug."),
  igImageDataUrl: z.string().trim().min(32),
  igCaption: z.string().trim().max(2200),
});
