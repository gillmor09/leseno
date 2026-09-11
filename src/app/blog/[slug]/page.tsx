import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BlogArticleBody } from "@/components/features/blog/blog-article-body";
import { LandingFooter } from "@/components/features/landing/landing-footer";
import { AppHeader } from "@/components/features/landing/app-header";
import { formatBlogDate } from "@/lib/blog/format";
import {
  getPublishedBlogPostBySlug,
  listPublishedBlogPosts,
} from "@/lib/blog/repository";
import {
  buildPageMetadata,
  CANONICAL_SITE_ORIGIN,
  SITE_NAME,
} from "@/lib/seo";

type PageProps = {
  params: Promise<{ slug: string }>;
};

export const revalidate = 120;

export async function generateStaticParams() {
  try {
    const posts = await listPublishedBlogPosts();
    return posts.map((post) => ({ slug: post.slug }));
  } catch {
    return [];
  }
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  try {
    const post = await getPublishedBlogPostBySlug(slug);
    if (!post) {
      return buildPageMetadata({
        title: "Beitrag nicht gefunden",
        description: "Dieser Blog-Beitrag ist nicht verfügbar.",
        path: `/blog/${slug}`,
        index: false,
      });
    }
    const description =
      post.excerpt.trim() ||
      `${post.title} — Lesen mit Spaß und Neugier.`;
    return buildPageMetadata({
      title: post.title,
      description: description.slice(0, 160),
      path: `/blog/${post.slug}`,
    });
  } catch {
    return buildPageMetadata({
      title: "Blog",
      description: "Beitrag konnte nicht geladen werden.",
      path: `/blog/${slug}`,
      index: false,
    });
  }
}

/**
 * Public blog article: single H1, byline, prose body, back link.
 */
export default async function BlogArticlePage({ params }: PageProps) {
  const { slug } = await params;
  let post: Awaited<ReturnType<typeof getPublishedBlogPostBySlug>> = null;
  try {
    post = await getPublishedBlogPostBySlug(slug);
  } catch (error) {
    console.error("[BlogArticlePage]", error);
  }
  if (!post) notFound();

  const dateLabel = formatBlogDate(post.publishedAt ?? post.updatedAt);
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.excerpt || undefined,
    datePublished: post.publishedAt ?? post.updatedAt,
    dateModified: post.updatedAt,
    author: { "@type": "Organization", name: SITE_NAME },
    publisher: { "@type": "Organization", name: SITE_NAME },
    mainEntityOfPage: `${CANONICAL_SITE_ORIGIN}/blog/${post.slug}`,
    inLanguage: "de-DE",
  };

  return (
    <div className="flex min-h-full flex-1 flex-col bg-gray-100">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <AppHeader />
      <main id="main" className="flex-1">
        <article className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
          <p className="text-sm font-semibold text-zinc-500">
            <Link
              href="/blog"
              className="font-bold text-orange-800 underline-offset-2 hover:underline"
            >
              ← Zum Blog
            </Link>
          </p>
          <header className="mt-6">
            {dateLabel ? (
              <time
                dateTime={post.publishedAt ?? post.updatedAt}
                className="text-xs font-extrabold tracking-wide text-orange-800 uppercase"
              >
                {dateLabel}
              </time>
            ) : null}
            <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-zinc-950 sm:text-4xl lg:text-5xl lg:leading-[1.1]">
              {post.title}
            </h1>
            {post.excerpt.trim() ? (
              <p className="mt-4 text-lg leading-relaxed text-zinc-600">
                {post.excerpt}
              </p>
            ) : null}
          </header>

          <div className="mt-10 rounded-[1.75rem] bg-white p-6 shadow-xl ring-1 ring-zinc-950/10 sm:p-10">
            <BlogArticleBody html={post.htmlBody} />
          </div>

          <footer className="mt-10 flex flex-wrap items-center gap-3 border-t border-zinc-950/10 pt-8">
            <Link
              href="/blog"
              className="inline-flex rounded-full bg-white px-5 py-2.5 text-sm font-bold text-zinc-950 ring-1 ring-zinc-950/10 hover:bg-gray-50"
            >
              Weitere Beiträge
            </Link>
          </footer>
        </article>
      </main>
      <LandingFooter />
    </div>
  );
}
