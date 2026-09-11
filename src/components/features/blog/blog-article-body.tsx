/**
 * Sanitized Quill HTML for a blog article body.
 * Size classes match Quill snow (`.ql-size-*`); tables/images via `.blog-html`.
 */

const ARTICLE_PROSE =
  "blog-html max-w-none text-base leading-relaxed text-zinc-700 " +
  "[&_h1]:mt-8 [&_h1]:mb-3 [&_h1]:text-2xl [&_h1]:font-extrabold [&_h1]:text-zinc-950 " +
  "[&_h2]:mt-8 [&_h2]:mb-3 [&_h2]:text-xl [&_h2]:font-extrabold [&_h2]:text-zinc-950 " +
  "[&_h3]:mt-6 [&_h3]:mb-2 [&_h3]:text-lg [&_h3]:font-extrabold [&_h3]:text-zinc-950 " +
  "[&_p]:mb-4 " +
  "[&_ul]:mb-4 [&_ul]:list-disc [&_ul]:pl-5 " +
  "[&_ol]:mb-4 [&_ol]:list-decimal [&_ol]:pl-5 " +
  "[&_li]:mb-1 " +
  "[&_a]:font-bold [&_a]:text-orange-800 [&_a]:underline-offset-2 hover:[&_a]:underline " +
  "[&_strong]:font-extrabold [&_strong]:text-zinc-900 " +
  "[&_.ql-size-small]:text-[0.75em] [&_.ql-size-large]:text-[1.5em] [&_.ql-size-huge]:text-[2.5em] " +
  "[&_img]:my-4 [&_img]:max-w-full [&_img]:h-auto [&_img]:rounded-lg " +
  "[&_table]:my-4 [&_table]:w-full [&_table]:border-collapse " +
  "[&_td]:border [&_td]:border-zinc-300 [&_td]:px-3 [&_td]:py-2 " +
  "[&_th]:border [&_th]:border-zinc-300 [&_th]:bg-zinc-100 [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:font-extrabold";

export function BlogArticleBody({ html }: { html: string }) {
  if (!html.trim()) {
    return (
      <p className="text-sm font-semibold text-zinc-500">
        Dieser Beitrag hat noch keinen Text.
      </p>
    );
  }

  return (
    <div
      className={ARTICLE_PROSE}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
