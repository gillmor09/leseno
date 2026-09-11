import type { Metadata } from "next";
import { BlogPostList } from "@/components/features/blog/blog-post-list";
import { LandingFooter } from "@/components/features/landing/landing-footer";
import { AppHeader } from "@/components/features/landing/app-header";
import { listPublishedBlogPosts } from "@/lib/blog/repository";
import {
  buildPageMetadata,
  CANONICAL_SITE_ORIGIN,
} from "@/lib/seo";

export const metadata: Metadata = buildPageMetadata({
  title: "Blog: Lesen mit Spaß und Neugier",
  description:
    "Ein Blog rund ums Lesen — für Jung und Alt. Warum Lesen Menschen und Gesellschaft stärkt, wie Kinder wachsen, und warum Spaß und Neugier vorne stehen.",
  path: "/blog",
});

/** Refresh the index when posts change (also revalidated from admin actions). */
export const revalidate = 120;

function blogIndexJsonLd(posts: { title: string; slug: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "Blog",
    name: "Blog rund ums Lesen",
    url: `${CANONICAL_SITE_ORIGIN}/blog`,
    description:
      "Lesen für Jung und Alt: Spaß und Neugier zuerst — und warum Lesen für Menschen, Gesellschaft und kindliche Entwicklung zählt.",
    blogPost: posts.slice(0, 20).map((post) => ({
      "@type": "BlogPosting",
      headline: post.title,
      url: `${CANONICAL_SITE_ORIGIN}/blog/${post.slug}`,
    })),
  };
}

/**
 * Public blog index: modern card list aligned with leseno marketing tone.
 */
export default async function BlogIndexPage() {
  let posts: Awaited<ReturnType<typeof listPublishedBlogPosts>> = [];
  try {
    posts = await listPublishedBlogPosts();
  } catch (error) {
    console.error("[BlogIndexPage]", error);
  }

  const jsonLd = blogIndexJsonLd(posts);

  return (
    <div className="flex min-h-full flex-1 flex-col bg-gray-100">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <AppHeader />
      <main id="main" className="flex-1">
        <section className="relative overflow-hidden">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(234,88,12,0.10),_transparent_55%),linear-gradient(180deg,#fff7ed_0%,#f4f4f5_45%)]"
          />
          <div className="relative mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
            <p className="inline-flex items-center rounded-full bg-yellow-400 px-3 py-1 text-xs font-extrabold tracking-wide text-zinc-950 uppercase">
              Blog
            </p>
            <h1 className="mt-4 max-w-2xl text-4xl font-extrabold tracking-tight text-zinc-950 sm:text-5xl">
              Lesen mit Spaß und Neugier
            </h1>
            <p className="mt-4 max-w-2xl text-lg leading-relaxed text-zinc-700">
              Ein Blog rund ums Lesen — für Jung und Alt. Im Vordergrund stehen
              Freude und Entdeckerlust. Dahinter: warum Lesen Menschen und
              Gesellschaft stärkt und wie Kinder daran wachsen.
            </p>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 pb-16 sm:px-6 sm:pb-20">
          <BlogPostList posts={posts} />
        </section>
      </main>
      <LandingFooter />
    </div>
  );
}
