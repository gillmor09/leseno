/**
 * POST /api/blog/posts — create a blog article via multipart/form-data (n8n).
 *
 * Auth: `X-Api-Key: <BLOG_API_KEY>` (Bearer also accepted).
 *
 * Form fields: title, body, slug, image (file); optional excerpt, status.
 * Image is embedded as a data-URL `<img>` at the top of html_body (Quill-style).
 */

import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import {
  extractBlogApiKey,
  isValidBlogApiKey,
} from "@/lib/blog/api-auth";
import {
  BlogApiImageError,
  buildBlogHtmlFromUpload,
} from "@/lib/blog/build-html-from-api";
import { upsertBlogPost } from "@/lib/blog/repository";
import { blogApiFormFieldsSchema } from "@/lib/validations/blog-api";

export const runtime = "nodejs";
export const maxDuration = 60;

function revalidateBlog(slug: string) {
  revalidatePath("/admin/blog");
  revalidatePath("/blog");
  revalidatePath(`/blog/${slug}`);
}

function formString(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === "string" ? value : "";
}

export async function POST(request: Request) {
  if (!isValidBlogApiKey(extractBlogApiKey(request))) {
    return NextResponse.json(
      { error: "Ungültiger oder fehlender API-Key." },
      { status: 401 },
    );
  }

  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("multipart/form-data")) {
    return NextResponse.json(
      {
        error:
          "multipart/form-data erwartet (Felder: title, body, slug, image).",
      },
      { status: 400 },
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Form-Data konnte nicht gelesen werden." },
      { status: 400 },
    );
  }

  const parsed = blogApiFormFieldsSchema.safeParse({
    title: formString(form, "title"),
    excerpt: formString(form, "excerpt"),
    body: formString(form, "body"),
    slug: formString(form, "slug"),
    status: formString(form, "status") || undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: parsed.error.issues[0]?.message ?? "Angaben ungültig.",
      },
      { status: 400 },
    );
  }

  const imageEntry = form.get("image");
  if (!(imageEntry instanceof File) || imageEntry.size <= 0) {
    return NextResponse.json(
      { error: "Bild fehlt (image als Datei)." },
      { status: 400 },
    );
  }

  const data = parsed.data;
  let htmlBody: string;
  try {
    htmlBody = await buildBlogHtmlFromUpload({
      body: data.body,
      image: imageEntry,
      alt: data.title,
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
      slug: data.slug,
      title: data.title,
      excerpt: data.excerpt,
      htmlBody,
      status: data.status,
      publishedAt: null,
    });
    revalidateBlog(post.slug);
    return NextResponse.json(
      {
        success: true,
        id: post.id,
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
