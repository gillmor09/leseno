import type { Metadata } from "next";
import { BlogAdminForm } from "@/components/features/admin/blog-admin-form";
import { LandingFooter } from "@/components/features/landing/landing-footer";
import { AppHeader } from "@/components/features/landing/app-header";
import { listAllBlogPosts } from "@/lib/blog/repository";
import { hasServiceRoleConfig } from "@/lib/supabase/service";

export const metadata: Metadata = {
  title: "Blog — Leseno Admin",
  description: "Blog-Beiträge erstellen, bearbeiten und veröffentlichen.",
};

/**
 * Admin: Quill-editable marketing blog posts for /blog.
 */
export default async function BlogAdminPage() {
  let posts: Awaited<ReturnType<typeof listAllBlogPosts>> = [];
  let canSave = false;
  let readOnlyNotice: string | undefined =
    "Vorschau: Beiträge konnten nicht geladen werden. Bitte Migration `20260911140000_blog_posts.sql` ausführen.";

  try {
    posts = await listAllBlogPosts();
    canSave = hasServiceRoleConfig();
    if (!canSave) {
      readOnlyNotice =
        "Vorschau: `SUPABASE_SERVICE_ROLE_KEY` fehlt. Bitte `.env.local` prüfen.";
    } else {
      readOnlyNotice = undefined;
    }
  } catch (error) {
    if (!hasServiceRoleConfig()) {
      readOnlyNotice =
        "Vorschau: `SUPABASE_SERVICE_ROLE_KEY` fehlt. Bitte `.env.local` prüfen.";
    } else {
      const message =
        error instanceof Error ? error.message : "Blog nicht verfügbar.";
      readOnlyNotice = `Vorschau: ${message}`;
    }
  }

  return (
    <div className="flex min-h-full flex-1 flex-col bg-gray-100">
      <AppHeader />
      <main id="main" className="flex-1">
        <section className="mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-14">
          <p className="inline-flex items-center rounded-full bg-yellow-400 px-3 py-1 text-xs font-extrabold tracking-wide text-zinc-950 uppercase">
            Admin
          </p>
          <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-zinc-950 sm:text-4xl">
            Blog
          </h1>
          <p className="mt-3 max-w-3xl text-base leading-relaxed text-zinc-600">
            Beiträge rund ums Lesen: Spaß und Neugier zuerst, dazu Bedeutung für
            Menschen, Gesellschaft und kindliche Entwicklung. Mit Quill
            schreiben — veröffentlichte Artikel erscheinen unter /blog.
          </p>
          <div className="mt-8">
            <BlogAdminForm
              initialPosts={posts}
              canSave={canSave}
              readOnlyNotice={canSave ? undefined : readOnlyNotice}
            />
          </div>
        </section>
      </main>
      <LandingFooter />
    </div>
  );
}
