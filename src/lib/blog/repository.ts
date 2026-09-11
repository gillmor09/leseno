/**
 * Loads/saves blog posts via service-role RPCs (`leseno.blog_posts`).
 */

import { sanitizeBlogHtml } from "@/lib/blog/sanitize-blog-html";
import type {
  BlogPost,
  BlogPostStatus,
  BlogPostSummary,
} from "@/lib/blog/types";
import { createServiceClient } from "@/lib/supabase/service";

type Row = {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  html_body?: string;
  status?: string;
  published_at: string | null;
  created_at?: string;
  updated_at: string;
};

function mapStatus(value: string | undefined): BlogPostStatus {
  return value === "published" ? "published" : "draft";
}

function mapPost(row: Row): BlogPost {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    excerpt: row.excerpt ?? "",
    htmlBody: row.html_body ?? "",
    status: mapStatus(row.status),
    publishedAt: row.published_at,
    createdAt: row.created_at ?? row.updated_at,
    updatedAt: row.updated_at,
  };
}

function mapSummary(row: Row): BlogPostSummary {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    excerpt: row.excerpt ?? "",
    publishedAt: row.published_at,
    updatedAt: row.updated_at,
  };
}

/** All posts for admin (draft + published). */
export async function listAllBlogPosts(): Promise<BlogPost[]> {
  const supabase = createServiceClient(null);
  const { data, error } = await supabase.rpc("admin_list_blog_posts");
  if (error) throw new Error(error.message);
  return ((data ?? []) as Row[]).map(mapPost);
}

/** Published posts for /blog index. */
export async function listPublishedBlogPosts(): Promise<BlogPostSummary[]> {
  const supabase = createServiceClient(null);
  const { data, error } = await supabase.rpc("list_published_blog_posts");
  if (error) throw new Error(error.message);
  return ((data ?? []) as Row[]).map(mapSummary);
}

/**
 * One published post by slug; HTML sanitized for display.
 * Returns null when missing or draft.
 */
export async function getPublishedBlogPostBySlug(
  slug: string,
): Promise<BlogPost | null> {
  const supabase = createServiceClient(null);
  const { data, error } = await supabase.rpc(
    "get_published_blog_post_by_slug",
    { p_slug: slug },
  );
  if (error) throw new Error(error.message);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;
  const post = mapPost(row as Row);
  return {
    ...post,
    htmlBody: sanitizeBlogHtml(post.htmlBody),
    status: "published",
  };
}

/** Create or update a post (admin). */
export async function upsertBlogPost(input: {
  id?: string | null;
  slug: string;
  title: string;
  excerpt: string;
  htmlBody: string;
  status: BlogPostStatus;
  /** When set, overrides `published_at` (backdating / corrections). */
  publishedAt?: string | null;
}): Promise<BlogPost> {
  const supabase = createServiceClient(null);
  const { data, error } = await supabase.rpc("admin_upsert_blog_post", {
    p_id: input.id ?? null,
    p_slug: input.slug,
    p_title: input.title,
    p_excerpt: input.excerpt,
    p_html_body: input.htmlBody,
    p_status: input.status,
    p_published_at: input.publishedAt ?? null,
  });
  if (error) throw new Error(error.message);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error("Beitrag konnte nicht gespeichert werden.");
  return mapPost(row as Row);
}

/** Delete a post by id (admin). */
export async function deleteBlogPost(id: string): Promise<boolean> {
  const supabase = createServiceClient(null);
  const { data, error } = await supabase.rpc("admin_delete_blog_post", {
    p_id: id,
  });
  if (error) throw new Error(error.message);
  return Boolean(data);
}
