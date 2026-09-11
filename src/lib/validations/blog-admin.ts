import "@/lib/validations/configure-zod";
import { z } from "zod";
import { slugifyBlogTitle } from "@/lib/blog/slug";

const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(2, { message: "Slug angeben (mind. 2 Zeichen)." })
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: "Slug: nur a–z, 0–9 und Bindestriche.",
  });

export const blogUpsertSchema = z.object({
  id: z.string().uuid().nullable().optional(),
  title: z
    .string()
    .trim()
    .min(1, { message: "Titel angeben." })
    .max(200),
  slug: slugSchema,
  excerpt: z.string().trim().max(500),
  // Base64 images inflate HTML quickly; keep under Next serverActions body limit.
  htmlBody: z.string().max(8_000_000, {
    message: "Artikeltext inkl. Bilder ist zu groß (max. ca. 8 MB).",
  }),
  status: z.enum(["draft", "published"]),
  /** Optional override for `published_at` (ISO). Empty/null keeps RPC defaults. */
  publishedAt: z
    .string()
    .datetime({ message: "Ungültiges Datum." })
    .nullable()
    .optional(),
});

export const blogDeleteSchema = z.object({
  id: z.string().uuid({ message: "Ungültige Beitrags-ID." }),
});

/** Prefer explicit slug; otherwise derive from title. */
export function resolveBlogSlug(title: string, slug: string): string {
  const trimmed = slug.trim().toLowerCase();
  if (trimmed) return trimmed;
  return slugifyBlogTitle(title);
}
