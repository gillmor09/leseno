/**
 * Zod schema for POST /api/blog/posts.
 */

import "@/lib/validations/configure-zod";
import { z } from "zod";
import { resolveBlogSlug } from "@/lib/validations/blog-admin";

const slugOptionalSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$|^$/, {
    message: "Slug: nur a–z, 0–9 und Bindestriche.",
  })
  .optional()
  .default("");

export const blogApiCreateSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, { message: "Titel angeben." })
    .max(200),
  excerpt: z
    .string()
    .trim()
    .max(500, { message: "Kurzbeschreibung max. 500 Zeichen." })
    .default(""),
  body: z
    .string()
    .max(4_000_000, { message: "Artikeltext ist zu groß." })
    .default(""),
  image: z.object({
    base64: z.string().min(1, { message: "image.base64 angeben." }),
    mimeType: z.string().trim().max(64).optional(),
    alt: z.string().trim().max(200).optional(),
  }),
  slug: slugOptionalSchema,
  status: z.enum(["draft", "published"]).default("draft"),
  publishedAt: z
    .string()
    .datetime({ message: "Ungültiges Datum (ISO)." })
    .nullable()
    .optional(),
});

export type BlogApiCreateInput = z.infer<typeof blogApiCreateSchema>;

/** Resolve slug from optional field or title. */
export function resolveBlogApiSlug(title: string, slug: string): string {
  const resolved = resolveBlogSlug(title, slug);
  if (resolved.length < 2) {
    throw new Error("Slug konnte nicht aus dem Titel abgeleitet werden.");
  }
  return resolved;
}
