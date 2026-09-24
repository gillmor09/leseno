/**
 * Zod schema for POST /api/blog/posts (multipart/form-data from n8n).
 */

import "@/lib/validations/configure-zod";
import { z } from "zod";

/** Required URL slug: a–z, 0–9, hyphens (OpenAPI / n8n). */
const slugRequiredSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(2, { message: "Slug angeben (mind. 2 Zeichen)." })
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: "Slug: nur a–z, 0–9 und Bindestriche.",
  });

/**
 * Text fields from multipart form (image is validated separately as File).
 */
export const blogApiFormFieldsSchema = z.object({
  title: z.string().trim().min(1, { message: "Titel angeben." }),
  excerpt: z.string().trim().optional().default(""),
  body: z
    .string()
    .trim()
    .min(1, { message: "Artikeltext (body) angeben." })
    .max(4_000_000, { message: "Artikeltext ist zu groß." }),
  slug: slugRequiredSchema,
  status: z.enum(["draft", "published"]).optional().default("published"),
});

export type BlogApiFormFields = z.infer<typeof blogApiFormFieldsSchema>;
