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
  status: z
    .string()
    .trim()
    .toLowerCase()
    .optional()
    .transform((v) => (v && v.length > 0 ? v : "published"))
    .pipe(
      z.enum(["draft", "published"], {
        message: 'status muss "draft" oder "published" sein.',
      }),
    ),
});

export type BlogApiFormFields = z.infer<typeof blogApiFormFieldsSchema>;

/** First Zod issue with field path for API clients (n8n). */
export function firstBlogApiFieldError(
  error: z.ZodError,
): string {
  const issue = error.issues[0];
  if (!issue) return "Angaben ungültig.";
  const path = issue.path.filter(Boolean).join(".");
  if (path && !issue.message.toLowerCase().includes(path)) {
    return `${path}: ${issue.message}`;
  }
  return issue.message || "Angaben ungültig.";
}
