/**
 * Blog post types for admin CRUD and public /blog pages.
 */

export type BlogPostStatus = "draft" | "published";

export type BlogPost = {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  htmlBody: string;
  status: BlogPostStatus;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

/** List card / index row (no full HTML body). */
export type BlogPostSummary = {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  publishedAt: string | null;
  updatedAt: string;
};
