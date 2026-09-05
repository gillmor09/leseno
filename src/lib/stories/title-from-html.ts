/**
 * Helpers for the user story library (title extraction, list filters).
 */

/** Pull the first `<h1>` text from story HTML for list cards. */
export function titleFromStoryHtml(html: string): string {
  const match = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i);
  if (!match?.[1]) return "Ohne Titel";
  const text = match[1]
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, " ")
    .trim();
  return text || "Ohne Titel";
}
