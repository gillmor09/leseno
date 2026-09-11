import Link from "next/link";
import { formatBlogDate } from "@/lib/blog/format";
import type { BlogPostSummary } from "@/lib/blog/types";

/**
 * Card grid for published posts on /blog (modern index: title, excerpt, date).
 */
export function BlogPostList({ posts }: { posts: BlogPostSummary[] }) {
  if (posts.length === 0) {
    return (
      <div className="rounded-[1.75rem] bg-white p-8 text-center shadow-xl ring-1 ring-zinc-950/10 sm:p-10">
        <p className="text-base font-semibold text-zinc-600">
          Bald erscheinen hier Beiträge rund ums Lesen — mit Spaß und Neugier
          vorne, und dem Blick auf Menschen, Gesellschaft und kindliche
          Entwicklung.
        </p>
      </div>
    );
  }

  return (
    <ul className="grid gap-6 sm:grid-cols-2">
      {posts.map((post) => (
        <li key={post.id}>
          <article className="flex h-full flex-col rounded-[1.75rem] bg-white p-6 shadow-xl ring-1 ring-zinc-950/10 transition hover:ring-orange-700/25 sm:p-7">
            <time
              dateTime={post.publishedAt ?? post.updatedAt}
              className="text-xs font-extrabold tracking-wide text-orange-800 uppercase"
            >
              {formatBlogDate(post.publishedAt ?? post.updatedAt)}
            </time>
            <h2 className="mt-3 text-xl font-extrabold tracking-tight text-zinc-950">
              <Link
                href={`/blog/${post.slug}`}
                className="underline-offset-2 hover:text-orange-800 hover:underline"
              >
                {post.title}
              </Link>
            </h2>
            {post.excerpt.trim() ? (
              <p className="mt-3 flex-1 text-sm leading-relaxed text-zinc-600">
                {post.excerpt}
              </p>
            ) : (
              <div className="flex-1" />
            )}
            <Link
              href={`/blog/${post.slug}`}
              className="mt-5 inline-flex text-sm font-bold text-orange-800 underline-offset-2 hover:underline"
            >
              Weiterlesen
            </Link>
          </article>
        </li>
      ))}
    </ul>
  );
}
