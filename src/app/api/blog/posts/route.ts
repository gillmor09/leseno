/**
 * POST /api/blog/posts — create a blog article via JSON + API key.
 *
 * Auth: `Authorization: Bearer <BLOG_API_KEY>` or `X-Api-Key: <BLOG_API_KEY>`
 *
 * Example:
 * ```http
 * POST /api/blog/posts
 * Authorization: Bearer …
 * Content-Type: application/json
 *
 * {
 *   "title": "Mein Artikel",
 *   "excerpt": "Kurzbeschreibung",
 *   "body": "<p>Text…</p>",
 *   "image": { "base64": "…", "mimeType": "image/jpeg", "alt": "…" },
 *   "status": "published"
 * }
 * ```
 *
 * Hero image is a separate field and is prepended as a data-URL `<img>`
 * (same as Quill admin uploads — not Supabase Storage).
 */

import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import {
  extractBlogApiKey,
  isValidBlogApiKey,
} from "@/lib/blog/api-auth";
import {
  BlogApiImageError,
  buildBlogHtmlFromApi,
} from "@/lib/blog/build-html-from-api";
import { upsertBlogPost } from "@/lib/blog/repository";
import {
  blogApiCreateSchema,
  resolveBlogApiSlug,
} from "@/lib/validations/blog-api";

export const runtime = "nodejs";
export const maxDuration = 60;

function revalidateBlog(slug: string) {
  revalidatePath("/admin/blog");
  revalidatePath("/blog");
  revalidatePath(`/blog/${slug}`);
}

export async function POST(request: Request) {
  if (!isValidBlogApiKey(extractBlogApiKey(request))) {
    return NextResponse.json(
      { error: "Ungültiger oder fehlender API-Key." },
      { status: 401 },
    );
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json(
      { error: "JSON-Body erwartet." },
      { status: 400 },
    );
  }

  const parsed = blogApiCreateSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: parsed.error.issues[0]?.message ?? "Angaben ungültig.",
      },
      { status: 400 },
    );
  }

  const data = parsed.data;
  let slug: string;
  try {
    slug = resolveBlogApiSlug(data.title, data.slug ?? "");
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Slug ungültig.",
      },
      { status: 400 },
    );
  }

  let htmlBody: string;
  try {
    htmlBody = buildBlogHtmlFromApi({
      body: data.body,
      image: data.image,
    });
  } catch (error) {
    if (error instanceof BlogApiImageError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    }
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Artikeltext/Bild verarbeiten fehlgeschlagen.",
      },
      { status: 400 },
    );
  }

  try {
    const post = await upsertBlogPost({
      id: null,
      slug,
      title: data.title,
      excerpt: data.excerpt,
      htmlBody,
      status: data.status,
      publishedAt: data.publishedAt ?? null,
    });
    revalidateBlog(post.slug);
    return NextResponse.json(
      {
        id: post.id,
        slug: post.slug,
        title: post.title,
        status: post.status,
        url: `/blog/${post.slug}`,
      },
      { status: 201 },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Speichern fehlgeschlagen.";
    if (/unique|duplicate|slug/i.test(message)) {
      return NextResponse.json(
        { error: "Dieser Slug ist schon vergeben." },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
