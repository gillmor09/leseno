"use server";

/**
 * Admin CRUD for marketing blog posts (`leseno.blog_posts`).
 */

import { revalidatePath } from "next/cache";
import { denyUnlessAdmin } from "@/lib/auth/require-admin";
import {
  deleteBlogPost,
  listAllBlogPosts,
  upsertBlogPost,
} from "@/lib/blog/repository";
import type { BlogPost } from "@/lib/blog/types";
import type { ActionResult } from "@/lib/types/actions";
import {
  blogDeleteSchema,
  blogUpsertSchema,
  resolveBlogSlug,
} from "@/lib/validations/blog-admin";

function revalidateBlog(slug?: string) {
  revalidatePath("/admin/blog");
  revalidatePath("/blog");
  if (slug) revalidatePath(`/blog/${slug}`);
}

export async function loadBlogAdminWorkspaceAction(): Promise<
  ActionResult<{ posts: BlogPost[] }>
> {
  const denied = await denyUnlessAdmin();
  if (denied) return { success: false, error: denied };

  try {
    const posts = await listAllBlogPosts();
    return { success: true, data: { posts } };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Blog-Beiträge laden fehlgeschlagen.",
    };
  }
}

export async function saveBlogPostAction(
  input: unknown,
): Promise<ActionResult<{ post: BlogPost }>> {
  const denied = await denyUnlessAdmin();
  if (denied) return { success: false, error: denied };

  const raw =
    typeof input === "object" && input !== null
      ? (input as Record<string, unknown>)
      : {};
  const parsed = blogUpsertSchema.safeParse({
    ...raw,
    slug: resolveBlogSlug(
      String(raw.title ?? ""),
      String(raw.slug ?? ""),
    ),
  });
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Angaben ungültig.",
    };
  }

  try {
    const post = await upsertBlogPost({
      id: parsed.data.id ?? null,
      slug: parsed.data.slug,
      title: parsed.data.title,
      excerpt: parsed.data.excerpt,
      htmlBody: parsed.data.htmlBody,
      status: parsed.data.status,
      publishedAt: parsed.data.publishedAt ?? null,
    });
    revalidateBlog(post.slug);
    return { success: true, data: { post } };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Speichern fehlgeschlagen.";
    if (/unique|duplicate|slug/i.test(message)) {
      return { success: false, error: "Dieser Slug ist schon vergeben." };
    }
    return { success: false, error: message };
  }
}

export async function deleteBlogPostAction(
  input: unknown,
): Promise<ActionResult<{ deleted: boolean }>> {
  const denied = await denyUnlessAdmin();
  if (denied) return { success: false, error: denied };

  const parsed = blogDeleteSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Ungültige ID.",
    };
  }

  try {
    const deleted = await deleteBlogPost(parsed.data.id);
    if (!deleted) {
      return { success: false, error: "Beitrag wurde nicht gefunden." };
    }
    revalidateBlog();
    return { success: true, data: { deleted: true } };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Löschen fehlgeschlagen.",
    };
  }
}
